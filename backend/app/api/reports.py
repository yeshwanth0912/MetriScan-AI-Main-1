import os

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import client_ip, current_user
from app.api.inspections import get_inspection
from app.core.config import settings
from app.core.database import get_db
from app.models import Report, User
from app.services import audit_service, compliance_service, report_service

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _payload(inspection, report: Report) -> dict:
    return {
        "report": {"reference": report.reference, "version": report.version,
                   "generated_by_name": (inspection.reviewer.name if inspection.reviewer else inspection.officer.name)},
        "compliance_status": inspection.compliance_status,
        "inspection": {
            "reference": inspection.reference,
            "inspection_date": inspection.inspection_date,
            "officer_name": inspection.officer.name,
            "officer_designation": inspection.officer.designation,
            "reviewer_name": inspection.reviewer.name if inspection.reviewer else None,
            "premises": inspection.premises, "location": inspection.location,
            "channel": inspection.channel,
            "brand": inspection.product.brand if inspection.product else "",
            "product_name": inspection.product.product_name if inspection.product else "",
            "category": inspection.product.category if inspection.product else "",
            "is_imported": inspection.is_imported,
            "panel_width_mm": inspection.panel_width_mm,
            "panel_height_mm": inspection.panel_height_mm,
            "analysis_ms": inspection.analysis_ms,
            "finalized_at": inspection.finalized_at,
        },
        "fields": [
            {"field_name": f.field_name, "present": f.present, "raw_value": f.raw_value,
             "effective_value": f.effective_value, "confidence": f.confidence,
             "panel": f.panel, "normalized": f.normalized, "measurement": f.measurement,
             "verification_status": f.verification_status, "evidence": f.evidence}
            for f in sorted(inspection.fields, key=lambda x: x.field_name)
        ],
        "rule_results": [
            {"rule_code": r.rule_code, "rule_version": r.rule_version,
             "rule_version_id": r.rule_version_id, "title": r.title, "result": r.result,
             "severity": r.severity, "reason": r.reason, "field": r.field,
             "source_reference": r.source_reference,
             "verification_status": r.verification_status,
             "reviewer_status": r.reviewer_status, "reviewer_note": r.reviewer_note}
            for r in sorted(inspection.rule_results,
                            key=lambda r: ({"FAIL": 0, "REVIEW": 1, "PASS": 2,
                                            "NOT_APPLICABLE": 3}.get(r.result, 9), r.rule_code))
        ],
        "images": [
            {"path": i.file_path, "image_type": i.image_type, "quality_score": i.quality_score}
            for i in inspection.images
        ],
    }


@router.post("/inspections/{inspection_id}/generate")
def generate_report(inspection_id: str, request: Request, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    inspection = get_inspection(inspection_id, db, user)
    if inspection.status != "FINALIZED":
        raise HTTPException(409, "Finalise the inspection before generating an enforcement report.")
    if not inspection.rule_results:
        raise HTTPException(422, "Analyse the inspection before generating a report.")

    version = len(inspection.reports) + 1
    report = Report(inspection_id=inspection.id, version=version,
                    reference=f"{inspection.reference}-R{version}",
                    generated_by=user.id, status="GENERATING")
    db.add(report)
    db.flush()

    folder = os.path.join(settings.storage_path, "reports", inspection.id)
    payload = _payload(inspection, report)
    try:
        report.file_path = report_service.build_pdf(
            payload, os.path.join(folder, f"{report.reference}.pdf"))
        report.json_path = report_service.build_json(
            payload, os.path.join(folder, f"{report.reference}.json"))
        report.status = "READY"
    except Exception as exc:
        report.status = "FAILED"
        db.commit()
        # The finalised data survives a failed render; the report can be retried.
        raise HTTPException(500, f"The report could not be rendered: {exc}")

    audit_service.record(db, user_id=user.id, entity_type="report", entity_id=report.id,
                         action="GENERATE_REPORT",
                         new_value={"reference": report.reference, "version": version},
                         ip_address=client_ip(request))
    db.commit()
    db.refresh(report)
    return {"id": report.id, "reference": report.reference, "version": report.version,
            "status": report.status,
            "pdf_url": f"/api/reports/{report.id}/download?format=pdf",
            "json_url": f"/api/reports/{report.id}/download?format=json"}


@router.get("/inspections/{inspection_id}")
def list_reports(inspection_id: str, db: Session = Depends(get_db),
                 user: User = Depends(current_user)):
    inspection = get_inspection(inspection_id, db, user)
    return [{"id": r.id, "reference": r.reference, "version": r.version, "status": r.status,
             "created_at": r.created_at,
             "pdf_url": f"/api/reports/{r.id}/download?format=pdf",
             "json_url": f"/api/reports/{r.id}/download?format=json"}
            for r in sorted(inspection.reports, key=lambda r: r.version, reverse=True)]


@router.get("/{report_id}/download")
def download_report(report_id: str, format: str = "pdf", db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(404, "That report does not exist.")
    get_inspection(report.inspection_id, db, user)   # re-checks visibility
    path = report.json_path if format == "json" else report.file_path
    if not path or not os.path.exists(path):
        raise HTTPException(404, "The report file is missing. Generate it again.")
    return FileResponse(path, filename=os.path.basename(path),
                        media_type="application/json" if format == "json" else "application/pdf")
