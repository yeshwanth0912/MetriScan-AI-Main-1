"""Unit tests for the deterministic Legal Metrology rule engine."""

import os
import unittest
from rules.engine import (
    RuleRepository,
    evaluate,
    PASS,
    FAIL,
    REVIEW,
    NOT_APPLICABLE,
)

RULES_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "rules", "lmpc_rules.json")


class TestRuleEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo = RuleRepository.from_file(RULES_FILE)

    def test_repository_loaded(self):
        self.assertGreater(len(self.repo.rules), 0)
        # Check that standard mandatory rules exist
        codes = [r.code for r in self.repo.rules]
        self.assertIn("LM-D-001", codes)  # Commodity name
        self.assertIn("LM-D-004", codes)  # MRP

    def test_compliant_evaluation(self):
        from ai.extraction.fields import TextBlock, extract_all
        blocks = [
            TextBlock("Commodity: Almond Cookies", [50, 40, 500, 90], 0.98, panel="principal"),
            TextBlock("Net Quantity: 500 g", [50, 100, 300, 130], 0.98, panel="principal"),
            TextBlock("MRP ₹ 120.00 (INCL. OF ALL TAXES)", [50, 140, 420, 170], 0.96, panel="principal"),
            TextBlock("Mfg Date: 06/2026", [50, 180, 250, 210], 0.95, panel="principal"),
            TextBlock("Mfd By: NutriBake Ltd, Industrial Area Delhi 110020", [50, 220, 700, 250], 0.94),
            TextBlock("Consumer Care: care@nutribake.com / 1800-22-7799", [50, 260, 650, 290], 0.93),
        ]
        fields = extract_all(blocks)
        context = {
            "imported": False,
            "all_price_candidates": [120.0],
        }
        result = evaluate(self.repo, fields, context)
        self.assertEqual(result["status"], "COMPLIANT")
        self.assertEqual(len(result["violations"]), 0)

    def test_missing_mrp_fails(self):
        fields = {
            "commodity_name": {"present": True, "value": "Almond Cookies", "confidence": 0.95},
            "manufacturer": {"present": True, "value": "NutriBake Ltd", "confidence": 0.94},
            "net_quantity": {"present": True, "value": "500 g", "confidence": 0.98},
            "mrp": {"present": False, "value": None, "confidence": 0.0},
            "date_of_manufacture": {"present": True, "value": "06/2026", "confidence": 0.92},
            "consumer_care": {"present": True, "value": "care@nutribake.com", "confidence": 0.91},
        }
        context = {"imported": False, "all_price_candidates": []}
        result = evaluate(self.repo, fields, context)
        self.assertEqual(result["status"], "NON_COMPLIANT")
        violation_codes = [v["rule_code"] for v in result["violations"]]
        self.assertIn("LM-D-004", violation_codes)


if __name__ == "__main__":
    unittest.main()
