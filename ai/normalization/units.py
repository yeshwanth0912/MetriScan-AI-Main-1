"""Canonicalisation of quantities, prices and dates found on a label.

Pure standard library on purpose: the rule engine must be testable without
OpenCV, PaddleOCR or a database being installed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

# --------------------------------------------------------------------------
# Quantity
# --------------------------------------------------------------------------

# Canonical base units. Mass -> gram, volume -> millilitre, count -> unit,
# length -> metre. Everything on a label reduces to one of these.
_MASS = {
    "mg": 0.001, "milligram": 0.001, "milligrams": 0.001,
    "g": 1.0, "gm": 1.0, "gms": 1.0, "gram": 1.0, "grams": 1.0, "grm": 1.0,
    "kg": 1000.0, "kgs": 1000.0, "kilogram": 1000.0, "kilograms": 1000.0,
}
_VOLUME = {
    "ml": 1.0, "mls": 1.0, "millilitre": 1.0, "millilitres": 1.0,
    "milliliter": 1.0, "milliliters": 1.0,
    "l": 1000.0, "ltr": 1000.0, "ltrs": 1000.0, "litre": 1000.0,
    "litres": 1000.0, "liter": 1000.0, "liters": 1000.0,
    "cl": 10.0, "dl": 100.0,
}
_COUNT = {
    "n": 1.0, "no": 1.0, "nos": 1.0, "number": 1.0, "numbers": 1.0,
    "u": 1.0, "unit": 1.0, "units": 1.0, "pc": 1.0, "pcs": 1.0,
    "piece": 1.0, "pieces": 1.0,
}
_LENGTH = {
    "mm": 0.001, "cm": 0.01, "m": 1.0, "metre": 1.0, "metres": 1.0,
    "meter": 1.0, "meters": 1.0,
}

_DIMENSION_OF = {}
for _u in _MASS:
    _DIMENSION_OF[_u] = ("mass", "g", _MASS[_u])
for _u in _VOLUME:
    _DIMENSION_OF[_u] = ("volume", "ml", _VOLUME[_u])
for _u in _COUNT:
    _DIMENSION_OF[_u] = ("count", "unit", _COUNT[_u])
for _u in _LENGTH:
    _DIMENSION_OF[_u] = ("length", "m", _LENGTH[_u])

# Longest first so "kg" is matched before "g".
_UNIT_ALTERNATION = "|".join(
    sorted((re.escape(u) for u in _DIMENSION_OF), key=len, reverse=True)
)

QUANTITY_RE = re.compile(
    r"(?P<value>\d{1,6}(?:[.,]\d{1,3})?)\s*(?P<unit>" + _UNIT_ALTERNATION + r")\b",
    re.IGNORECASE,
)

# "12 x 50 g", "4 X 100ml" — multipack declarations.
MULTIPACK_RE = re.compile(
    r"(?P<count>\d{1,4})\s*[xX\u00d7]\s*(?P<value>\d{1,6}(?:[.,]\d{1,3})?)\s*"
    r"(?P<unit>" + _UNIT_ALTERNATION + r")\b",
    re.IGNORECASE,
)


@dataclass
class Quantity:
    raw: str
    value: float
    unit: str            # unit exactly as printed, lowercased
    dimension: str       # mass | volume | count | length
    canonical_value: float
    canonical_unit: str  # g | ml | unit | m
    pack_count: int = 1

    def as_dict(self) -> dict:
        return {
            "raw": self.raw,
            "value": self.value,
            "unit": self.unit,
            "dimension": self.dimension,
            "canonical_value": round(self.canonical_value, 4),
            "canonical_unit": self.canonical_unit,
            "pack_count": self.pack_count,
        }


def _to_float(text: str) -> float:
    return float(text.replace(",", "."))


def normalize_quantity(text: str) -> Optional[Quantity]:
    """Turn '500 g', '0.5KG', '12 x 50g' into a canonical Quantity."""
    if not text:
        return None

    multi = MULTIPACK_RE.search(text)
    if multi:
        unit = multi.group("unit").lower()
        dimension, canon_unit, factor = _DIMENSION_OF[unit]
        each = _to_float(multi.group("value"))
        count = int(multi.group("count"))
        return Quantity(
            raw=multi.group(0).strip(),
            value=each,
            unit=unit,
            dimension=dimension,
            canonical_value=each * factor * count,
            canonical_unit=canon_unit,
            pack_count=count,
        )

    single = QUANTITY_RE.search(text)
    if not single:
        return None
    unit = single.group("unit").lower()
    dimension, canon_unit, factor = _DIMENSION_OF[unit]
    value = _to_float(single.group("value"))
    return Quantity(
        raw=single.group(0).strip(),
        value=value,
        unit=unit,
        dimension=dimension,
        canonical_value=value * factor,
        canonical_unit=canon_unit,
    )


# --------------------------------------------------------------------------
# Price
# --------------------------------------------------------------------------

# OCR routinely reads the rupee glyph as R, Rs, ?, ¥ or nothing at all, so the
# currency mark is optional when an MRP keyword is nearby.
PRICE_RE = re.compile(
    r"(?:(?P<sym>\u20b9|Rs\.?|RS\.?|INR|R\.?s\.?)\s*)?"
    r"(?P<amount>\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)"
    r"\s*(?P<paise>/-)?",
    re.IGNORECASE,
)

INCLUSIVE_RE = re.compile(
    r"incl(?:usive)?\.?\s*of\s*all\s*taxes|inclusive\s*of\s*all\s*taxes"
    r"|incl\.?\s*of\s*all\s*tax",
    re.IGNORECASE,
)


@dataclass
class Price:
    raw: str
    amount: float
    currency: str = "INR"
    inclusive_of_taxes: bool = False
    symbol_present: bool = False

    def as_dict(self) -> dict:
        return {
            "raw": self.raw,
            "amount": round(self.amount, 2),
            "currency": self.currency,
            "inclusive_of_taxes": self.inclusive_of_taxes,
            "symbol_present": self.symbol_present,
        }


def normalize_price(text: str) -> Optional[Price]:
    if not text:
        return None
    match = PRICE_RE.search(text)
    if not match:
        return None
    amount = float(match.group("amount").replace(",", ""))
    return Price(
        raw=match.group(0).strip(),
        amount=amount,
        inclusive_of_taxes=bool(INCLUSIVE_RE.search(text)),
        symbol_present=bool(match.group("sym")),
    )


# --------------------------------------------------------------------------
# Dates
# --------------------------------------------------------------------------

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}
_MONTH_ALTERNATION = "|".join(sorted(_MONTHS, key=len, reverse=True))

# 06/2026, 06-2026, 06.2026
NUMERIC_MY_RE = re.compile(r"\b(?P<month>0?[1-9]|1[0-2])\s*[/\-.]\s*(?P<year>20\d{2}|\d{2})\b")
# JUN 2026 / JUNE 2026 / JUN'26
ALPHA_MY_RE = re.compile(
    r"\b(?P<month>" + _MONTH_ALTERNATION + r")\s*[\-/.']?\s*(?P<year>20\d{2}|\d{2})\b",
    re.IGNORECASE,
)
# 12/06/2026 — full date, kept because expiry is often a full date
FULL_DATE_RE = re.compile(
    r"\b(?P<day>0?[1-9]|[12]\d|3[01])\s*[/\-.]\s*(?P<month>0?[1-9]|1[0-2])"
    r"\s*[/\-.]\s*(?P<year>20\d{2}|\d{2})\b"
)


@dataclass
class MonthYear:
    raw: str
    month: int
    year: int
    day: Optional[int] = None

    @property
    def iso(self) -> str:
        if self.day:
            return f"{self.year:04d}-{self.month:02d}-{self.day:02d}"
        return f"{self.year:04d}-{self.month:02d}"

    def as_dict(self) -> dict:
        return {"raw": self.raw, "month": self.month, "year": self.year,
                "day": self.day, "iso": self.iso}


def _expand_year(y: str) -> int:
    n = int(y)
    return n if n > 99 else 2000 + n


def normalize_month_year(text: str) -> Optional[MonthYear]:
    """Accept the month/year forms that appear on Indian retail packs."""
    if not text:
        return None

    full = FULL_DATE_RE.search(text)
    if full:
        return MonthYear(
            raw=full.group(0).strip(),
            month=int(full.group("month")),
            year=_expand_year(full.group("year")),
            day=int(full.group("day")),
        )

    alpha = ALPHA_MY_RE.search(text)
    if alpha:
        return MonthYear(
            raw=alpha.group(0).strip(),
            month=_MONTHS[alpha.group("month").lower()],
            year=_expand_year(alpha.group("year")),
        )

    numeric = NUMERIC_MY_RE.search(text)
    if numeric:
        return MonthYear(
            raw=numeric.group(0).strip(),
            month=int(numeric.group("month")),
            year=_expand_year(numeric.group("year")),
        )
    return None


# --------------------------------------------------------------------------
# Free text
# --------------------------------------------------------------------------

def collapse_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def normalize_text(text: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation used for matching."""
    cleaned = collapse_whitespace(text).lower()
    return re.sub(r"[^\w\s@.+/-]", "", cleaned)
