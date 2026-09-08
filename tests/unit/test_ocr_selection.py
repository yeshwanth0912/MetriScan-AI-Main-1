import os

import pytest

from ai.ocr.engine import get_engine


def test_fixture_engine_is_explicit(monkeypatch):
    monkeypatch.setenv("OCR_ENGINE", "fixture")
    monkeypatch.setenv("OCR_FIXTURE_PATH", "dataset/test_cases/fixtures.json")
    monkeypatch.setenv("OCR_FIXTURE_CASE", "compliant-biscuit-500g")
    assert get_engine().name == "fixture"


def test_unknown_engine_is_rejected(monkeypatch):
    monkeypatch.setenv("OCR_ENGINE", "something-else")
    with pytest.raises(ValueError):
        get_engine()


def test_paddle_does_not_silently_fall_back_to_fixture(monkeypatch):
    monkeypatch.setenv("OCR_ENGINE", "paddle")
    monkeypatch.setenv("OCR_ALLOW_TESSERACT_FALLBACK", "false")
    # PaddleOCR is intentionally absent from this CI environment. The important
    # safety property is that a missing production OCR dependency raises instead
    # of silently replaying demo fixture data.
    with pytest.raises(RuntimeError, match="PaddleOCR is unavailable"):
        get_engine()
