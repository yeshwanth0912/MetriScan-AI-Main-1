"""OCR abstraction.

Three engines behind one interface:

* ``PaddleOCREngine``  - the production engine. Multilingual, returns per-line
  boxes and confidence, which is what the evidence view and the character
  height measurement both need.
* ``TesseractEngine``  - fallback for machines where Paddle will not install.
* ``FixtureEngine``    - reads OCR output from a JSON file. This is what makes
  the rule engine testable in CI without model weights, and what lets the team
  work on rules before the vision pipeline is finished.

Selection is by the ``OCR_ENGINE`` environment variable, defaulting to paddle
with an automatic fall back rather than a crash.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Sequence

from ai.extraction.fields import TextBlock


class OCREngine:
    name = "base"
    version = "0"

    def read(self, image, image_id: str = "", panel: str = "unknown") -> List[TextBlock]:
        raise NotImplementedError


class PaddleOCREngine(OCREngine):
    name = "paddleocr"

    def __init__(self, lang: str = "en", use_angle_cls: bool = True):
        from paddleocr import PaddleOCR  # imported lazily; heavy dependency

        self._ocr = PaddleOCR(use_angle_cls=use_angle_cls, lang=lang, show_log=False)
        self.lang = lang
        try:
            import paddleocr
            self.version = getattr(paddleocr, "__version__", "unknown")
        except Exception:
            self.version = "unknown"

    def read(self, image, image_id: str = "", panel: str = "unknown") -> List[TextBlock]:
        raw = self._ocr.ocr(image, cls=True)
        blocks: List[TextBlock] = []
        if not raw:
            return blocks
        # PaddleOCR nests results per page; a single image yields one page.
        page = raw[0] if isinstance(raw[0], list) else raw
        for entry in page or []:
            try:
                points, (text, confidence) = entry[0], entry[1]
            except (TypeError, ValueError, IndexError):
                continue
            xs = [float(p[0]) for p in points]
            ys = [float(p[1]) for p in points]
            blocks.append(TextBlock(
                text=text,
                bbox=[min(xs), min(ys), max(xs), max(ys)],
                confidence=float(confidence),
                image_id=image_id,
                panel=panel,
            ))
        return blocks


class TesseractEngine(OCREngine):
    name = "tesseract"

    def __init__(self, lang: str = "eng"):
        import pytesseract  # imported lazily

        self._pt = pytesseract
        self.lang = lang
        self.version = str(pytesseract.get_tesseract_version())

    def read(self, image, image_id: str = "", panel: str = "unknown") -> List[TextBlock]:
        data = self._pt.image_to_data(image, lang=self.lang,
                                      output_type=self._pt.Output.DICT)
        blocks: List[TextBlock] = []
        n = len(data.get("text", []))
        for i in range(n):
            text = (data["text"][i] or "").strip()
            conf = float(data["conf"][i])
            if not text or conf < 0:
                continue
            x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
            blocks.append(TextBlock(
                text=text,
                bbox=[float(x), float(y), float(x + w), float(y + h)],
                confidence=conf / 100.0,
                image_id=image_id,
                panel=panel,
            ))
        return _merge_words_into_lines(blocks)


class FixtureEngine(OCREngine):
    """Replays stored OCR output. No model weights, fully deterministic."""

    name = "fixture"
    version = "1"

    def __init__(self, fixture_path: Optional[str] = None,
                 blocks: Optional[Sequence[Dict[str, Any]]] = None,
                 case_id: Optional[str] = None):
        self.case_id = case_id or os.environ.get("OCR_FIXTURE_CASE")
        self._cases: Dict[str, Dict[str, Any]] = {}

        if blocks is not None:
            self._blocks = list(blocks)
            return

        if not fixture_path:
            self._blocks = []
            return

        with open(fixture_path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)

        # Support both the legacy {"blocks": [...]} format and the current
        # replay dataset format {"cases": [{"id": ..., "blocks": [...]}]}.
        if isinstance(payload.get("cases"), list):
            self._cases = {str(case["id"]): case for case in payload["cases"]}
            selected_id = self.case_id or os.environ.get("OCR_FIXTURE_DEFAULT_CASE")
            if not selected_id:
                selected_id = next(iter(self._cases), None)
            if selected_id not in self._cases:
                available = ", ".join(sorted(self._cases))
                raise ValueError(
                    f"Unknown OCR fixture case '{selected_id}'. Available cases: {available}"
                )
            self.case_id = selected_id
            self._blocks = list(self._cases[selected_id].get("blocks", []))
        else:
            self._blocks = list(payload.get("blocks", []))

    @staticmethod
    def _source_matches_panel(block: Dict[str, Any], panel: str) -> bool:
        """Map the golden fixture's img-front/img-back IDs to uploaded panels."""
        source_id = str(block.get("image_id", ""))
        block_panel = str(block.get("panel", panel))
        if panel == "principal":
            return block_panel == "principal" or source_id.endswith("-front")
        if panel == "other":
            return block_panel == "other" or source_id.endswith("-back")
        return block_panel == panel

    def read(self, image=None, image_id: str = "", panel: str = "unknown") -> List[TextBlock]:
        # A fixture case represents a whole package. When the API uploads
        # multiple images, return only the blocks belonging to the current
        # panel instead of replaying the entire case for every image.
        selected = [b for b in self._blocks if self._source_matches_panel(b, panel)]
        return [
            TextBlock(
                text=b["text"],
                bbox=b.get("bbox", [0, 0, 0, 0]),
                confidence=float(b.get("confidence", 0.9)),
                # Evidence must point to the real uploaded image, not the
                # fixture's placeholder img-front/img-back ID.
                image_id=image_id,
                panel=b.get("panel", panel),
            )
            for b in selected
        ]


