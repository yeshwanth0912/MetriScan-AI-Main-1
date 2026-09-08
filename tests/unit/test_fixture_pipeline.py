import os

import cv2
import numpy as np

from ai.pipeline import ImageInput, analyze

FIXTURE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "dataset", "test_cases", "fixtures.json",
)


def _demo_image(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    image = rng.integers(0, 256, (1600, 1200, 3), dtype=np.uint8)
    cv2.putText(image, "DEMO PACKAGE", (100, 800), cv2.FONT_HERSHEY_SIMPLEX,
                2, (255, 255, 255), 4)
    return image


def test_fixture_pipeline_runs_end_to_end(monkeypatch):
    monkeypatch.setenv("OCR_ENGINE", "fixture")
    monkeypatch.setenv("OCR_FIXTURE_PATH", FIXTURE_PATH)
    monkeypatch.setenv("OCR_FIXTURE_CASE", "compliant-biscuit-500g")

    result = analyze(
        inspection_id="fixture-integration",
        images=[
            ImageInput("uploaded-front", image_type="front", array=_demo_image(1)),
            ImageInput("uploaded-back", image_type="back", array=_demo_image(2)),
        ],
        context={"category": "food", "channel": "retail", "is_imported": False},
    )

    assert result.status == "COMPLIANT"
    assert result.engine["ocr_engine"] == "fixture"
    assert result.ocr_blocks
    assert {block["image_id"] for block in result.ocr_blocks} == {
        "uploaded-front", "uploaded-back"
    }
    assert result.fields["net_quantity"]["present"] is True
    assert result.fields["mrp"]["present"] is True
