"""Bridges the pure-Python analysis pipeline to the database."""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ExtractedField, Image, Inspection, OCRResult, RuleResult, Violation

_REPOSITORY = None

def repository(db: Session | None = None):
    """Return the runtime rule repository.

    Persisted rules are preferred when available so Admin verification and
    newly-created versions actually affect subsequent analyses. The JSON pack
    remains a safe bootstrap fallback for unit tests and first startup.
    """
    global _REPOSITORY
    if db is not None:
        from app.models import Rule
        rows = db.query(Rule).filter(Rule.active.is_(True)).all()
        if rows:
            from rules.engine import RuleRepository
            return RuleRepository.from_db_rows(rows)
    if _REPOSITORY is None:
        from rules.engine import RuleRepository
        _REPOSITORY = RuleRepository.from_file(settings.rules_path)
    return _REPOSITORY

def reload_repository(db: Session | None = None):
    global _REPOSITORY
    _REPOSITORY = None
    return repository(db)


def build_context(inspection: Inspection) -> dict[str, Any]:
    return {
        "category": inspection.product.category if inspection.product else "food",
        "channel": inspection.channel,
        "is_imported": inspection.is_imported,
        "panel_width_mm": inspection.panel_width_mm,
        "panel_height_mm": inspection.panel_height_mm,
        "fiducial_marker_side_mm": inspection.fiducial_marker_side_mm,
    }


def run_analysis(db: Session, inspection: Inspection) -> dict[str, Any]:
    """Run the full pipeline and persist every intermediate artefact."""
    from ai.pipeline import ImageInput, analyze
    import os

    started = time.perf_counter()
    inspection.status = "ANALYZING"
    db.flush()

    images = [
        ImageInput(image_id=img.id, path=img.file_path, image_type=img.image_type)
        for img in inspection.images if img.status in ("READY", "POOR_QUALITY")
    ]
    processed_dir = os.path.join(settings.storage_path, "processed", inspection.id)

    result = analyze(
        inspection_id=inspection.id,
        images=images,
        context=build_context(inspection),
        repository=repository(db),
        listing_text=inspection.listing_text or None,
        inspection_date=inspection.inspection_date,
        processed_dir=processed_dir,
    )
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    # --- persist OCR, replacing any previous run for these images ---
    by_image: dict[str, list] = {}
    for block in result.ocr_blocks:
        by_image.setdefault(block["image_id"], []).append(block)

    for img in inspection.images:
        db.query(OCRResult).filter(OCRResult.image_id == img.id).delete()
        blocks = by_image.get(img.id, [])
        if not blocks:
            continue
        db.add(OCRResult(
            image_id=img.id,
            text="\n".join(b["text"] for b in blocks),
            blocks=blocks,
            mean_confidence=sum(b["confidence"] for b in blocks) / len(blocks),
            engine=result.engine.get("ocr_engine", ""),
            engine_version=str(result.engine.get("ocr_version", "")),
            processing_ms=elapsed_ms,
        ))
        report = next((r for r in result.images if r["image_id"] == img.id), None)
        if report:
            img.panel_bbox = report.get("panel_bbox")
            if report.get("processed_path"):
                img.processed_path = report["processed_path"]
            if report.get("quality"):
                img.quality_report = report["quality"]
                img.quality_score = report["quality"].get("score")

    # --- persist extracted fields, preserving human corrections ---
    existing = {f.field_name: f for f in inspection.fields}
    for name, data in result.fields.items():
        row = existing.get(name)
        if row is None:
            row = ExtractedField(inspection_id=inspection.id, field_name=name)
            db.add(row)
        row.present = data["present"]
        row.raw_value = data["raw_value"]
        row.normalized = data["normalized"]
        row.confidence = data["confidence"]
        row.panel = data["panel"]
        row.evidence = data["evidence"]
        row.notes = data["notes"]
        row.measurement = result.measurements.get(name)
        # A value a human already corrected keeps its corrected status.
        if row.verification_status != "CORRECTED":
            row.verification_status = data["verification_status"]

    # --- persist rule results and violations ---
    db.query(Violation).filter(Violation.inspection_id == inspection.id).delete()
    db.query(RuleResult).filter(RuleResult.inspection_id == inspection.id).delete()
    db.flush()

    for item in result.rule_results:
        row = RuleResult(
            inspection_id=inspection.id, rule_code=item["rule_code"],
            rule_version_id=item["rule_version_id"], rule_version=item["rule_version"],
            title=item["title"], field=item["field"], result=item["result"],
            severity=item["severity"], reason=item["reason"], evidence=item["evidence"],
            source_reference=item["source_reference"],
            verification_status=item["verification_status"],
        )
        db.add(row)
        db.flush()
        if item["result"] == "FAIL":
            db.add(Violation(
                inspection_id=inspection.id, rule_result_id=row.id, rule_code=item["rule_code"],
                category=item["field"] or "consistency", severity=item["severity"],
                description=item["reason"],
            ))

    inspection.compliance_status = result.status
    inspection.highest_severity = result.highest_severity
    inspection.status = "REVIEW"
    inspection.analysed_at = datetime.now(timezone.utc)
    inspection.analysis_ms = elapsed_ms
    db.flush()

    return {"result": result, "analysis_ms": elapsed_ms}


