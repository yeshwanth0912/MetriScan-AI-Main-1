"""Confidence aggregation and the human-review gate."""

from __future__ import annotations

from typing import Any, Dict, Sequence

HIGH = 0.90
MEDIUM = 0.70


def band(confidence: float) -> str:
    if confidence >= HIGH:
        return "HIGH"
    if confidence >= MEDIUM:
        return "MEDIUM"
    return "LOW"


def field_confidence(ocr_confidence: float, penalties: Sequence[float] = ()) -> float:
    """Combine the OCR score with extraction penalties into one field score."""
    score = max(0.0, min(1.0, ocr_confidence))
    for penalty in penalties:
        score *= max(0.0, 1.0 - penalty)
    return score


def review_gate(fields: Dict[str, Any], floor: float = MEDIUM) -> Dict[str, Any]:
    """Which fields a human must confirm before the inspection can be finalised."""
    needs: list = []
    for name, fld in fields.items():
        data = fld.as_dict() if hasattr(fld, "as_dict") else fld
        if not data.get("present"):
            continue
        if data.get("verification_status") in ("VERIFIED", "CORRECTED"):
            continue
        if data.get("confidence", 0.0) < floor:
            needs.append({"field": name, "confidence": data.get("confidence"),
                          "band": band(data.get("confidence", 0.0))})
    return {"floor": floor, "fields_needing_review": needs,
            "clear": len(needs) == 0}
