"""Deterministic compliance rule engine.

Contract with the rest of the system
------------------------------------
* The AI layer decides *what the label says*. This module decides *whether that
  meets a requirement*. It never calls OCR, a model or a network service.
* Every result names the exact rule version it was produced by, so a finalised
  inspection stays reproducible after the rule data changes.
* Absence of evidence is not evidence of a violation. Whenever the engine
  cannot establish a fact it returns REVIEW or NOT_APPLICABLE, never FAIL.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field as dc_field
from datetime import date
from typing import Any, Dict, List, Optional, Sequence

PASS = "PASS"
FAIL = "FAIL"
REVIEW = "REVIEW"
NOT_APPLICABLE = "NOT_APPLICABLE"

# Fields read below this OCR confidence are routed to a human instead of being
# judged. Tune per deployment; it is a product decision, not a legal one.
DEFAULT_CONFIDENCE_FLOOR = 0.70


# --------------------------------------------------------------------------
# Rule data model
# --------------------------------------------------------------------------

@dataclass
class RuleVersion:
    version_id: str
    rule_id: str
    version: int
    effective_from: Optional[str]
    effective_to: Optional[str]
    definition: Dict[str, Any]
    source_reference: str = ""
    verification_status: str = "UNVERIFIED"
    active: bool = True

    def in_force_on(self, when: date) -> bool:
        if self.effective_from and when < date.fromisoformat(self.effective_from):
            return False
        if self.effective_to and when > date.fromisoformat(self.effective_to):
            return False
        return self.active


@dataclass
class Rule:
    rule_id: str
    code: str
    title: str
    description: str
    category: str
    requirement_type: str
    severity: str
    field: Optional[str]
    applicability: Dict[str, Any]
    versions: List[RuleVersion] = dc_field(default_factory=list)

    def version_for(self, when: date) -> Optional[RuleVersion]:
        candidates = [v for v in self.versions if v.in_force_on(when)]
        if not candidates:
            return None
        return max(candidates, key=lambda v: v.version)


@dataclass
class RuleResult:
    rule_id: str
    rule_code: str
    rule_version_id: Optional[str]
    rule_version: Optional[int]
    title: str
    severity: str
    result: str
    reason: str
    field: Optional[str] = None
    evidence: Optional[Dict[str, Any]] = None
    source_reference: str = ""
    verification_status: str = "UNVERIFIED"

    def as_dict(self) -> dict:
        return {
            "rule_id": self.rule_id,
            "rule_code": self.rule_code,
            "rule_version_id": self.rule_version_id,
            "rule_version": self.rule_version,
            "title": self.title,
            "severity": self.severity,
            "result": self.result,
            "reason": self.reason,
            "field": self.field,
            "evidence": self.evidence,
            "source_reference": self.source_reference,
            "verification_status": self.verification_status,
        }


# --------------------------------------------------------------------------
# Rule repository
# --------------------------------------------------------------------------

class RuleRepository:
    """Loads versioned rules from JSON. Rules are data, never code."""

    def __init__(self, rules: Sequence[Rule], meta: Optional[Dict[str, Any]] = None):
        self.rules = list(rules)
        self.meta = meta or {}

    @classmethod
    def from_file(cls, path: str) -> "RuleRepository":
        with open(path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
        return cls.from_dict(payload)

    @classmethod
    def from_db_rows(cls, rule_rows: Sequence[Any]) -> "RuleRepository":
        """Build the engine repository from persisted rule data.

        The database is the authoritative runtime source for the admin-managed
        rule catalogue. JSON remains the portable seed/demo source.
        """
        rules: List[Rule] = []
        for raw in rule_rows:
            versions = [
                RuleVersion(
                    version_id=str(v.id), rule_id=str(raw.id), version=int(v.version),
                    effective_from=v.effective_from, effective_to=v.effective_to,
                    definition=v.definition or {}, source_reference=v.source_reference or "",
                    verification_status=v.verification_status or "UNVERIFIED", active=bool(v.active),
                )
                for v in raw.versions
            ]
            if not bool(raw.active):
                continue
            rules.append(Rule(
                rule_id=str(raw.id), code=raw.code, title=raw.title,
                description=raw.description or "", category=raw.category or "general",
                requirement_type=raw.requirement_type or "presence", severity=raw.severity or "MAJOR",
                field=raw.field, applicability=raw.applicability or {}, versions=versions,
            ))
        return cls(rules, {"source": "database"})

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "RuleRepository":
        rules: List[Rule] = []
        for raw in payload.get("rules", []):
            versions = [
                RuleVersion(
                    version_id=v["version_id"],
                    rule_id=raw["rule_id"],
                    version=int(v["version"]),
                    effective_from=v.get("effective_from"),
                    effective_to=v.get("effective_to"),
                    definition=v.get("definition", {}),
                    source_reference=v.get("source_reference", ""),
                    verification_status=v.get("verification_status", "UNVERIFIED"),
                    active=bool(v.get("active", True)),
                )
                for v in raw.get("versions", [])
            ]
            rules.append(
                Rule(
                    rule_id=raw["rule_id"],
                    code=raw["code"],
                    title=raw["title"],
                    description=raw.get("description", ""),
                    category=raw.get("category", "general"),
                    requirement_type=raw.get("requirement_type", "presence"),
                    severity=raw.get("severity", "MAJOR"),
                    field=raw.get("field"),
                    applicability=raw.get("applicability", {}),
                    versions=versions,
                )
            )
        return cls(rules, payload.get("meta", {}))

    def unverified(self) -> List[str]:
        """Rule codes whose in-force version has not been checked against the gazette."""
        out = []
        for rule in self.rules:
            for version in rule.versions:
                if version.active and version.verification_status != "VERIFIED":
                    out.append(f"{rule.code} v{version.version}")
        return out


# --------------------------------------------------------------------------
# Applicability
# --------------------------------------------------------------------------

def _applies(rule: Rule, context: Dict[str, Any]) -> tuple[bool, str]:
    cond = rule.applicability or {}

    categories = cond.get("categories")
    if categories and context.get("category") not in categories:
        return False, f"Rule is limited to categories {categories}; this inspection is '{context.get('category')}'."

    excluded = cond.get("excluded_categories")
    if excluded and context.get("category") in excluded:
        return False, f"Category '{context.get('category')}' is excluded from this rule."

    channels = cond.get("channels")
    if channels and context.get("channel") not in channels:
        return False, f"Rule applies to {channels}; this inspection is '{context.get('channel')}'."

    if cond.get("imported_only") and not context.get("is_imported"):
        return False, "Rule applies only to imported packages."

    if cond.get("requires_pdp_dimensions") and not context.get("panel_width_mm"):
        return False, "Panel dimensions were not recorded, so this measurement rule cannot be applied."

    min_qty = cond.get("min_net_quantity_g_or_ml")
    if min_qty is not None:
        qty = context.get("net_quantity_canonical")
        if qty is None:
            return False, "Net quantity is unknown, so the size-based exemption cannot be resolved."
        if qty < float(min_qty):
            return False, f"Package of {qty} is below the {min_qty} threshold at which this rule applies."

    return True, "Applicable."


# --------------------------------------------------------------------------
# Validators
# --------------------------------------------------------------------------

def _field_of(fields: Dict[str, Any], name: Optional[str]) -> Optional[Dict[str, Any]]:
    if not name:
        return None
    value = fields.get(name)
    if value is None:
        return None
    return value.as_dict() if hasattr(value, "as_dict") else value


def _validate_presence(rule, defn, fld, ctx, measurements):
    if fld is None:
        return REVIEW, f"No extraction was attempted for '{rule.field}'.", None
    if not fld.get("present"):
        return FAIL, f"{rule.title} was not found on any submitted image.", None
    floor = float(defn.get("confidence_floor", DEFAULT_CONFIDENCE_FLOOR))
    if fld.get("confidence", 0.0) < floor:
        return (
            REVIEW,
            f"Read at {fld['confidence']:.0%} confidence, below the {floor:.0%} threshold. "
            "Confirm the value before finalising.",
            fld.get("evidence"),
        )
    return PASS, f"{rule.title} is present: \"{fld.get('raw_value')}\".", fld.get("evidence")


def _validate_format(rule, defn, fld, ctx, measurements):
    if fld is None or not fld.get("present"):
        return NOT_APPLICABLE, "Field is absent; the presence rule reports this separately.", None

    normalized = fld.get("normalized") or {}
    failures: List[str] = []

    for key in defn.get("require_normalized_keys", []):
        if not normalized.get(key):
            failures.append(f"'{key}' could not be resolved from the printed text")

    for key, expected in (defn.get("require_normalized_true") or {}).items():
        if bool(normalized.get(key)) != bool(expected):
            failures.append(defn.get("messages", {}).get(key, f"expected '{key}' to be {expected}"))

    allowed_units = defn.get("allowed_canonical_units")
    if allowed_units and normalized.get("canonical_unit") not in allowed_units:
        failures.append(
            f"unit '{normalized.get('unit')}' is not one of the permitted units {allowed_units}"
        )

    if failures:
        # A formatting shortfall is reported as a finding, but where the shortfall
        # could equally be an OCR miss the rule pack can downgrade it to REVIEW.
        outcome = REVIEW if defn.get("downgrade_to_review") else FAIL
        return outcome, "Formatting issue: " + "; ".join(failures) + ".", fld.get("evidence")
    return PASS, "Declared in the required form.", fld.get("evidence")


def _validate_placement(rule, defn, fld, ctx, measurements):
    if fld is None or not fld.get("present"):
        return NOT_APPLICABLE, "Field is absent; placement cannot be assessed.", None
    panel = fld.get("panel", "unknown")
    required = defn.get("required_panel", "principal")
    if panel == "unknown":
        return (
            REVIEW,
            "The panel this declaration sits on was not identified. Tag the image as front or back, "
            "or capture the panel separately.",
            fld.get("evidence"),
        )
    if panel != required:
        return (
            FAIL,
            f"Found on the {panel} panel, but this declaration is required on the {required} display panel.",
            fld.get("evidence"),
        )
    return PASS, f"{rule.title} appears on the {required} display panel.", fld.get("evidence")


def _validate_character_height(rule, defn, fld, ctx, measurements):
    if fld is None or not fld.get("present"):
        return NOT_APPLICABLE, "Field is absent; height cannot be measured.", None

    measurement = (measurements or {}).get(rule.field)
    if not measurement or measurement.get("status") != "MEASURED":
        detail = (measurement or {}).get("detail", "No scale reference was available.")
        return (
            REVIEW,
            f"Character height could not be measured. {detail} "
            "An unmeasured character is not a proven violation.",
            fld.get("evidence"),
        )

    area = ctx.get("pdp_area_cm2")
    if area is None:
        return REVIEW, "Principal display panel area is unknown, so no height threshold applies.", fld.get("evidence")

    minimum = _threshold_for_area(defn.get("thresholds", []), float(area))
    if minimum is None:
        return REVIEW, f"No height threshold is configured for a panel area of {area:.1f} cm².", fld.get("evidence")

    measured = measurement["height_mm"]
    tolerance = float(defn.get("tolerance_mm", 0.2))
    scale_conf = float(measurement.get("confidence", 0.0))

    if scale_conf < float(defn.get("min_scale_confidence", 0.5)):
        return (
            REVIEW,
            f"Measured {measured:.2f} mm against a {minimum:.2f} mm minimum, but the scale reference is only "
            f"{scale_conf:.0%} reliable. Re-shoot square to the panel before relying on this.",
            fld.get("evidence"),
        )
    if measured >= minimum + tolerance:
        return PASS, f"Measured {measured:.2f} mm against a {minimum:.2f} mm minimum for a {area:.1f} cm² panel.", fld.get("evidence")
    if measured < minimum - tolerance:
        return FAIL, f"Measured {measured:.2f} mm, below the {minimum:.2f} mm minimum for a {area:.1f} cm² panel.", fld.get("evidence")
    return (
        REVIEW,
        f"Measured {measured:.2f} mm against a {minimum:.2f} mm minimum — inside the ±{tolerance} mm "
        "measurement tolerance. Verify physically.",
        fld.get("evidence"),
    )


def _threshold_for_area(thresholds: Sequence[Dict[str, Any]], area_cm2: float) -> Optional[float]:
    """Pick the minimum height band matching the panel area."""
    for band in thresholds:
        low = band.get("min_area_cm2")
        high = band.get("max_area_cm2")
        if low is not None and area_cm2 <= float(low):
            continue
        if high is not None and area_cm2 > float(high):
            continue
        return float(band["min_height_mm"])
    return None


def _validate_consistency(rule, defn, fld, ctx, measurements):
    fields = ctx.get("_fields", {})
    check = defn.get("check")

    if check == "mrp_matches_unit_sale_price":
        mrp = _field_of(fields, "mrp")
        usp = _field_of(fields, "unit_sale_price")
        qty = _field_of(fields, "net_quantity")
        if not (mrp and mrp.get("present") and usp and usp.get("present") and qty and qty.get("present")):
            return NOT_APPLICABLE, "MRP, unit sale price and net quantity are not all present.", None
        try:
            mrp_value = float(mrp["normalized"]["amount"])
            usp_value = float(usp["normalized"]["price"]["amount"])
            per = usp["normalized"].get("per") or {}
            qty_canon = float(qty["normalized"]["canonical_value"])
            per_canon = float(per.get("canonical_value") or 0)
        except (KeyError, TypeError, ValueError):
            return REVIEW, "Values could not be compared numerically.", None
        if per_canon <= 0 or qty_canon <= 0:
            return REVIEW, "Unit basis is unclear, so the two prices cannot be compared.", None
        expected = usp_value * (qty_canon / per_canon)
        drift = abs(expected - mrp_value) / mrp_value if mrp_value else 1.0
        if drift <= float(defn.get("tolerance_fraction", 0.05)):
            return PASS, f"Unit sale price implies {expected:.2f}, consistent with the declared MRP of {mrp_value:.2f}.", mrp.get("evidence")
        return FAIL, f"Unit sale price implies {expected:.2f} but the declared MRP is {mrp_value:.2f}.", mrp.get("evidence")

    if check == "best_before_after_manufacture":
        mfg = _field_of(fields, "date_of_manufacture")
        bb = _field_of(fields, "best_before")
        if not (mfg and mfg.get("present") and bb and bb.get("present")):
            return NOT_APPLICABLE, "Both dates are not present.", None
        m, b = mfg["normalized"], bb["normalized"]
        if (b["year"], b["month"]) < (m["year"], m["month"]):
            return FAIL, f"Best-before {b['iso']} precedes the manufacturing date {m['iso']}.", bb.get("evidence")
        return PASS, f"Best-before {b['iso']} follows the manufacturing date {m['iso']}.", bb.get("evidence")

    if check == "mrp_single_value":
        prices = ctx.get("all_price_candidates") or []
        distinct = {round(float(p), 2) for p in prices}
        if len(distinct) <= 1:
            return PASS, "A single MRP value appears across the submitted images.", None
        return FAIL, f"Conflicting MRP values detected across images: {sorted(distinct)}.", None

    return REVIEW, f"Consistency check '{check}' is not implemented.", None


VALIDATORS = {
    "presence": _validate_presence,
    "format": _validate_format,
    "placement": _validate_placement,
    "character_height": _validate_character_height,
    "consistency": _validate_consistency,
}


# --------------------------------------------------------------------------
# Evaluation
# --------------------------------------------------------------------------

def evaluate(
    repository: RuleRepository,
    fields: Dict[str, Any],
    context: Dict[str, Any],
    measurements: Optional[Dict[str, Any]] = None,
    inspection_date: Optional[date] = None,
) -> Dict[str, Any]:
    """Run every rule against one inspection and aggregate the outcome."""
    when = inspection_date or date.today()
    ctx = dict(context)
    ctx["_fields"] = fields

    # Derived context the applicability engine and validators rely on.
    qty = _field_of(fields, "net_quantity")
    if qty and qty.get("present"):
        ctx.setdefault("net_quantity_canonical", (qty.get("normalized") or {}).get("canonical_value"))
    if ctx.get("panel_width_mm") and ctx.get("panel_height_mm"):
        ctx.setdefault(
            "pdp_area_cm2",
            (float(ctx["panel_width_mm"]) * float(ctx["panel_height_mm"])) / 100.0,
        )

    results: List[RuleResult] = []
    for rule in repository.rules:
        version = rule.version_for(when)
        if version is None:
            results.append(RuleResult(
                rule_id=rule.rule_id, rule_code=rule.code, rule_version_id=None,
                rule_version=None, title=rule.title, severity=rule.severity,
                result=REVIEW,
                reason=f"No rule version is in force on {when.isoformat()}. Finalisation is blocked until the rule data is corrected.",
                field=rule.field,
            ))
            continue

        applicable, why = _applies(rule, ctx)
        if not applicable:
            results.append(RuleResult(
                rule_id=rule.rule_id, rule_code=rule.code, rule_version_id=version.version_id,
                rule_version=version.version, title=rule.title, severity=rule.severity,
                result=NOT_APPLICABLE, reason=why, field=rule.field,
                source_reference=version.source_reference,
                verification_status=version.verification_status,
            ))
            continue

        validator = VALIDATORS.get(rule.requirement_type)
        if validator is None:
            outcome, reason, evidence = REVIEW, f"Unknown requirement type '{rule.requirement_type}'.", None
        else:
            outcome, reason, evidence = validator(
                rule, version.definition, _field_of(fields, rule.field), ctx, measurements
            )

        results.append(RuleResult(
            rule_id=rule.rule_id, rule_code=rule.code, rule_version_id=version.version_id,
            rule_version=version.version, title=rule.title, severity=rule.severity,
            result=outcome, reason=reason, field=rule.field, evidence=evidence,
            source_reference=version.source_reference,
            verification_status=version.verification_status,
        ))

    return aggregate(results)


def aggregate(results: Sequence[RuleResult]) -> Dict[str, Any]:
    """Roll rule-level outcomes up to an inspection status.

    Precedence is deliberate: any FAIL makes the inspection NON_COMPLIANT, but a
    REVIEW outstanding on an otherwise clean inspection blocks a COMPLIANT
    verdict rather than being ignored.
    """
    counts = {PASS: 0, FAIL: 0, REVIEW: 0, NOT_APPLICABLE: 0}
    for r in results:
        counts[r.result] = counts.get(r.result, 0) + 1

    violations = [r for r in results if r.result == FAIL]
    if counts[FAIL]:
        status = "NON_COMPLIANT"
    elif counts[REVIEW]:
        status = "REVIEW_REQUIRED"
    elif counts[PASS]:
        status = "COMPLIANT"
    else:
        status = "REVIEW_REQUIRED"

    severity_rank = {"CRITICAL": 3, "MAJOR": 2, "MINOR": 1}
    highest = max((severity_rank.get(v.severity, 0) for v in violations), default=0)
    highest_label = next((k for k, v in severity_rank.items() if v == highest), None)

    return {
        "status": status,
        "counts": counts,
        "review_required": counts[REVIEW] > 0,
        "highest_severity": highest_label,
        "rule_results": [r.as_dict() for r in results],
        "violations": [v.as_dict() for v in violations],
    }


def default_repository() -> RuleRepository:
    path = os.environ.get(
        "METRISCAN_RULES_PATH",
        os.path.join(os.path.dirname(__file__), "lmpc_rules.json"),
    )
    return RuleRepository.from_file(path)
