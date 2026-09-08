from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.deps import client_ip, current_user, require_roles
from app.core.database import get_db
from app.models import Rule, RuleResult, RuleVersion, User
from app.schemas import RuleIn, RuleVersionIn
from app.services import audit_service, compliance_service

router = APIRouter(prefix="/api/rules", tags=["rules"])


def _serialise(rule: Rule) -> dict:
    return {
        "id": rule.id, "code": rule.code, "title": rule.title,
        "description": rule.description, "category": rule.category,
        "requirement_type": rule.requirement_type, "field": rule.field,
        "severity": rule.severity, "applicability": rule.applicability, "active": rule.active,
        "versions": [
            {"id": v.id, "version": v.version, "effective_from": v.effective_from,
             "effective_to": v.effective_to, "definition": v.definition,
             "source_reference": v.source_reference,
             "verification_status": v.verification_status, "active": v.active}
            for v in rule.versions
        ],
    }


@router.get("")
def list_rules(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rules = db.query(Rule).order_by(Rule.code).all()
    unverified = sum(
        1 for r in rules for v in r.versions
        if v.active and v.verification_status != "VERIFIED"
    )
    return {"items": [_serialise(r) for r in rules], "unverified_versions": unverified}


@router.post("", status_code=201)
def create_rule(payload: RuleIn, request: Request, db: Session = Depends(get_db),
                admin: User = Depends(require_roles("ADMIN"))):
    if db.query(Rule).filter(Rule.code == payload.code).first():
        raise HTTPException(409, "A rule with that code already exists.")
    rule = Rule(**payload.model_dump())
    db.add(rule)
    db.flush()
    audit_service.record(db, user_id=admin.id, entity_type="rule", entity_id=rule.id,
                         action="CREATE_RULE", new_value=payload.model_dump(),
                         ip_address=client_ip(request))
    db.commit()
    return _serialise(rule)


@router.post("/{rule_id}/versions", status_code=201)
def add_version(rule_id: str, payload: RuleVersionIn, request: Request,
                db: Session = Depends(get_db), admin: User = Depends(require_roles("ADMIN"))):
    rule = db.get(Rule, rule_id)
    if not rule:
        raise HTTPException(404, "That rule does not exist.")
    if any(v.version == payload.version for v in rule.versions):
        raise HTTPException(409, f"Version {payload.version} of this rule already exists.")

    version = RuleVersion(rule_id=rule.id, **payload.model_dump())
    db.add(version)
    db.flush()
    audit_service.record(db, user_id=admin.id, entity_type="rule_version", entity_id=version.id,
                         action="ADD_RULE_VERSION",
                         new_value={"rule_code": rule.code, "version": payload.version},
                         ip_address=client_ip(request))
    db.commit()
    db.refresh(rule)
    return _serialise(rule)


@router.post("/versions/{version_id}/verify")
def verify_version(version_id: str, request: Request, source_reference: str = "",
                   db: Session = Depends(get_db), admin: User = Depends(require_roles("ADMIN"))):
    """Mark a rule version as checked against the gazette text.

    Until this is done the version cannot support a finalised inspection.
    """
    version = db.get(RuleVersion, version_id)
    if not version:
        raise HTTPException(404, "That rule version does not exist.")
    if not (source_reference or version.source_reference).strip():
        raise HTTPException(422, "Record the gazette reference before marking a rule verified.")

    old = {"verification_status": version.verification_status,
           "source_reference": version.source_reference}
    version.verification_status = "VERIFIED"
    version.verified_by = admin.id
    if source_reference:
        version.source_reference = source_reference

    audit_service.record(db, user_id=admin.id, entity_type="rule_version", entity_id=version.id,
                         action="VERIFY_RULE_VERSION", old_value=old,
                         new_value={"verification_status": "VERIFIED",
                                    "source_reference": version.source_reference},
                         ip_address=client_ip(request))
    db.commit()
    return {"id": version.id, "verification_status": version.verification_status}


@router.patch("/versions/{version_id}/deactivate")
def deactivate_version(version_id: str, request: Request, db: Session = Depends(get_db),
                       admin: User = Depends(require_roles("ADMIN"))):
    """Deactivate a version, unless a finalised inspection already relies on it."""
    version = db.get(RuleVersion, version_id)
    if not version:
        raise HTTPException(404, "That rule version does not exist.")

    in_use = (db.query(RuleResult)
              .filter(RuleResult.rule_version_id == version.id)
              .join(RuleResult.inspection).first())
    if in_use:
        raise HTTPException(
            409,
            "Finalised inspections were decided under this version, so it cannot be removed. "
            "Add a superseding version with a later effective date instead.",
        )
    version.active = False
    audit_service.record(db, user_id=admin.id, entity_type="rule_version", entity_id=version.id,
                         action="DEACTIVATE_RULE_VERSION", ip_address=client_ip(request))
    db.commit()
    return {"id": version.id, "active": version.active}


@router.post("/reload")
def reload_rules(db: Session = Depends(get_db), admin: User = Depends(require_roles("ADMIN"))):
    repo = compliance_service.reload_repository(db)
    return {"rules_loaded": len(repo.rules), "unverified": repo.unverified()}
