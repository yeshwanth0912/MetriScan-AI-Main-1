"""Database model.

Two design rules run through this schema:

* A rule result stores ``rule_version_id``, not ``rule_id``. A finalised
  inspection must stay reproducible after the rule data changes.
* Nothing overwrites an AI reading. A human correction is written to
  ``corrected_value`` with the original preserved in ``raw_value``, and the
  change is journalled in ``audit_logs``.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="OFFICER")  # OFFICER|REVIEWER|ADMIN
    designation: Mapped[str] = mapped_column(String(120), default="")
    jurisdiction: Mapped[str] = mapped_column(String(160), default="")
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    inspections: Mapped[list["Inspection"]] = relationship(
        back_populates="officer",
        primaryjoin="User.id == Inspection.officer_id",
    )


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    brand: Mapped[str] = mapped_column(String(160), default="")
    product_name: Mapped[str] = mapped_column(String(240), default="")
    category: Mapped[str] = mapped_column(String(80), default="food", index=True)
    barcode: Mapped[str] = mapped_column(String(64), default="", index=True)
    extra: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    product_id: Mapped[str | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    officer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    location: Mapped[str] = mapped_column(String(240), default="")
    premises: Mapped[str] = mapped_column(String(240), default="")
    channel: Mapped[str] = mapped_column(String(30), default="retail")  # retail | ecommerce
    listing_url: Mapped[str] = mapped_column(String(500), default="")
    listing_text: Mapped[str] = mapped_column(Text, default="")
    is_imported: Mapped[bool] = mapped_column(Boolean, default=False)

    # Physical measurements the officer records so character height is checkable.
    panel_width_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    panel_height_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    fiducial_marker_side_mm: Mapped[float | None] = mapped_column(Float, nullable=True)

    status: Mapped[str] = mapped_column(String(24), default="DRAFT", index=True)
    compliance_status: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)
    highest_severity: Mapped[str | None] = mapped_column(String(16), nullable=True)

    inspection_date: Mapped[datetime] = mapped_column(Date, default=lambda: _now().date())
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    analysed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    analysis_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    officer: Mapped["User"] = relationship(back_populates="inspections", foreign_keys=[officer_id])
    reviewer: Mapped["User | None"] = relationship(foreign_keys=[reviewer_id])
    product: Mapped["Product | None"] = relationship()
    images: Mapped[list["Image"]] = relationship(back_populates="inspection", cascade="all, delete-orphan")
    fields: Mapped[list["ExtractedField"]] = relationship(back_populates="inspection", cascade="all, delete-orphan")
    rule_results: Mapped[list["RuleResult"]] = relationship(back_populates="inspection", cascade="all, delete-orphan")
    reports: Mapped[list["Report"]] = relationship(back_populates="inspection", cascade="all, delete-orphan")


class Image(Base):
    __tablename__ = "images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    inspection_id: Mapped[str] = mapped_column(ForeignKey("inspections.id"), index=True)
    file_path: Mapped[str] = mapped_column(String(500))
    processed_path: Mapped[str] = mapped_column(String(500), default="")
    original_filename: Mapped[str] = mapped_column(String(300), default="")
    image_type: Mapped[str] = mapped_column(String(20), default="front")  # front|back|side|listing
    content_type: Mapped[str] = mapped_column(String(80), default="")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    checksum: Mapped[str] = mapped_column(String(64), default="", index=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality_report: Mapped[dict] = mapped_column(JSON, default=dict)
    panel_bbox: Mapped[list | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="UPLOADED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    inspection: Mapped["Inspection"] = relationship(back_populates="images")
    ocr_results: Mapped[list["OCRResult"]] = relationship(back_populates="image", cascade="all, delete-orphan")


class OCRResult(Base):
    __tablename__ = "ocr_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    image_id: Mapped[str] = mapped_column(ForeignKey("images.id"), index=True)
    text: Mapped[str] = mapped_column(Text, default="")
    blocks: Mapped[list] = mapped_column(JSON, default=list)   # [{text,bbox,confidence,panel}]
    mean_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    engine: Mapped[str] = mapped_column(String(60), default="")
    engine_version: Mapped[str] = mapped_column(String(40), default="")
    processing_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    image: Mapped["Image"] = relationship(back_populates="ocr_results")


class ExtractedField(Base):
    __tablename__ = "extracted_fields"
    __table_args__ = (UniqueConstraint("inspection_id", "field_name", name="uq_field_per_inspection"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    inspection_id: Mapped[str] = mapped_column(ForeignKey("inspections.id"), index=True)
    field_name: Mapped[str] = mapped_column(String(60), index=True)
    present: Mapped[bool] = mapped_column(Boolean, default=False)

    raw_value: Mapped[str | None] = mapped_column(Text, nullable=True)       # what the AI read
    corrected_value: Mapped[str | None] = mapped_column(Text, nullable=True) # what a human entered
    normalized: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    panel: Mapped[str] = mapped_column(String(20), default="unknown")
    evidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    measurement: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[list] = mapped_column(JSON, default=list)
    verification_status: Mapped[str] = mapped_column(String(20), default="DETECTED")
    verified_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    inspection: Mapped["Inspection"] = relationship(back_populates="fields")

    @property
    def effective_value(self) -> str | None:
        return self.corrected_value if self.corrected_value is not None else self.raw_value


class Rule(Base):
    __tablename__ = "rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(60), default="declaration")
    requirement_type: Mapped[str] = mapped_column(String(40), default="presence")
    field: Mapped[str | None] = mapped_column(String(60), nullable=True)
    severity: Mapped[str] = mapped_column(String(16), default="MAJOR")
    applicability: Mapped[dict] = mapped_column(JSON, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    versions: Mapped[list["RuleVersion"]] = relationship(
        back_populates="rule", cascade="all, delete-orphan", order_by="RuleVersion.version"
    )


class RuleVersion(Base):
    __tablename__ = "rule_versions"
    __table_args__ = (UniqueConstraint("rule_id", "version", name="uq_rule_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    rule_id: Mapped[str] = mapped_column(ForeignKey("rules.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    effective_from: Mapped[str | None] = mapped_column(String(10), nullable=True)
    effective_to: Mapped[str | None] = mapped_column(String(10), nullable=True)
    definition: Mapped[dict] = mapped_column(JSON, default=dict)
    source_reference: Mapped[str] = mapped_column(Text, default="")
    verification_status: Mapped[str] = mapped_column(String(20), default="UNVERIFIED")
    verified_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    rule: Mapped["Rule"] = relationship(back_populates="versions")


class RuleResult(Base):
    __tablename__ = "rule_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    inspection_id: Mapped[str] = mapped_column(ForeignKey("inspections.id"), index=True)
    rule_code: Mapped[str] = mapped_column(String(40), index=True)
    rule_version_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rule_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String(300), default="")
    field: Mapped[str | None] = mapped_column(String(60), nullable=True)
    result: Mapped[str] = mapped_column(String(20), index=True)  # PASS|FAIL|REVIEW|NOT_APPLICABLE
    severity: Mapped[str] = mapped_column(String(16), default="MAJOR")
    reason: Mapped[str] = mapped_column(Text, default="")
    evidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source_reference: Mapped[str] = mapped_column(Text, default="")
    verification_status: Mapped[str] = mapped_column(String(20), default="UNVERIFIED")
    reviewer_status: Mapped[str] = mapped_column(String(20), default="MACHINE")  # MACHINE|CONFIRMED|OVERRIDDEN
    reviewer_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    inspection: Mapped["Inspection"] = relationship(back_populates="rule_results")


class Violation(Base):
    __tablename__ = "violations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    inspection_id: Mapped[str] = mapped_column(ForeignKey("inspections.id"), index=True)
    rule_result_id: Mapped[str] = mapped_column(ForeignKey("rule_results.id"))
    rule_code: Mapped[str] = mapped_column(String(40), index=True)
    category: Mapped[str] = mapped_column(String(60), default="declaration", index=True)
    severity: Mapped[str] = mapped_column(String(16), default="MAJOR", index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="OPEN")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    inspection_id: Mapped[str] = mapped_column(ForeignKey("inspections.id"), index=True)
    reference: Mapped[str] = mapped_column(String(48), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    file_path: Mapped[str] = mapped_column(String(500), default="")
    json_path: Mapped[str] = mapped_column(String(500), default="")
    format: Mapped[str] = mapped_column(String(16), default="pdf")
    status: Mapped[str] = mapped_column(String(20), default="GENERATING")
    generated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    inspection: Mapped["Inspection"] = relationship(back_populates="reports")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(60), index=True)
    entity_id: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    old_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
