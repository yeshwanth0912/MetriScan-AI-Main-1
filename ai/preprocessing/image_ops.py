"""Image quality gating and preprocessing.

The quality gate exists so the system can say "this photograph is not good
enough to judge" instead of producing a confident reading of an unreadable
package. A rejected image is a retake prompt, never a compliance failure.
"""

from __future__ import annotations

from dataclasses import dataclass, field as dc_field
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

# Thresholds are deployment tuning parameters, not legal ones. Re-fit them on
# the photographs your officers actually take before trusting the gate.
BLUR_FLOOR = 100.0          # variance of Laplacian
BRIGHTNESS_RANGE = (55, 205)
CONTRAST_FLOOR = 35.0       # standard deviation of luminance
MIN_LONG_EDGE_PX = 900


@dataclass
class QualityReport:
    score: float
    usable: bool
    blur_variance: float
    brightness: float
    contrast: float
    width: int
    height: int
    warnings: List[str] = dc_field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "score": round(self.score, 3),
            "usable": self.usable,
            "blur_variance": round(self.blur_variance, 2),
            "brightness": round(self.brightness, 2),
            "contrast": round(self.contrast, 2),
            "width": self.width,
            "height": self.height,
            "warnings": list(self.warnings),
        }


def load_image(path: str):
    image = cv2.imread(path, cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Could not read an image at {path}")
    return image


def assess_quality(image) -> QualityReport:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    height, width = gray.shape[:2]

    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    contrast = float(gray.std())
    long_edge = max(width, height)

    warnings: List[str] = []
    if blur < BLUR_FLOOR:
        warnings.append("The image is out of focus. Hold steady and retake it.")
    if brightness < BRIGHTNESS_RANGE[0]:
        warnings.append("The image is too dark. Add light or move away from shadow.")
    elif brightness > BRIGHTNESS_RANGE[1]:
        warnings.append("The image is overexposed. Move out of direct glare and retake it.")
    if contrast < CONTRAST_FLOOR:
        warnings.append("Text contrast is low. Photograph the panel straight on, filling the frame.")
    if long_edge < MIN_LONG_EDGE_PX:
        warnings.append(f"Resolution is {width}x{height}. Small print needs a longer edge of at least {MIN_LONG_EDGE_PX} px.")

    # Each signal contributes a bounded sub-score; the weakest one dominates.
    sub_scores = [
        min(1.0, blur / (BLUR_FLOOR * 2)),
        1.0 - min(1.0, abs(brightness - 130) / 130),
        min(1.0, contrast / (CONTRAST_FLOOR * 2)),
        min(1.0, long_edge / (MIN_LONG_EDGE_PX * 1.5)),
    ]
    score = float(np.mean(sub_scores) * 0.6 + min(sub_scores) * 0.4)

    return QualityReport(
        score=score,
        usable=not any(w.startswith(("The image is out of focus", "The image is too dark")) for w in warnings),
        blur_variance=blur,
        brightness=brightness,
        contrast=contrast,
        width=width,
        height=height,
        warnings=warnings,
    )


def deskew(image, max_angle: float = 15.0):
    """Rotate the image so printed text runs horizontally."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    edges = cv2.Canny(gray, 60, 180)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=120,
                            minLineLength=max(60, gray.shape[1] // 6), maxLineGap=12)
    if lines is None:
        return image, 0.0

    angles = []
    for x1, y1, x2, y2 in lines.reshape(-1, 4):
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if abs(angle) <= max_angle:
            angles.append(angle)
    if not angles:
        return image, 0.0

    angle = float(np.median(angles))
    if abs(angle) < 0.3:
        return image, 0.0

    h, w = image.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    rotated = cv2.warpAffine(image, matrix, (w, h),
                             flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return rotated, angle


def enhance(image):
    """Denoise and lift local contrast so small print survives OCR."""
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_channel = clahe.apply(l_channel)
    merged = cv2.cvtColor(cv2.merge((l_channel, a_channel, b_channel)), cv2.COLOR_LAB2BGR)

    denoised = cv2.bilateralFilter(merged, d=7, sigmaColor=45, sigmaSpace=45)
    blurred = cv2.GaussianBlur(denoised, (0, 0), 2.0)
    return cv2.addWeighted(denoised, 1.5, blurred, -0.5, 0)


def upscale_if_small(image, min_long_edge: int = 1400):
    h, w = image.shape[:2]
    long_edge = max(h, w)
    if long_edge >= min_long_edge:
        return image, 1.0
    factor = min_long_edge / long_edge
    resized = cv2.resize(image, (int(w * factor), int(h * factor)), interpolation=cv2.INTER_CUBIC)
    return resized, factor


def detect_panel_bbox(image) -> Optional[Tuple[int, int, int, int]]:
    """Find the pack outline so a declared physical size can be turned into a scale.

    Returns [x1, y1, x2, y2] of the largest quadrilateral-ish contour, or None
    when the pack cannot be separated from the background.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 40, 140)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=2)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    frame_area = image.shape[0] * image.shape[1]
    largest = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest)
    # Reject a contour that is either a speck or the whole frame border.
    if area < frame_area * 0.15 or area > frame_area * 0.98:
        return None
    x, y, w, h = cv2.boundingRect(largest)
    return (x, y, x + w, y + h)


def preprocess(image) -> Dict[str, Any]:
    """Full preprocessing chain. Returns the processed image plus what changed."""
    working, scale_factor = upscale_if_small(image)
    working, angle = deskew(working)
    working = enhance(working)
    return {
        "image": working,
        "steps": {
            "upscale_factor": round(scale_factor, 3),
            "deskew_angle_deg": round(angle, 2),
            "clahe": True,
            "bilateral_denoise": True,
            "unsharp_mask": True,
        },
        "panel_bbox": detect_panel_bbox(working),
    }
