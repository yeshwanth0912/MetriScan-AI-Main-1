"""Unit tests for deterministic field extraction from OCR TextBlocks."""

import unittest
from ai.extraction.fields import TextBlock, extract_all


class TestFieldExtraction(unittest.TestCase):
    def test_extract_all_compliant(self):
        blocks = [
            TextBlock("PARLE-G ORIGINAL GLUCOSE BISCUITS", [50, 40, 500, 90], 0.98, panel="principal"),
            TextBlock("Net Quantity: 250 g", [50, 100, 300, 130], 0.97, panel="principal"),
            TextBlock("MRP ₹ 25.00 (INCL. OF ALL TAXES)", [50, 140, 420, 170], 0.96, panel="principal"),
            TextBlock("Mfg Date: 05/2026", [50, 180, 250, 210], 0.95, panel="principal"),
            TextBlock("Mfd By: Parle Products Pvt Ltd, Vile Parle Mumbai 400057", [50, 220, 700, 250], 0.94),
            TextBlock("Consumer Care: feedback@parle.biz / 1800-22-7799", [50, 260, 650, 290], 0.93),
        ]
        fields = extract_all(blocks)

        self.assertTrue(fields["commodity_name"].present)
        self.assertTrue(fields["net_quantity"].present)
        self.assertEqual(fields["net_quantity"].normalized["canonical_value"], 250.0)
        self.assertEqual(fields["net_quantity"].normalized["canonical_unit"], "g")

        self.assertTrue(fields["mrp"].present)
        self.assertEqual(fields["mrp"].normalized["amount"], 25.0)

        self.assertTrue(fields["date_of_manufacture"].present)
        self.assertEqual(fields["date_of_manufacture"].normalized["month"], 5)
        self.assertEqual(fields["date_of_manufacture"].normalized["year"], 2026)

        self.assertTrue(fields["manufacturer"].present)
        self.assertTrue(fields["consumer_care"].present)


if __name__ == "__main__":
    unittest.main()
