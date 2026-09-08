from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.deps import client_ip, current_user
from app.api.inspections import get_inspection
from app.core.database import get_db
from app.models import User
from app.schemas import FieldOut, RuleResultOut
from app.services import audit_service, compliance_service

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def serialise(inspection) -> dict:
    fields = []
    for row in sorted(inspection.fields, key=lambda f: f.field_name):
        data = FieldOut.model_validate(row).model_dump()
        data["effective_value"] = row.effective_value
        fields.append(data)
    order = {"FAIL": 0, "REVIEW": 1, "PASS": 2, "NOT_APPLICABLE": 3}
    results = sorted(inspection.rule_results, key=lambda r: (order.get(r.result, 9), r.rule_code))
    return {
        "inspection_id": inspection.id,
        "status": inspection.compliance_status,
        "workflow_status": inspection.status,
        "highest_severity": inspection.highest_severity,
        "analysis_ms": inspection.analysis_ms,
        "fields": fields,
        "rule_results": [RuleResultOut.model_validate(r).model_dump() for r in results],
        "counts": {
            key: sum(1 for r in inspection.rule_results if r.result == key)
            for key in ("PASS", "FAIL", "REVIEW", "NOT_APPLICABLE")
        },
        "review_required": any(r.result == "REVIEW" for r in inspection.rule_results),
    }


@router.post("/inspections/{inspection_id}/analyze")
def analyze_inspection(inspection_id: str, request: Request,
                       db: Session = Depends(get_db), user: User = Depends(current_user)):
    inspection = get_inspection(inspection_id, db, user)
    if inspection.status == "FINALIZED":
        raise HTTPException(409, "This inspection is finalised. Reopen it to analyse again.")
    if not inspection.images and not inspection.listing_text:
        raise HTTPException(422, "Add at least one image, or paste the product listing text, before analysing.")

    try:
        outcome = compliance_service.run_analysis(db, inspection)
    except Exception as exc:
        inspection.status = "DRAFT"       # never leave a half-finished analysis behind
        db.commit()
        raise HTTPException(500, f"Analysis failed and no result was recorded: {exc}")

    audit_service.record(db, user_id=user.id, entity_type="inspection", entity_id=inspection.id,
                         action="ANALYZE",
                         new_value={"status": inspection.compliance_status,
                                    "ms": outcome["analysis_ms"]},
                         ip_address=client_ip(request))
    db.commit()
    db.refresh(inspection)

    payload = serialise(inspection)
    payload["warnings"] = outcome["result"].warnings
    payload["unverified_rules"] = outcome["result"].unverified_rules
    payload["engine"] = outcome["result"].engine
    return payload


@router.get("/inspections/{inspection_id}/results")
def read_results(inspection_id: str, db: Session = Depends(get_db),
                 user: User = Depends(current_user)):
    inspection = get_inspection(inspection_id, db, user)
    payload = serialise(inspection)
    payload["blocking_issues"] = compliance_service.blocking_issues(db, inspection)
    return payload


@router.get("/inspections/{inspection_id}/evidence/{field_name}")
def read_evidence(inspection_id: str, field_name: str, db: Session = Depends(get_db),
                  user: User = Depends(current_user)):
    """Everything behind one finding: the region, the text, the rules, the measurement."""
    inspection = get_inspection(inspection_id, db, user)
    field = next((f for f in inspection.fields if f.field_name == field_name), None)
    if not field:
        raise HTTPException(404, "No declaration of that name was extracted for this inspection.")

    image_url = None
    if field.evidence and field.evidence.get("image_id"):
        image_url = (f"/api/inspections/{inspection.id}/images/"
                     f"{field.evidence['image_id']}/file")
    return {
        "field": FieldOut.model_validate(field).model_dump() | {"effective_value": field.effective_value},
        "image_url": image_url,
        "rule_results": [
            RuleResultOut.model_validate(r).model_dump()
            for r in inspection.rule_results if r.field == field_name
        ],
        "measurement": field.measurement,
    }
