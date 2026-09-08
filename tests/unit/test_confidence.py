"""Unit tests for confidence calculation and review-gating logic."""

import unittest
from ai.confidence.scorer import band, field_confidence, review_gate


class TestConfidenceScorer(unittest.TestCase):
    def test_confidence_bands(self):
        self.assertEqual(band(0.95), "HIGH")
        self.assertEqual(band(0.90), "HIGH")
        self.assertEqual(band(0.85), "MEDIUM")
        self.assertEqual(band(0.70), "MEDIUM")
        self.assertEqual(band(0.69), "LOW")
        self.assertEqual(band(0.40), "LOW")

    def test_field_confidence_with_penalties(self):
        # 0.90 with a 0.20 OCR quality penalty should be 0.72
        score = field_confidence(0.90, penalties=[0.20])
        self.assertAlmostEqual(score, 0.72)

    def test_review_gate_low_confidence(self):
        fields = {
            "net_quantity": {
                "present": True,
                "confidence": 0.95,
                "verification_status": "DETECTED",
            },
            "mfg_date": {
                "present": True,
                "confidence": 0.55,
                "verification_status": "DETECTED",
            },
        }
        gate = review_gate(fields, floor=0.70)
        self.assertFalse(gate["clear"])
        self.assertEqual(len(gate["fields_needing_review"]), 1)
        self.assertEqual(gate["fields_needing_review"][0]["field"], "mfg_date")

    def test_review_gate_verified_override(self):
        fields = {
            "mfg_date": {
                "present": True,
                "confidence": 0.55,
                "verification_status": "VERIFIED",  # Officer reviewed it
            }
        }
        gate = review_gate(fields, floor=0.70)
        self.assertTrue(gate["clear"])


if __name__ == "__main__":
    unittest.main()
