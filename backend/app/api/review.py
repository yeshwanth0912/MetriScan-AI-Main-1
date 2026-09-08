from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.analysis import serialise
from app.api.deps import client_ip, current_user, require_roles
from app.api.inspections import get_inspection
from app.core.database import get_db
from app.models import ExtractedField, RuleResult, User, Violation
from app.schemas import FieldCorrection
from app.services import audit_service, compliance_service

router = APIRouter(prefix="/api/review", tags=["review"])


class ResultDecision(BaseModel):
    decision: str          # CONFIRMED | OVERRIDDEN
    note: str = ""
    override_result: str | None = None


@router.patch("/inspections/{inspection_id}/fields/{field_name}")
def correct_field(inspection_id: str, field_name: str, payload: FieldCorrection,
                  request: Request, db: Session = Depends(get_db),
                  user: User = Depends(current_user)):
    """Record a human correction and re-run the affected rules.

    The AI reading is never overwritten. It stays in raw_value so the report can
    show what the machine read and what the officer corrected it to.
    """
    inspection = get_inspection(inspection_id, db, user)
    if inspection.status == "FINALIZED":
        raise HTTPException(409, "This inspection is finalised. Reopen it before correcting a value.")

    field = db.query(ExtractedField).filter(
        ExtractedField.inspection_id == inspection.id,
        ExtractedField.field_name == field_name).first()
    if not field:
        raise HTTPException(404, "No declaration of that name was extracted for this inspection.")

    old = {"corrected_value": field.corrected_value, "raw_value": field.raw_value,
           "present": field.present, "verification_status": field.verification_status}

    field.corrected_value = payload.corrected_value
    field.present = bool(payload.corrected_value.strip())
    field.verification_status = "CORRECTED"
    field.verified_by = user.id
    field.verified_at = datetime.now(timezone.utc)
    field.normalized = _renormalize(field_name, payload.corrected_value) or field.normalized

    audit_service.record(db, user_id=user.id, entity_type="extracted_field", entity_id=field.id,
                         action="CORRECT_FIELD", old_value=old,
                         new_value={"corrected_value": payload.corrected_value,
                                    "note": payload.note},
                         ip_address=client_ip(request))
    db.flush()
    compliance_service.reevaluate(db, inspection)
    db.commit()
    db.refresh(inspection)
    return serialise(inspection)


