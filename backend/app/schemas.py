"""Request/response contracts."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user: "UserOut"


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    designation: str = ""
    jurisdiction: str = ""
    status: str = "ACTIVE"

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    role: str = "OFFICER"
    designation: str = ""
    jurisdiction: str = ""


class InspectionCreate(BaseModel):
    brand: str = ""
    product_name: str = ""
    category: str = "food"
    barcode: str = ""
    location: str = ""
    premises: str = ""
    channel: str = "retail"
    listing_url: str = ""
    listing_text: str = ""
    is_imported: bool = False
    panel_width_mm: Optional[float] = None
    panel_height_mm: Optional[float] = None
    fiducial_marker_side_mm: Optional[float] = None
    inspection_date: Optional[date] = None
    notes: str = ""


class InspectionUpdate(BaseModel):
    location: Optional[str] = None
    premises: Optional[str] = None
    is_imported: Optional[bool] = None
    panel_width_mm: Optional[float] = None
    panel_height_mm: Optional[float] = None
    listing_text: Optional[str] = None
    notes: Optional[str] = None


class InspectionOut(BaseModel):
    id: str
    reference: str
    status: str
    compliance_status: Optional[str] = None
    highest_severity: Optional[str] = None
    location: str = ""
    premises: str = ""
    channel: str = "retail"
    is_imported: bool = False
    panel_width_mm: Optional[float] = None
    panel_height_mm: Optional[float] = None
    inspection_date: Optional[date] = None
    started_at: Optional[datetime] = None
    analysed_at: Optional[datetime] = None
    finalized_at: Optional[datetime] = None
    analysis_ms: Optional[int] = None
    notes: str = ""

    class Config:
        from_attributes = True


class FieldOut(BaseModel):
    id: str
    field_name: str
    present: bool
    raw_value: Optional[str] = None
    corrected_value: Optional[str] = None
    effective_value: Optional[str] = None
    normalized: Optional[dict] = None
    confidence: float = 0.0
    panel: str = "unknown"
    evidence: Optional[dict] = None
    measurement: Optional[dict] = None
    notes: list = []
    verification_status: str = "DETECTED"

    class Config:
        from_attributes = True


class FieldCorrection(BaseModel):
    corrected_value: str
    note: str = ""


class RuleResultOut(BaseModel):
    id: str
    rule_code: str
    rule_version: Optional[int] = None
    rule_version_id: Optional[str] = None
    title: str
    field: Optional[str] = None
    result: str
    severity: str
    reason: str
    evidence: Optional[dict] = None
    source_reference: str = ""
    verification_status: str = "UNVERIFIED"
    reviewer_status: str = "MACHINE"
    reviewer_note: str = ""

    class Config:
        from_attributes = True


class AnalysisOut(BaseModel):
    inspection_id: str
    status: str
    review_required: bool
    counts: dict
    highest_severity: Optional[str] = None
    fields: list[FieldOut] = []
    rule_results: list[RuleResultOut] = []
    warnings: list[str] = []
    unverified_rules: list[str] = []
    analysis_ms: Optional[int] = None


class RuleVersionIn(BaseModel):
    version: int
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    definition: dict = {}
    source_reference: str = ""
    verification_status: str = "UNVERIFIED"
    active: bool = True


class RuleIn(BaseModel):
    code: str
    title: str
    description: str = ""
    category: str = "declaration"
    requirement_type: str = "presence"
    field: Optional[str] = None
    severity: str = "MAJOR"
    applicability: dict = {}


TokenResponse.model_rebuild()
