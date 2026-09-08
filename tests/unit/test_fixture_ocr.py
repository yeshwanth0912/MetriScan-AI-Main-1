import json
import os

from ai.ocr.engine import FixtureEngine

FIXTURE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "dataset", "test_cases", "fixtures.json",
)


def test_fixture_engine_loads_named_case_and_splits_panels():
    engine = FixtureEngine(FIXTURE_PATH, case_id="compliant-biscuit-500g")

    front = engine.read(image_id="uploaded-front", panel="principal")
    back = engine.read(image_id="uploaded-back", panel="other")

    assert front
    assert back
    assert all(block.image_id == "uploaded-front" for block in front)
    assert all(block.image_id == "uploaded-back" for block in back)
    assert any("Net Quantity" in block.text for block in front)
    assert any("Consumer care" in block.text for block in back)


def test_fixture_engine_rejects_unknown_case():
    try:
        FixtureEngine(FIXTURE_PATH, case_id="does-not-exist")
    except ValueError as exc:
        assert "Unknown OCR fixture case" in str(exc)
    else:
        raise AssertionError("Expected an unknown fixture case to raise ValueError")


def test_fixture_engine_keeps_legacy_blocks_format(tmp_path):
    path = tmp_path / "legacy.json"
    path.write_text(json.dumps({"blocks": [{"text": "MRP Rs. 10"}]}), encoding="utf-8")

    engine = FixtureEngine(str(path))
    blocks = engine.read(image_id="img-1", panel="principal")

    assert len(blocks) == 1
    assert blocks[0].text == "MRP Rs. 10"
    assert blocks[0].image_id == "img-1"