def reevaluate(db: Session, inspection: Inspection) -> dict[str, Any]:
    """Re-run rules after a correction. OCR is not repeated."""
    from ai.pipeline import reevaluate as engine_reevaluate

    fields: dict[str, Any] = {}
    measurements: dict[str, Any] = {}
    for row in inspection.fields:
        fields[row.field_name] = {
            "name": row.field_name, "present": row.present,
            "raw_value": row.effective_value, "normalized": row.normalized,
            # A human-entered value is authoritative, so it carries full confidence.
            "confidence": 1.0 if row.verification_status == "CORRECTED" else row.confidence,
            "evidence": row.evidence, "panel": row.panel, "notes": row.notes,
            "verification_status": row.verification_status,
        }
        if row.measurement:
            measurements[row.field_name] = row.measurement

    context = build_context(inspection)
    context["all_price_candidates"] = _price_candidates(inspection)

    evaluation = engine_reevaluate(fields, context, measurements, repository(db),
                                   inspection.inspection_date)

    db.query(Violation).filter(Violation.inspection_id == inspection.id).delete()
    db.query(RuleResult).filter(RuleResult.inspection_id == inspection.id).delete()
    db.flush()
    for item in evaluation["rule_results"]:
        row = RuleResult(
            inspection_id=inspection.id, rule_code=item["rule_code"],
            rule_version_id=item["rule_version_id"], rule_version=item["rule_version"],
            title=item["title"], field=item["field"], result=item["result"],
            severity=item["severity"], reason=item["reason"], evidence=item["evidence"],
            source_reference=item["source_reference"],
            verification_status=item["verification_status"],
        )
        db.add(row)
        db.flush()
        if item["result"] == "FAIL":
            db.add(Violation(inspection_id=inspection.id, rule_result_id=row.id,
                             rule_code=item["rule_code"], category=item["field"] or "consistency",
                             severity=item["severity"], description=item["reason"]))

    inspection.compliance_status = evaluation["status"]
    inspection.highest_severity = evaluation["highest_severity"]
    db.flush()
    return evaluation


def _price_candidates(inspection: Inspection) -> list[float]:
    from ai.normalization.units import normalize_price
    values: list[float] = []
    for img in inspection.images:
        for ocr in img.ocr_results:
            for block in ocr.blocks or []:
                text = (block.get("text") or "").lower()
                if "mrp" in text or "retail price" in text:
                    price = normalize_price(block.get("text") or "")
                    if price and price.amount > 0:
                        values.append(price.amount)
    return values


def blocking_issues(db: Session, inspection: Inspection) -> list[str]:
    """Reasons this inspection cannot be finalised yet."""
    issues: list[str] = []
    results = list(inspection.rule_results)
    if not results:
        issues.append("The inspection has not been analysed yet.")

    outstanding = [r for r in results if r.result == "REVIEW" and r.reviewer_status == "MACHINE"]
    if outstanding:
        issues.append(
            f"{len(outstanding)} finding(s) are still marked for review. Confirm or override each one."
        )

    if not settings.allow_unverified_rules:
        unverified = sorted({
            f"{r.rule_code} v{r.rule_version}" for r in results
            if r.result in ("PASS", "FAIL") and r.verification_status != "VERIFIED"
        })
        if unverified:
            issues.append(
                "These rule versions have not been checked against the gazette text and cannot "
                f"support a finalised result: {', '.join(unverified)}."
            )
    return issues
