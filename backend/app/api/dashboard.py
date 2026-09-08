from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.core.database import get_db
from app.models import Inspection, RuleResult, User, Violation

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _scope(db: Session, user: User):
    q = db.query(Inspection)
    return q.filter(Inspection.officer_id == user.id) if user.role == "OFFICER" else q


@router.get("/summary")
def summary(db: Session = Depends(get_db), user: User = Depends(current_user)):
    base = _scope(db, user)
    total = base.count()
    by_compliance = dict(
        base.with_entities(Inspection.compliance_status, func.count(Inspection.id))
        .group_by(Inspection.compliance_status).all()
    )
    compliant = by_compliance.get("COMPLIANT", 0)
    decided = compliant + by_compliance.get("NON_COMPLIANT", 0)

    avg_ms = (base.with_entities(func.avg(Inspection.analysis_ms))
              .filter(Inspection.analysis_ms.isnot(None)).scalar())

    return {
        "total_inspections": total,
        "compliant": compliant,
        "non_compliant": by_compliance.get("NON_COMPLIANT", 0),
        "review_pending": by_compliance.get("REVIEW_REQUIRED", 0),
        "finalized": base.filter(Inspection.status == "FINALIZED").count(),
        "drafts": base.filter(Inspection.status == "DRAFT").count(),
        "compliance_rate": round(compliant / decided, 4) if decided else None,
        "average_analysis_ms": int(avg_ms) if avg_ms else None,
    }


@router.get("/violations")
def violations(db: Session = Depends(get_db), user: User = Depends(current_user),
               limit: int = Query(default=10, ge=1, le=50)):
    rows = (db.query(Violation.rule_code, Violation.severity, func.count(Violation.id).label("n"))
            .join(Inspection, Violation.inspection_id == Inspection.id))
    if user.role == "OFFICER":
        rows = rows.filter(Inspection.officer_id == user.id)
    rows = rows.group_by(Violation.rule_code, Violation.severity).order_by(func.count(Violation.id).desc()).limit(limit)

    titles = dict(db.query(RuleResult.rule_code, RuleResult.title).distinct().all())
    return [{"rule_code": code, "severity": severity, "count": n,
             "title": titles.get(code, code)} for code, severity, n in rows.all()]


@router.get("/trends")
def trends(db: Session = Depends(get_db), user: User = Depends(current_user),
           days: int = Query(default=30, ge=7, le=365)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (_scope(db, user)
            .with_entities(func.date(Inspection.started_at).label("day"),
                           Inspection.compliance_status, func.count(Inspection.id))
            .filter(Inspection.started_at >= since)
            .group_by("day", Inspection.compliance_status).all())

    buckets: dict[str, dict] = {}
    for day, status, count in rows:
        key = str(day)
        buckets.setdefault(key, {"date": key, "COMPLIANT": 0, "NON_COMPLIANT": 0,
                                 "REVIEW_REQUIRED": 0, "total": 0})
        if status:
            buckets[key][status] = buckets[key].get(status, 0) + count
        buckets[key]["total"] += count
    return sorted(buckets.values(), key=lambda b: b["date"])


@router.get("/review-queue")
def review_queue(db: Session = Depends(get_db), user: User = Depends(current_user),
                 limit: int = Query(default=15, ge=1, le=50)):
    """Inspections waiting on a human, highest severity first."""
    rank = {"CRITICAL": 0, "MAJOR": 1, "MINOR": 2, None: 3}
    rows = (_scope(db, user)
            .filter(Inspection.status.in_(("REVIEW", "ANALYZING")))
            .order_by(Inspection.analysed_at.desc()).limit(limit * 2).all())
    ordered = sorted(rows, key=lambda i: (rank.get(i.highest_severity, 3),))[:limit]
    return [{"id": i.id, "reference": i.reference,
             "product": i.product.product_name if i.product else "",
             "compliance_status": i.compliance_status,
             "highest_severity": i.highest_severity,
             "open_reviews": sum(1 for r in i.rule_results
                                 if r.result == "REVIEW" and r.reviewer_status == "MACHINE"),
             "analysed_at": i.analysed_at}
            for i in ordered]


@router.get("/audit")
def audit_trail(db: Session = Depends(get_db), user: User = Depends(current_user),
                entity_id: str = Query(default=""), limit: int = Query(default=50, ge=1, le=200)):
    from app.models import AuditLog
    q = db.query(AuditLog)
    if entity_id:
        q = q.filter(AuditLog.entity_id == entity_id)
    if user.role == "OFFICER":
        q = q.filter(AuditLog.user_id == user.id)
    return [{"id": a.id, "user_id": a.user_id, "entity_type": a.entity_type,
             "entity_id": a.entity_id, "action": a.action, "old_value": a.old_value,
             "new_value": a.new_value, "created_at": a.created_at}
            for a in q.order_by(AuditLog.created_at.desc()).limit(limit).all()]
