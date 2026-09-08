"""Anchor-based extraction of mandatory declarations from OCR output.

Design notes
------------
* Every extractor is deterministic and returns evidence (which OCR block, which
  image, which bounding box). No field is ever produced without a source.
* A field that cannot be found is returned as ``present=False`` rather than
  omitted, so the rule engine can distinguish "absent" from "never looked for".
* Nothing here decides compliance. Extraction answers "what does the label
  say"; ``rules/engine.py`` answers "does that meet the requirement".
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field as dc_field
from typing import Any, Callable, Dict, List, Optional, Sequence

from ai.normalization.units import (
    Price,
    Quantity,
    MonthYear,
    collapse_whitespace,
    normalize_month_year,
    normalize_price,
    normalize_quantity,
)


# --------------------------------------------------------------------------
# OCR data structures
# --------------------------------------------------------------------------

@dataclass
class TextBlock:
    """One line/region returned by the OCR engine."""
    text: str
    bbox: Sequence[float]        # [x1, y1, x2, y2] in pixels of the source image
    confidence: float            # 0.0 - 1.0
    image_id: str = ""
    panel: str = "unknown"       # principal | other | unknown

    @property
    def height_px(self) -> float:
        return abs(self.bbox[3] - self.bbox[1])

    @property
    def width_px(self) -> float:
        return abs(self.bbox[2] - self.bbox[0])

    def as_dict(self) -> dict:
        return {
            "text": self.text,
            "bbox": list(self.bbox),
            "confidence": round(self.confidence, 4),
            "image_id": self.image_id,
            "panel": self.panel,
        }


@dataclass
class ExtractedField:
    name: str
    present: bool
    raw_value: Optional[str] = None
    normalized: Optional[Dict[str, Any]] = None
    confidence: float = 0.0
    evidence: Optional[Dict[str, Any]] = None
    panel: str = "unknown"
    notes: List[str] = dc_field(default_factory=list)
    verification_status: str = "DETECTED"   # DETECTED | LOW_CONFIDENCE | VERIFIED | CORRECTED

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "present": self.present,
            "raw_value": self.raw_value,
            "normalized": self.normalized,
            "confidence": round(self.confidence, 4),
            "evidence": self.evidence,
            "panel": self.panel,
            "notes": list(self.notes),
            "verification_status": self.verification_status,
        }


def _evidence(block: TextBlock) -> Dict[str, Any]:
    return {
        "image_id": block.image_id,
        "bbox": list(block.bbox),
        "ocr_text": block.text,
        "ocr_confidence": round(block.confidence, 4),
    }


def _missing(name: str, note: str = "No matching declaration found in OCR output.") -> ExtractedField:
    return ExtractedField(name=name, present=False, confidence=0.0, notes=[note])


# --------------------------------------------------------------------------
# Anchor vocabulary
# --------------------------------------------------------------------------

ANCHORS: Dict[str, List[str]] = {
    "mrp": [
        "maximum retail price", "max retail price", "max. retail price",
        "m.r.p", "mrp", "retail sale price", "rsp",
    ],
    "net_quantity": [
        "net quantity", "net qty", "net wt", "net weight", "net content",
        "net contents", "net vol", "net volume", "quantity",
    ],
    "manufacturer": [
        "manufactured by", "mfd by", "mfd. by", "mfg by", "manufacturer",
        "packed by", "marketed by", "imported by", "importer", "packer",
        "manufactured and packed by", "mfd & packed by",
    ],
    "date_of_manufacture": [
        "date of manufacture", "mfg date", "mfg dt", "date of packing",
        "packed on", "packed in", "month and year of manufacture",
        "mfd on", "mfd", "manufactured on", "date of import", "imported on",
    ],
    "best_before": [
        "best before", "use before", "expiry", "exp date", "exp dt",
        "use by", "best before use", "expiry date",
    ],
    "consumer_care": [
        "consumer care", "customer care", "consumer complaint",
        "for complaints", "customer service", "grievance", "helpline",
        "toll free", "in case of complaint", "consumer helpline",
    ],
    "country_of_origin": [
        "country of origin", "origin", "made in", "product of",
    ],
    "unit_sale_price": [
        "unit sale price", "unit price", "price per", "usp",
    ],
    "commodity_name": [
        "common name", "generic name", "name of commodity", "product name",
        "commodity",
    ],
}

PHONE_RE = re.compile(r"(?:\+?91[\-\s]?)?(?:1800[\-\s]?\d{3}[\-\s]?\d{3,4}|\b[6-9]\d{9}\b|\b0\d{2,4}[\-\s]?\d{6,8}\b)")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]{2,}")
PINCODE_RE = re.compile(r"\b[1-9]\d{5}\b")
ADDRESS_HINT_RE = re.compile(
    r"\b(road|rd\.?|street|st\.?|nagar|marg|lane|plot|phase|sector|industrial|"
    r"estate|district|dist\.?|taluk|village|po\b|p\.o\.|near|opp\.?|floor|"
    r"building|complex|india)\b",
    re.IGNORECASE,
)


def _normalise_anchor(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", text.lower())


def _find_anchor(block: TextBlock, keys: Sequence[str]) -> Optional[str]:
    flat = _normalise_anchor(block.text)
    hits = [k for k in keys if _normalise_anchor(k) in flat]
    return max(hits, key=len) if hits else None


def _tail_after_anchor(block: TextBlock, anchor: str) -> str:
    """Return whatever follows the anchor phrase inside the same block."""
    pattern = re.compile(re.escape(anchor).replace(r"\ ", r"\s*[.:]?\s*"), re.IGNORECASE)
    match = pattern.search(block.text)
    if not match:
        return block.text
    return block.text[match.end():].lstrip(" :.-\u2013\u2014")


def _neighbours(blocks: Sequence[TextBlock], index: int, span: int = 2) -> List[TextBlock]:
    """Blocks immediately after `index` — labels often wrap onto the next line."""
    return list(blocks[index + 1: index + 1 + span])


# --------------------------------------------------------------------------
# Individual extractors
# --------------------------------------------------------------------------

def extract_mrp(blocks: Sequence[TextBlock]) -> ExtractedField:
    for i, block in enumerate(blocks):
        anchor = _find_anchor(block, ANCHORS["mrp"])
        if not anchor:
            continue
        candidates = [(_tail_after_anchor(block, anchor), block)]
        candidates += [(nb.text, nb) for nb in _neighbours(blocks, i)]
        for text, source in candidates:
            price = normalize_price(text)
            if price is None or price.amount <= 0:
                continue
            # Reject a number that is actually the net quantity sitting on the
            # same line ("500 g" would otherwise parse as 500 rupees).
            if normalize_quantity(text) and not price.symbol_present:
                continue
            notes = []
            if not price.inclusive_of_taxes:
                notes.append("No 'inclusive of all taxes' wording detected near the price.")
            if not price.symbol_present:
                notes.append("Currency symbol not detected; value read from context.")
            return ExtractedField(
                name="mrp",
                present=True,
                raw_value=collapse_whitespace(source.text),
                normalized=price.as_dict(),
                confidence=source.confidence,
                evidence=_evidence(source),
                panel=source.panel,
                notes=notes,
            )
    return _missing("mrp")


def extract_net_quantity(blocks: Sequence[TextBlock]) -> ExtractedField:
    for i, block in enumerate(blocks):
        anchor = _find_anchor(block, ANCHORS["net_quantity"])
        if not anchor:
            continue
        candidates = [(_tail_after_anchor(block, anchor), block)]
        candidates += [(nb.text, nb) for nb in _neighbours(blocks, i)]
        for text, source in candidates:
            qty = normalize_quantity(text)
            if qty is None:
                continue
            return ExtractedField(
                name="net_quantity",
                present=True,
                raw_value=collapse_whitespace(source.text),
                normalized=qty.as_dict(),
                confidence=source.confidence,
                evidence=_evidence(source),
                panel=source.panel,
            )
    # Fallback: an unlabelled quantity on the principal panel is still a
    # candidate, but it is flagged so a human confirms it.
    for block in blocks:
        if block.panel != "principal":
            continue
        qty = normalize_quantity(block.text)
        if qty and qty.dimension in ("mass", "volume", "count"):
            return ExtractedField(
                name="net_quantity",
                present=True,
                raw_value=collapse_whitespace(block.text),
                normalized=qty.as_dict(),
                confidence=block.confidence * 0.7,
                evidence=_evidence(block),
                panel=block.panel,
                notes=["Quantity found without a 'Net Quantity' label; confirm before finalising."],
            )
    return _missing("net_quantity")


def extract_manufacturer(blocks: Sequence[TextBlock]) -> ExtractedField:
    for i, block in enumerate(blocks):
        anchor = _find_anchor(block, ANCHORS["manufacturer"])
        if not anchor:
            continue
        parts = [_tail_after_anchor(block, anchor)]
        # An address runs over several lines, but it stops as soon as another
        # declaration begins. Without this guard the date or the consumer care
        # line gets swallowed into the address.
        other_anchors = [k for key, vals in ANCHORS.items() if key != "manufacturer" for k in vals]
        followers: List[TextBlock] = []
        for nb in _neighbours(blocks, i, span=4):
            if _find_anchor(nb, other_anchors):
                break
            followers.append(nb)
        parts += [nb.text for nb in followers]
        full = collapse_whitespace(" ".join(p for p in parts if p))

        role = "manufacturer"
        low = anchor.lower()
        if "import" in low:
            role = "importer"
        elif "pack" in low:
            role = "packer"
        elif "market" in low:
            role = "marketer"

        has_address = bool(ADDRESS_HINT_RE.search(full)) or bool(PINCODE_RE.search(full))
        pin = PINCODE_RE.search(full)
        confidences = [block.confidence] + [nb.confidence for nb in followers]
        notes = []
        if not has_address:
            notes.append("Name found but no address-like text detected after it.")
        return ExtractedField(
            name="manufacturer",
            present=True,
            raw_value=full,
            normalized={
                "role": role,
                "name_and_address": full,
                "has_address": has_address,
                "pincode": pin.group(0) if pin else None,
            },
            confidence=sum(confidences) / len(confidences),
            evidence=_evidence(block),
            panel=block.panel,
            notes=notes,
        )
    return _missing("manufacturer")


def _extract_date(blocks: Sequence[TextBlock], field_name: str, anchor_key: str) -> ExtractedField:
    for i, block in enumerate(blocks):
        anchor = _find_anchor(block, ANCHORS[anchor_key])
        if not anchor:
            continue
        candidates = [(_tail_after_anchor(block, anchor), block)]
        candidates += [(nb.text, nb) for nb in _neighbours(blocks, i)]
        for text, source in candidates:
            when = normalize_month_year(text)
            if when is None:
                continue
            return ExtractedField(
                name=field_name,
                present=True,
                raw_value=collapse_whitespace(source.text),
                normalized=when.as_dict(),
                confidence=source.confidence,
                evidence=_evidence(source),
                panel=source.panel,
            )
    return _missing(field_name)


def extract_date_of_manufacture(blocks: Sequence[TextBlock]) -> ExtractedField:
    return _extract_date(blocks, "date_of_manufacture", "date_of_manufacture")


def extract_best_before(blocks: Sequence[TextBlock]) -> ExtractedField:
    return _extract_date(blocks, "best_before", "best_before")


def extract_consumer_care(blocks: Sequence[TextBlock]) -> ExtractedField:
    anchor_block: Optional[TextBlock] = None
    anchor_index = -1
    for i, block in enumerate(blocks):
        if _find_anchor(block, ANCHORS["consumer_care"]):
            anchor_block, anchor_index = block, i
            break

    # Search the anchor block plus a few following lines for a contact channel.
    window = blocks if anchor_block is None else blocks[anchor_index: anchor_index + 5]
    joined = collapse_whitespace(" ".join(b.text for b in window))
    phone = PHONE_RE.search(joined)
    email = EMAIL_RE.search(joined)

    if anchor_block is None and not (phone or email):
        return _missing("consumer_care")

    if anchor_block is None:
        # Contact details present but no consumer-care wording anchoring them.
        source = next(b for b in blocks if PHONE_RE.search(b.text) or EMAIL_RE.search(b.text))
        return ExtractedField(
            name="consumer_care",
            present=True,
            raw_value=collapse_whitespace(source.text),
            normalized={"phone": phone.group(0) if phone else None,
                        "email": email.group(0) if email else None,
                        "labelled": False},
            confidence=source.confidence * 0.7,
            evidence=_evidence(source),
            panel=source.panel,
            notes=["Contact details found without consumer-care wording; confirm before finalising."],
        )

    notes = []
    if not (phone or email):
        notes.append("Consumer-care wording found but no phone number or email address detected.")
    return ExtractedField(
        name="consumer_care",
        present=bool(phone or email),
        raw_value=joined if (phone or email) else collapse_whitespace(anchor_block.text),
        normalized={"phone": phone.group(0) if phone else None,
                    "email": email.group(0) if email else None,
                    "labelled": True},
        confidence=anchor_block.confidence,
        evidence=_evidence(anchor_block),
        panel=anchor_block.panel,
        notes=notes,
    )


def extract_country_of_origin(blocks: Sequence[TextBlock]) -> ExtractedField:
    for i, block in enumerate(blocks):
        anchor = _find_anchor(block, ANCHORS["country_of_origin"])
        if not anchor:
            continue
        tail = collapse_whitespace(_tail_after_anchor(block, anchor))
        if not tail:
            follower = _neighbours(blocks, i, span=1)
            tail = collapse_whitespace(follower[0].text) if follower else ""
        if not tail:
            continue
        return ExtractedField(
            name="country_of_origin",
            present=True,
            raw_value=collapse_whitespace(block.text),
            normalized={"country": tail.title()},
            confidence=block.confidence,
            evidence=_evidence(block),
            panel=block.panel,
        )
    return _missing("country_of_origin")


def extract_unit_sale_price(blocks: Sequence[TextBlock]) -> ExtractedField:
    for i, block in enumerate(blocks):
        anchor = _find_anchor(block, ANCHORS["unit_sale_price"])
        if not anchor:
            continue
        tail = _tail_after_anchor(block, anchor)
        price = normalize_price(tail)
        if price is None:
            continue
        qty = normalize_quantity(tail)
        return ExtractedField(
            name="unit_sale_price",
            present=True,
            raw_value=collapse_whitespace(block.text),
            normalized={"price": price.as_dict(),
                        "per": qty.as_dict() if qty else None},
            confidence=block.confidence,
            evidence=_evidence(block),
            panel=block.panel,
        )
    return _missing("unit_sale_price")


def extract_commodity_name(blocks: Sequence[TextBlock]) -> ExtractedField:
    for i, block in enumerate(blocks):
        anchor = _find_anchor(block, ANCHORS["commodity_name"])
        if not anchor:
            continue
        tail = collapse_whitespace(_tail_after_anchor(block, anchor))
        if not tail:
            follower = _neighbours(blocks, i, span=1)
            tail = collapse_whitespace(follower[0].text) if follower else ""
        if tail:
            return ExtractedField(
                name="commodity_name",
                present=True,
                raw_value=collapse_whitespace(block.text),
                normalized={"name": tail},
                confidence=block.confidence,
                evidence=_evidence(block),
                panel=block.panel,
            )

    # Fallback: the largest text on the principal panel is usually the name.
    principal = [b for b in blocks if b.panel == "principal" and b.text.strip()]
    if principal:
        biggest = max(principal, key=lambda b: b.height_px)
        return ExtractedField(
            name="commodity_name",
            present=True,
            raw_value=collapse_whitespace(biggest.text),
            normalized={"name": collapse_whitespace(biggest.text)},
            confidence=biggest.confidence * 0.6,
            evidence=_evidence(biggest),
            panel=biggest.panel,
            notes=["Inferred from the largest text on the principal panel; confirm before finalising."],
        )
    return _missing("commodity_name")


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------

EXTRACTORS: Dict[str, Callable[[Sequence[TextBlock]], ExtractedField]] = {
    "commodity_name": extract_commodity_name,
    "net_quantity": extract_net_quantity,
    "mrp": extract_mrp,
    "manufacturer": extract_manufacturer,
    "date_of_manufacture": extract_date_of_manufacture,
    "best_before": extract_best_before,
    "consumer_care": extract_consumer_care,
    "country_of_origin": extract_country_of_origin,
    "unit_sale_price": extract_unit_sale_price,
}


def extract_all(blocks: Sequence[TextBlock]) -> Dict[str, ExtractedField]:
    """Run every extractor over the combined OCR output of an inspection."""
    ordered = list(blocks)
    return {name: fn(ordered) for name, fn in EXTRACTORS.items()}
