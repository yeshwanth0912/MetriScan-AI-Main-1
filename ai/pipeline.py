"""End-to-end analysis: images in, structured declarations and rule results out.

This is the module the blueprint calls the "first technical milestone" — it
runs without a database, a web server or a browser, so it can be tested on its
own and wired into FastAPI afterwards.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field as dc_field
from datetime import date
from typing import Any, Dict, List, Optional, Sequence

from ai.extraction.fields import TextBlock, extract_all
from ai.normalization.units import normalize_price
from rules.engine import RuleRepository, default_repository, evaluate

# Optional heavy dependencies. The pipeline degrades to text-only analysis
# (pasted e-commerce listings, fixture OCR) when they are absent.
try:
    from ai.preprocessing import image_ops
    from ai.metrology import font_size
    _VISION = True
except Exception:  # pragma: no cover
    image_ops = None
    font_size = None
    _VISION = False


PANEL_BY_IMAGE_TYPE = {
    "front": "principal",
    "principal": "principal",
    "back": "other",
    "side": "other",
    "top": "other",
    "bottom": "other",
    "listing": "listing",
}


@dataclass
class ImageInput:
    image_id: str
    path: Optional[str] = None
    image_type: str = "front"          # front | back | side | listing
    array: Any = None                  # pre-loaded ndarray, used by tests

    @property
    def panel(self) -> str:
        return PANEL_BY_IMAGE_TYPE.get(self.image_type.lower(), "unknown")


@dataclass
class AnalysisResult:
    inspection_id: str
    status: str
    review_required: bool
    fields: Dict[str, Any]
    rule_results: List[Dict[str, Any]]
    violations: List[Dict[str, Any]]
    counts: Dict[str, int]
    highest_severity: Optional[str]
    images: List[Dict[str, Any]] = dc_field(default_factory=list)
    measurements: Dict[str, Any] = dc_field(default_factory=dict)
    ocr_blocks: List[Dict[str, Any]] = dc_field(default_factory=list)
    engine: Dict[str, Any] = dc_field(default_factory=dict)
    warnings: List[str] = dc_field(default_factory=list)
    unverified_rules: List[str] = dc_field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "inspection_id": self.inspection_id,
            "status": self.status,
            "review_required": self.review_required,
            "counts": self.counts,
            "highest_severity": self.highest_severity,
            "fields": self.fields,
            "rule_results": self.rule_results,
            "violations": self.violations,
            "images": self.images,
            "measurements": self.measurements,
            "ocr_blocks": self.ocr_blocks,
            "engine": self.engine,
            "warnings": self.warnings,
            "unverified_rules": self.unverified_rules,
        }


def analyze(
    inspection_id: str,
    images: Sequence[ImageInput] = (),
    context: Optional[Dict[str, Any]] = None,
    ocr_engine=None,
    repository: Optional[RuleRepository] = None,
    listing_text: Optional[str] = None,
    inspection_date: Optional[date] = None,
    processed_dir: Optional[str] = None,
) -> AnalysisResult:
    """Analyse one inspection.

    ``images`` may be empty when ``listing_text`` is supplied — that is the
    e-commerce path, where the declarations arrive as text from a product
    listing rather than from a photograph.
    """
    ctx: Dict[str, Any] = dict(context or {})
    repo = repository or default_repository()
    warnings: List[str] = []
    all_blocks: List[TextBlock] = []
    image_reports: List[Dict[str, Any]] = []
    processed_images: Dict[str, Any] = {}

    # ---------------- image path ----------------
    if images and _VISION:
        engine = ocr_engine or _lazy_engine()
        for item in images:
            report: Dict[str, Any] = {"image_id": item.image_id, "image_type": item.image_type}
            try:
                raw = item.array if item.array is not None else image_ops.load_image(item.path)
            except Exception as exc:
                report.update({"status": "FAILED", "error": str(exc)})
                warnings.append(f"Image {item.image_id} could not be read: {exc}")
                image_reports.append(report)
                continue

            quality = image_ops.assess_quality(raw)
            report["quality"] = quality.as_dict()
            if not quality.usable:
                report["status"] = "REJECTED"
                warnings.extend(quality.warnings)
                image_reports.append(report)
                continue

            prepared = image_ops.preprocess(raw)
            processed = prepared["image"]
            processed_images[item.image_id] = processed
            report["preprocessing"] = prepared["steps"]
            report["panel_bbox"] = list(prepared["panel_bbox"]) if prepared["panel_bbox"] else None

            if processed_dir:
                os.makedirs(processed_dir, exist_ok=True)
                out_path = os.path.join(processed_dir, f"{item.image_id}.jpg")
                try:
                    import cv2
                    cv2.imwrite(out_path, processed)
                    report["processed_path"] = out_path
                except Exception:
                    pass

            # The principal panel box feeds the pixel-to-millimetre scale.
            if item.panel == "principal" and prepared["panel_bbox"] and "panel_bbox_px" not in ctx:
                ctx["panel_bbox_px"] = list(prepared["panel_bbox"])

            blocks = engine.read(processed, image_id=item.image_id, panel=item.panel)
            report["status"] = "ANALYSED"
            report["blocks_found"] = len(blocks)
            if not blocks:
                warnings.append(f"OCR returned no text for image {item.image_id}.")
            all_blocks.extend(blocks)
            image_reports.append(report)

        engine_info = {"ocr_engine": engine.name, "ocr_version": getattr(engine, "version", "unknown")}
    elif images and not _VISION:
        warnings.append("OpenCV is not installed, so image analysis was skipped.")
        engine_info = {"ocr_engine": "unavailable", "ocr_version": "0"}
    else:
        engine_info = {"ocr_engine": "text_input", "ocr_version": "1"}

    # ---------------- listing text path ----------------
    if listing_text:
        ctx.setdefault("channel", "ecommerce")
        for i, line in enumerate(l for l in listing_text.splitlines() if l.strip()):
            all_blocks.append(TextBlock(
                text=line.strip(),
                bbox=[0, i * 20, 400, i * 20 + 18],
                confidence=1.0,          # typed text is not an OCR guess
                image_id="listing",
                panel="listing",
            ))

    if not all_blocks:
        warnings.append("No readable text was produced, so no declaration could be assessed.")

    # ---------------- extraction ----------------
    fields = extract_all(all_blocks)
    for fld in fields.values():
        if fld.present and fld.confidence < 0.70:
            fld.verification_status = "LOW_CONFIDENCE"

    # ---------------- measurement ----------------
    measurements: Dict[str, Any] = {}
    if _VISION and ctx.get("panel_width_mm"):
        principal_image = next(
            (processed_images[i.image_id] for i in images
             if i.panel == "principal" and i.image_id in processed_images),
            None,
        )
        measurements = font_size.measure_all(fields, ctx, principal_image)

    # Cross-image MRP candidates power the "single MRP value" consistency rule.
    ctx["all_price_candidates"] = _price_candidates(all_blocks)

    # ---------------- rules ----------------
    evaluation = evaluate(repo, fields, ctx, measurements, inspection_date)

    applied_unverified = sorted({
        f"{r['rule_code']} v{r['rule_version']}"
        for r in evaluation["rule_results"]
        if r["result"] in ("PASS", "FAIL") and r["verification_status"] not in ("VERIFIED",)
    })

    return AnalysisResult(
        inspection_id=inspection_id,
        status=evaluation["status"],
        review_required=evaluation["review_required"],
        fields={k: v.as_dict() for k, v in fields.items()},
        rule_results=evaluation["rule_results"],
        violations=evaluation["violations"],
        counts=evaluation["counts"],
        highest_severity=evaluation["highest_severity"],
        images=image_reports,
        measurements=measurements,
        ocr_blocks=[b.as_dict() for b in all_blocks],
        engine=engine_info,
        warnings=warnings,
        unverified_rules=applied_unverified,
    )


def _price_candidates(blocks: Sequence[TextBlock]) -> List[float]:
    """Collect every price-looking value near an MRP anchor across all images."""
    from ai.extraction.fields import ANCHORS, _find_anchor, _tail_after_anchor

    out: List[float] = []
    for block in blocks:
        anchor = _find_anchor(block, ANCHORS["mrp"])
        if not anchor:
            continue
        price = normalize_price(_tail_after_anchor(block, anchor))
        if price and price.amount > 0:
            out.append(price.amount)
    return out


def _lazy_engine():
    from ai.ocr.engine import get_engine
    return get_engine()


def reevaluate(
    fields: Dict[str, Any],
    context: Dict[str, Any],
    measurements: Optional[Dict[str, Any]] = None,
    repository: Optional[RuleRepository] = None,
    inspection_date: Optional[date] = None,
) -> Dict[str, Any]:
    """Re-run rules after a human correction, without re-running OCR."""
    return evaluate(repository or default_repository(), fields, context,
                    measurements, inspection_date)