def _merge_words_into_lines(blocks: Sequence[TextBlock], y_tolerance: float = 8.0) -> List[TextBlock]:
    """Tesseract returns words; the extractors expect lines."""
    if not blocks:
        return []
    ordered = sorted(blocks, key=lambda b: (b.bbox[1], b.bbox[0]))
    lines: List[List[TextBlock]] = [[ordered[0]]]
    for block in ordered[1:]:
        current_top = lines[-1][0].bbox[1]
        if abs(block.bbox[1] - current_top) <= y_tolerance:
            lines[-1].append(block)
        else:
            lines.append([block])

    merged: List[TextBlock] = []
    for line in lines:
        line.sort(key=lambda b: b.bbox[0])
        merged.append(TextBlock(
            text=" ".join(b.text for b in line),
            bbox=[min(b.bbox[0] for b in line), min(b.bbox[1] for b in line),
                  max(b.bbox[2] for b in line), max(b.bbox[3] for b in line)],
            confidence=sum(b.confidence for b in line) / len(line),
            image_id=line[0].image_id,
            panel=line[0].panel,
        ))
    return merged


def get_engine(preferred: Optional[str] = None) -> OCREngine:
    """Select OCR explicitly; never silently replace production OCR with fixture data."""
    choice = (preferred or os.environ.get("OCR_ENGINE", "paddle")).lower()
    fixture_path = os.environ.get("OCR_FIXTURE_PATH") or os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "dataset", "test_cases", "fixtures.json"
    )

    if choice.startswith("fixture"):
        return FixtureEngine(fixture_path, case_id=os.environ.get("OCR_FIXTURE_CASE"))

    if choice.startswith("tesseract"):
        try:
            return TesseractEngine(lang=os.environ.get("OCR_LANG_TESS", "eng"))
        except Exception as exc:
            raise RuntimeError(f"Tesseract OCR is unavailable: {exc}") from exc

    if choice.startswith("paddle"):
        try:
            return PaddleOCREngine(lang=os.environ.get("OCR_LANG", "en"))
        except Exception as exc:
            if os.environ.get("OCR_ALLOW_TESSERACT_FALLBACK", "false").lower() == "true":
                try:
                    return TesseractEngine(lang=os.environ.get("OCR_LANG_TESS", "eng"))
                except Exception as tess_exc:
                    raise RuntimeError(
                        f"PaddleOCR is unavailable ({exc}); Tesseract fallback is also unavailable ({tess_exc})."
                    ) from tess_exc
            raise RuntimeError(
                f"PaddleOCR is unavailable ({exc}). Set OCR_ENGINE=fixture only for deterministic demo/test data."
            ) from exc

    raise ValueError(f"Unsupported OCR_ENGINE '{choice}'. Use paddle, tesseract, or fixture.")
