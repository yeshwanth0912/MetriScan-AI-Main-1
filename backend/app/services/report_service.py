"""Compliance report generation.

The PDF is the enforcement-facing artefact, so it carries the things a finding
has to survive on: what the machine read, what a human changed, which rule
version applied, and where the rule text came from.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image as RLImage, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
)

INK = colors.HexColor("#1B2A3A")
MUTED = colors.HexColor("#5B6B7B")
RULE = colors.HexColor("#C9D2DA")
STATUS_COLOURS = {
    "PASS": colors.HexColor("#1B7F4C"),
    "FAIL": colors.HexColor("#B3261E"),
    "REVIEW": colors.HexColor("#B26A00"),
    "NOT_APPLICABLE": colors.HexColor("#6B7785"),
    "COMPLIANT": colors.HexColor("#1B7F4C"),
    "NON_COMPLIANT": colors.HexColor("#B3261E"),
    "REVIEW_REQUIRED": colors.HexColor("#B26A00"),
}

FIELD_LABELS = {
    "commodity_name": "Name of commodity",
    "net_quantity": "Net quantity",
    "mrp": "Retail sale price",
    "manufacturer": "Manufacturer / packer / importer",
    "date_of_manufacture": "Month and year of manufacture",
    "best_before": "Best before",
    "consumer_care": "Consumer care details",
    "country_of_origin": "Country of origin",
    "unit_sale_price": "Unit sale price",
}


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=base["Title"], fontName="Helvetica-Bold",
                                fontSize=17, leading=21, textColor=INK, spaceAfter=2),
        "sub": ParagraphStyle("s", parent=base["Normal"], fontSize=9, leading=12,
                              textColor=MUTED, spaceAfter=8),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold",
                             fontSize=11, leading=14, textColor=INK,
                             spaceBefore=10, spaceAfter=4),
        "body": ParagraphStyle("b", parent=base["Normal"], fontSize=8.5, leading=11.5,
                               textColor=INK, alignment=TA_LEFT),
        "small": ParagraphStyle("sm", parent=base["Normal"], fontSize=7.2, leading=9.5,
                                textColor=MUTED),
    }


def _kv_table(rows: list[tuple[str, str]], st, widths=(45 * mm, 125 * mm)) -> Table:
    data = [[Paragraph(f"<b>{k}</b>", st["body"]), Paragraph(v or "\u2014", st["body"])]
            for k, v in rows]
    table = Table(data, colWidths=list(widths))
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, RULE),
    ]))
    return table


def build_pdf(payload: dict[str, Any], out_path: str) -> str:
    st = _styles()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    doc = SimpleDocTemplate(
        out_path, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
        title=f"MetriScan compliance report {payload['report']['reference']}",
        author="MetriScan AI",
    )
    story: list[Any] = []
    ins = payload["inspection"]
    status = payload["compliance_status"] or "REVIEW_REQUIRED"

    story.append(Paragraph("Packaged commodity compliance report", st["title"]))
    story.append(Paragraph(
        "Legal Metrology (Packaged Commodities) Rules, 2011 as amended &nbsp;|&nbsp; "
        "Machine-assisted inspection, reviewed by an authorised officer", st["sub"]))

    banner = Table(
        [[Paragraph(f"<font color='white'><b>{status.replace('_', ' ')}</b></font>", st["body"]),
          Paragraph(f"<font color='white'>Report {payload['report']['reference']} "
                    f"v{payload['report']['version']} &nbsp; Inspection {ins['reference']}</font>",
                    st["body"])]],
        colWidths=[55 * mm, 115 * mm])
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), STATUS_COLOURS.get(status, MUTED)),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(banner)
    story.append(Spacer(1, 8))

    story.append(Paragraph("Inspection particulars", st["h2"]))
    story.append(_kv_table([
        ("Inspection reference", ins["reference"]),
        ("Date of inspection", str(ins.get("inspection_date") or "")),
        ("Officer", f"{ins['officer_name']}  ({ins.get('officer_designation') or 'Enforcement Officer'})"),
        ("Reviewer", ins.get("reviewer_name") or "Not assigned"),
        ("Premises / location", ", ".join(x for x in [ins.get("premises"), ins.get("location")] if x)),
        ("Channel", "E-commerce listing" if ins.get("channel") == "ecommerce" else "Retail premises"),
        ("Brand / product", ", ".join(x for x in [ins.get("brand"), ins.get("product_name")] if x)),
        ("Category", ins.get("category", "")),
        ("Imported package", "Yes" if ins.get("is_imported") else "No"),
        ("Principal panel size", f"{ins['panel_width_mm']} x {ins['panel_height_mm']} mm"
            if ins.get("panel_width_mm") else "Not recorded \u2014 character height not assessed"),
        ("Analysis time", f"{ins.get('analysis_ms') or 0} ms"),
        ("Finalised at", str(ins.get("finalized_at") or "Not finalised")),
    ], st))

    story.append(Paragraph("Declarations extracted from the package", st["h2"]))
    header = [Paragraph(f"<b>{h}</b>", st["small"]) for h in
              ("Declaration", "Value used", "Read by OCR", "Conf.", "Panel", "Height", "Source")]
    rows = [header]
    for fld in payload["fields"]:
        measurement = fld.get("measurement") or {}
        height = "\u2014"
        if measurement.get("status") == "MEASURED":
            height = f"{measurement['height_mm']:.2f} mm"
        elif measurement.get("status") == "UNMEASURABLE":
            height = "no scale"
        rows.append([
            Paragraph(FIELD_LABELS.get(fld["field_name"], fld["field_name"]), st["small"]),
            Paragraph(fld.get("effective_value") or "<i>Not declared</i>", st["small"]),
            Paragraph(fld.get("raw_value") or "\u2014", st["small"]),
            Paragraph(f"{fld['confidence']:.0%}" if fld.get("present") else "\u2014", st["small"]),
            Paragraph(fld.get("panel", ""), st["small"]),
            Paragraph(height, st["small"]),
            Paragraph("Officer" if fld.get("verification_status") == "CORRECTED" else "OCR", st["small"]),
        ])
    table = Table(rows, colWidths=[33 * mm, 38 * mm, 38 * mm, 12 * mm, 16 * mm, 17 * mm, 16 * mm],
                  repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EDF1F4")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(table)

    story.append(Paragraph("Findings", st["h2"]))
    for item in payload["rule_results"]:
        colour = STATUS_COLOURS.get(item["result"], MUTED)
        block = Table([[
            Paragraph(f"<font color='#{colour.hexval()[2:]}'><b>{item['result'].replace('_', ' ')}</b></font>",
                      st["small"]),
            Paragraph(f"<b>{item['rule_code']} v{item['rule_version'] or '\u2014'}</b> \u2014 {item['title']}<br/>"
                      f"{item['reason']}", st["small"]),
        ]], colWidths=[24 * mm, 146 * mm])
        block.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.25, RULE),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(block)
        if item.get("reviewer_status") in ("CONFIRMED", "OVERRIDDEN"):
            story.append(Paragraph(
                f"&nbsp;&nbsp;Reviewer {item['reviewer_status'].lower()}: {item.get('reviewer_note') or ''}",
                st["small"]))

    # Evidence images, one per page so regions stay legible.
    if payload.get("images"):
        story.append(PageBreak())
        story.append(Paragraph("Evidence", st["h2"]))
        for img in payload["images"]:
            if not img.get("path") or not os.path.exists(img["path"]):
                continue
            try:
                story.append(KeepTogether([
                    Paragraph(f"<b>{img['image_type'].title()} panel</b> \u2014 quality "
                              f"{(img.get('quality_score') or 0):.0%}", st["small"]),
                    Spacer(1, 3),
                    RLImage(img["path"], width=110 * mm, height=110 * mm, kind="proportional"),
                    Spacer(1, 8),
                ]))
            except Exception:
                continue

    story.append(Paragraph("Rule sources", st["h2"]))
    seen: set[str] = set()
    for item in payload["rule_results"]:
        if item["rule_code"] in seen or not item.get("source_reference"):
            continue
        seen.add(item["rule_code"])
        flag = "" if item["verification_status"] == "VERIFIED" else "  [UNVERIFIED RULE DATA]"
        story.append(Paragraph(
            f"<b>{item['rule_code']} v{item['rule_version'] or '\u2014'}</b>{flag}: "
            f"{item['source_reference']}", st["small"]))

    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "This report was produced with machine assistance. Extracted values carry the confidence "
        "shown above and any value marked 'Officer' was corrected by hand. Findings marked REVIEW "
        "are not determinations of non-compliance. The report does not constitute a legal notice "
        "and does not replace the judgment of an authorised officer.", st["small"]))
    story.append(Paragraph(
        f"Generated {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')} by "
        f"{payload['report'].get('generated_by_name', 'MetriScan AI')}.", st["small"]))

    doc.build(story)
    return out_path


def build_json(payload: dict[str, Any], out_path: str) -> str:
    """Structured export for downstream analysis and for editable-format conversion."""
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, default=str)
    return out_path
