"""Physical measurement of printed characters.

The Legal Metrology rules express readability as a *physical* minimum height for
letters and numerals, keyed to the area of the principal display panel. OCR
confidence cannot answer that question — it says whether the machine could read
the text, not how tall the text is in millimetres.

To measure height in millimetres we need a pixel-to-millimetre scale. There is
no way to recover one from an unaided photograph, so this module supports three
sources and refuses to guess when none is available:

1. ``DECLARED_PANEL``  - the officer enters the physical width/height of the
   principal display panel; scale is derived from its detected pixel box.
2. ``FIDUCIAL_MARKER`` - a printed ArUco marker of known side length is placed
   in the frame; scale is derived from the detected marker.
3. ``REFERENCE_OBJECT``- an object of known width (a ruler, a standard card) is
   placed in the frame and its pixel width supplied.

When no scale source is present the result is ``UNMEASURABLE`` and the rule
engine must return NOT_APPLICABLE or REVIEW. It must never return FAIL, because
an unmeasured character is not a proven short character.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence

try:  # OpenCV/numpy are only needed for ink-based glyph measurement.
    import cv2
    import numpy as np
    _CV_AVAILABLE = True
except Exception:  # pragma: no cover - exercised on installs without OpenCV
    cv2 = None
    np = None
    _CV_AVAILABLE = False


class ScaleSource(str, Enum):
    DECLARED_PANEL = "DECLARED_PANEL"
    FIDUCIAL_MARKER = "FIDUCIAL_MARKER"
    REFERENCE_OBJECT = "REFERENCE_OBJECT"
    NONE = "NONE"


@dataclass
class ScaleEstimate:
    px_per_mm: Optional[float]
    source: ScaleSource
    confidence: float = 0.0
    detail: str = ""

    @property
    def usable(self) -> bool:
        return self.px_per_mm is not None and self.px_per_mm > 0

    def as_dict(self) -> dict:
        return {
            "px_per_mm": round(self.px_per_mm, 4) if self.px_per_mm else None,
            "source": self.source.value,
            "confidence": round(self.confidence, 3),
            "detail": self.detail,
        }


@dataclass
class HeightMeasurement:
    field_name: str
    status: str                       # MEASURED | UNMEASURABLE
    height_mm: Optional[float] = None
    height_px: Optional[float] = None
    method: str = ""
    scale: Optional[Dict[str, Any]] = None
    confidence: float = 0.0
    detail: str = ""

    def as_dict(self) -> dict:
        return {
            "field_name": self.field_name,
            "status": self.status,
            "height_mm": round(self.height_mm, 3) if self.height_mm is not None else None,
            "height_px": round(self.height_px, 2) if self.height_px is not None else None,
            "method": self.method,
            "scale": self.scale,
            "confidence": round(self.confidence, 3),
            "detail": self.detail,
        }


# --------------------------------------------------------------------------
# Scale estimation
# --------------------------------------------------------------------------

def scale_from_declared_panel(
    panel_bbox_px: Sequence[float],
    panel_width_mm: float,
    panel_height_mm: float,
) -> ScaleEstimate:
    """Derive px/mm from a detected panel box and its declared physical size."""
    if not panel_bbox_px or panel_width_mm <= 0 or panel_height_mm <= 0:
        return ScaleEstimate(None, ScaleSource.NONE, 0.0, "Panel dimensions not supplied.")

    px_w = abs(panel_bbox_px[2] - panel_bbox_px[0])
    px_h = abs(panel_bbox_px[3] - panel_bbox_px[1])
    if px_w <= 0 or px_h <= 0:
        return ScaleEstimate(None, ScaleSource.NONE, 0.0, "Panel bounding box is degenerate.")

    scale_w = px_w / panel_width_mm
    scale_h = px_h / panel_height_mm
    mean = (scale_w + scale_h) / 2.0

    # Large disagreement between the two axes means the shot is skewed or the
    # declared dimensions do not match the panel actually detected.
    disagreement = abs(scale_w - scale_h) / mean if mean else 1.0
    confidence = max(0.0, 1.0 - disagreement * 2.5)
    detail = (
        f"Horizontal {scale_w:.2f} px/mm, vertical {scale_h:.2f} px/mm, "
        f"disagreement {disagreement * 100:.1f}%."
    )
    if disagreement > 0.25:
        detail += " Axis disagreement is high; re-shoot square to the panel."
    return ScaleEstimate(mean, ScaleSource.DECLARED_PANEL, confidence, detail)


def scale_from_reference_object(
    object_width_px: float, object_width_mm: float
) -> ScaleEstimate:
    if object_width_px <= 0 or object_width_mm <= 0:
        return ScaleEstimate(None, ScaleSource.NONE, 0.0, "Reference object not supplied.")
    return ScaleEstimate(
        object_width_px / object_width_mm,
        ScaleSource.REFERENCE_OBJECT,
        0.85,
        f"Reference object {object_width_mm} mm wide spans {object_width_px:.0f} px.",
    )


def scale_from_aruco(image, marker_side_mm: float, dictionary_id: int = 0) -> ScaleEstimate:
    """Detect a printed ArUco marker and derive px/mm from its side length."""
    if not _CV_AVAILABLE:
        return ScaleEstimate(None, ScaleSource.NONE, 0.0, "OpenCV is not installed.")
    if image is None or marker_side_mm <= 0:
        return ScaleEstimate(None, ScaleSource.NONE, 0.0, "No image or marker size supplied.")
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
        aruco_dict = cv2.aruco.getPredefinedDictionary(dictionary_id)
        detector = cv2.aruco.ArucoDetector(aruco_dict, cv2.aruco.DetectorParameters())
        corners, ids, _ = detector.detectMarkers(gray)
        if ids is None or len(corners) == 0:
            return ScaleEstimate(None, ScaleSource.NONE, 0.0, "No fiducial marker found in frame.")
        pts = corners[0].reshape(4, 2)
        sides = [float(np.linalg.norm(pts[i] - pts[(i + 1) % 4])) for i in range(4)]
        mean_side = sum(sides) / 4.0
        spread = (max(sides) - min(sides)) / mean_side if mean_side else 1.0
        return ScaleEstimate(
            mean_side / marker_side_mm,
            ScaleSource.FIDUCIAL_MARKER,
            max(0.0, 1.0 - spread * 2.0),
            f"Marker id {int(ids[0][0])}, mean side {mean_side:.1f} px, skew {spread * 100:.1f}%.",
        )
    except Exception as exc:  # pragma: no cover - depends on OpenCV build
        return ScaleEstimate(None, ScaleSource.NONE, 0.0, f"Marker detection failed: {exc}")


# --------------------------------------------------------------------------
# Character height measurement
# --------------------------------------------------------------------------

def _ink_height_px(image, bbox: Sequence[float]) -> Optional[float]:
    """Measure the inked rows inside a bounding box.

    An OCR box includes padding, ascenders and descenders, so it overstates
    character height. Binarising the crop and measuring the rows that actually
    contain ink gives a much closer estimate of printed letter height.
    """
    if not _CV_AVAILABLE or image is None:
        return None
    x1, y1, x2, y2 = [int(round(v)) for v in bbox]
    x1, y1 = max(x1, 0), max(y1, 0)
    x2, y2 = min(x2, image.shape[1]), min(y2, image.shape[0])
    if x2 - x1 < 3 or y2 - y1 < 3:
        return None

    crop = image[y1:y2, x1:x2]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.ndim == 3 else crop
    # Otsu on the crop; invert so ink is white regardless of print polarity.
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if binary.mean() > 127:
        binary = 255 - binary

    row_ink = (binary > 0).sum(axis=1)
    if row_ink.max() == 0:
        return None
    # Rows carrying at least 8% of the peak ink count as part of the glyph body.
    threshold = max(1.0, row_ink.max() * 0.08)
    rows = np.flatnonzero(row_ink >= threshold)
    if rows.size == 0:
        return None
    return float(rows[-1] - rows[0] + 1)


def measure_field_height(
    field_name: str,
    bbox: Sequence[float],
    scale: ScaleEstimate,
    image=None,
) -> HeightMeasurement:
    """Measure the printed height of one declaration in millimetres."""
    if not scale.usable:
        return HeightMeasurement(
            field_name=field_name,
            status="UNMEASURABLE",
            method="none",
            scale=scale.as_dict(),
            detail=(
                "No pixel-to-millimetre scale available. Supply the panel "
                "dimensions, include a fiducial marker, or photograph a "
                "reference object alongside the pack."
            ),
        )

    ink_px = _ink_height_px(image, bbox) if image is not None else None
    if ink_px is not None:
        height_px, method, method_conf = ink_px, "ink_rows", 0.9
    else:
        height_px = abs(bbox[3] - bbox[1])
        # A bounding box typically overshoots glyph height; the factor below is
        # a calibration constant, not a legal figure. Re-fit it on your own
        # dataset before relying on borderline results.
        height_px *= 0.72
        method, method_conf = "bbox_estimate", 0.55

    return HeightMeasurement(
        field_name=field_name,
        status="MEASURED",
        height_mm=height_px / scale.px_per_mm,
        height_px=height_px,
        method=method,
        scale=scale.as_dict(),
        confidence=min(scale.confidence, method_conf),
        detail=f"Measured by {method} at {scale.px_per_mm:.2f} px/mm.",
    )


def panel_area_cm2(panel_width_mm: float, panel_height_mm: float) -> Optional[float]:
    """Principal display panel area in square centimetres."""
    if panel_width_mm <= 0 or panel_height_mm <= 0:
        return None
    return (panel_width_mm * panel_height_mm) / 100.0


def build_scale(context: Dict[str, Any], image=None) -> ScaleEstimate:
    """Choose the best available scale source from inspection context."""
    marker_mm = context.get("fiducial_marker_side_mm")
    if marker_mm and image is not None:
        est = scale_from_aruco(image, float(marker_mm))
        if est.usable:
            return est

    ref_px = context.get("reference_object_width_px")
    ref_mm = context.get("reference_object_width_mm")
    if ref_px and ref_mm:
        est = scale_from_reference_object(float(ref_px), float(ref_mm))
        if est.usable:
            return est

    panel_bbox = context.get("panel_bbox_px")
    w_mm = context.get("panel_width_mm")
    h_mm = context.get("panel_height_mm")
    if panel_bbox and w_mm and h_mm:
        est = scale_from_declared_panel(panel_bbox, float(w_mm), float(h_mm))
        if est.usable:
            return est

    return ScaleEstimate(None, ScaleSource.NONE, 0.0, "No scale reference supplied for this inspection.")


def measure_all(
    fields: Dict[str, Any],
    context: Dict[str, Any],
    image=None,
) -> Dict[str, Dict[str, Any]]:
    """Measure every extracted field that carries a bounding box."""
    scale = build_scale(context, image)
    out: Dict[str, Dict[str, Any]] = {}
    for name, fld in fields.items():
        evidence = fld.evidence if hasattr(fld, "evidence") else fld.get("evidence")
        if not evidence or not evidence.get("bbox"):
            continue
        out[name] = measure_field_height(name, evidence["bbox"], scale, image).as_dict()
    return out
