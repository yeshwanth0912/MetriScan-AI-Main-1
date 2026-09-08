"""Audit journal. Every change to a finding, a rule or a user lands here."""
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import AuditLog


def record(
    db: Session,
    *,
    user_id: Optional[str],
    entity_type: str,
    entity_id: str,
    action: str,
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
    ip_address: str = "",
) -> AuditLog:
    entry = AuditLog(
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
    )
    db.add(entry)
    return entry