@router.post("/inspections/{inspection_id}/results/{result_id}/decide")
def decide_result(inspection_id: str, result_id: str, payload: ResultDecision,
                  request: Request, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("REVIEWER", "ADMIN"))):
    """A reviewer confirms or overrides a machine finding. Both are journalled."""
    inspection = get_inspection(inspection_id, db, user)
    result = db.query(RuleResult).filter(RuleResult.id == result_id,
                                         RuleResult.inspection_id == inspection.id).first()
    if not result:
        raise HTTPException(404, "That finding is not part of this inspection.")
    if payload.decision not in ("CONFIRMED", "OVERRIDDEN"):
        raise HTTPException(422, "Decision must be CONFIRMED or OVERRIDDEN.")
    if payload.decision == "OVERRIDDEN" and not payload.note.strip():
        raise HTTPException(422, "An override needs a written reason.")
    if result.result == "REVIEW" and payload.decision == "CONFIRMED" and payload.override_result is None:
        raise HTTPException(422, "A REVIEW finding must be resolved to PASS, FAIL or NOT_APPLICABLE before finalisation.")

    old = {"result": result.result, "reviewer_status": result.reviewer_status}
    result.reviewer_status = payload.decision
    result.reviewer_note = payload.note
    if payload.decision == "CONFIRMED" and result.result == "REVIEW" and payload.override_result:
        if payload.override_result not in ("PASS", "FAIL", "NOT_APPLICABLE"):
            raise HTTPException(422, "A review resolution must be PASS, FAIL or NOT_APPLICABLE.")
        result.result = payload.override_result
    elif payload.decision == "OVERRIDDEN" and payload.override_result:
        if payload.override_result not in ("PASS", "FAIL", "NOT_APPLICABLE"):
            raise HTTPException(422, "An override must be PASS, FAIL or NOT_APPLICABLE.")
        result.result = payload.override_result

    inspection.reviewer_id = user.id
    # Keep the violation table in sync with reviewer decisions.
    violation = db.query(Violation).filter(Violation.rule_result_id == result.id).first()
    if result.result == "FAIL" and violation is None:
        db.add(Violation(inspection_id=inspection.id, rule_result_id=result.id,
                         rule_code=result.rule_code, category=result.field or "consistency",
                         severity=result.severity, description=result.reason))
    elif result.result != "FAIL" and violation is not None:
        db.delete(violation)

    # Recompute the inspection-level status after a human decision. A REVIEW
    # result that has been resolved by a reviewer no longer blocks the roll-up.
    from rules.engine import aggregate, RuleResult as EngineRuleResult
    evaluated = []
    for row in inspection.rule_results:
        evaluated.append(EngineRuleResult(
            rule_id=row.rule_code, rule_code=row.rule_code,
            rule_version_id=row.rule_version_id, rule_version=row.rule_version,
            title=row.title, severity=row.severity, result=row.result, reason=row.reason,
            field=row.field, evidence=row.evidence, source_reference=row.source_reference,
            verification_status=row.verification_status,
        ))
    rolled = aggregate(evaluated)
    inspection.compliance_status = rolled["status"]
    inspection.highest_severity = rolled["highest_severity"]

    audit_service.record(db, user_id=user.id, entity_type="rule_result", entity_id=result.id,
                         action=f"REVIEW_{payload.decision}", old_value=old,
                         new_value={"result": result.result, "note": payload.note},
                         ip_address=client_ip(request))
    db.commit()
    db.refresh(inspection)
    return serialise(inspection)


@router.post("/inspections/{inspection_id}/finalize")
def finalize(inspection_id: str, request: Request, db: Session = Depends(get_db),
             user: User = Depends(current_user)):
    inspection = get_inspection(inspection_id, db, user)
    if inspection.status == "FINALIZED":
        raise HTTPException(409, "This inspection is already finalised.")

    issues = compliance_service.blocking_issues(db, inspection)
    if issues:
        raise HTTPException(422, {"message": "This inspection cannot be finalised yet.",
                                  "blocking_issues": issues})

    inspection.status = "FINALIZED"
    inspection.finalized_at = datetime.now(timezone.utc)
    audit_service.record(db, user_id=user.id, entity_type="inspection", entity_id=inspection.id,
                         action="FINALIZE", new_value={"compliance_status": inspection.compliance_status},
                         ip_address=client_ip(request))
    db.commit()
    db.refresh(inspection)
    return serialise(inspection)


@router.post("/inspections/{inspection_id}/reopen")
def reopen(inspection_id: str, request: Request, db: Session = Depends(get_db),
           user: User = Depends(require_roles("REVIEWER", "ADMIN"))):
    inspection = get_inspection(inspection_id, db, user)
    if inspection.status != "FINALIZED":
        raise HTTPException(409, "Only a finalised inspection can be reopened.")
    inspection.status = "REVIEW"
    inspection.finalized_at = None
    audit_service.record(db, user_id=user.id, entity_type="inspection", entity_id=inspection.id,
                         action="REOPEN", ip_address=client_ip(request))
    db.commit()
    db.refresh(inspection)
    return serialise(inspection)


def _renormalize(field_name: str, value: str):
    """Re-derive the normalised form from a value a human typed."""
    from ai.normalization.units import normalize_month_year, normalize_price, normalize_quantity

    if field_name == "net_quantity":
        qty = normalize_quantity(value)
        return qty.as_dict() if qty else None
    if field_name == "mrp":
        price = normalize_price(value)
        return price.as_dict() if price else None
    if field_name in ("date_of_manufacture", "best_before"):
        when = normalize_month_year(value)
        return when.as_dict() if when else None
    return None
