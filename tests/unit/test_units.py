"""Unit tests for unit, price, and date canonicalisation."""

import unittest
from ai.normalization.units import (
    normalize_quantity,
    normalize_price,
    normalize_month_year,
    Quantity,
    Price,
    MonthYear,
)


class TestQuantityParsing(unittest.TestCase):
    def test_standard_grams(self):
        q = normalize_quantity("Net Wt: 500 g")
        self.assertIsNotNone(q)
        self.assertEqual(q.dimension, "mass")
        self.assertEqual(q.canonical_value, 500.0)
        self.assertEqual(q.canonical_unit, "g")

    def test_kilograms_conversion(self):
        q = normalize_quantity("1.5 kg")
        self.assertIsNotNone(q)
        self.assertEqual(q.dimension, "mass")
        self.assertEqual(q.canonical_value, 1500.0)
        self.assertEqual(q.canonical_unit, "g")

    def test_colloquial_units(self):
        # Rule 13 prohibits "gms", but parser should understand it
        q = normalize_quantity("250 gms")
        self.assertIsNotNone(q)
        self.assertEqual(q.canonical_value, 250.0)
        self.assertEqual(q.canonical_unit, "g")

    def test_liquid_millilitres(self):
        q = normalize_quantity("Net Volume: 750 ml")
        self.assertIsNotNone(q)
        self.assertEqual(q.dimension, "volume")
        self.assertEqual(q.canonical_value, 750.0)
        self.assertEqual(q.canonical_unit, "ml")

    def test_litres_conversion(self):
        q = normalize_quantity("1.2 L")
        self.assertIsNotNone(q)
        self.assertEqual(q.dimension, "volume")
        self.assertEqual(q.canonical_value, 1200.0)
        self.assertEqual(q.canonical_unit, "ml")

    def test_count_units(self):
        q = normalize_quantity("10 N")
        self.assertIsNotNone(q)
        self.assertEqual(q.dimension, "count")
        self.assertEqual(q.canonical_value, 10.0)


class TestPriceParsing(unittest.TestCase):
    def test_mrp_rupee_symbol(self):
        p = normalize_price("MRP ₹ 120.00 (incl. of all taxes)")
        self.assertIsNotNone(p)
        self.assertEqual(p.amount, 120.0)
        self.assertTrue(p.inclusive_of_taxes)

    def test_mrp_rs_text(self):
        p = normalize_price("Max. Retail Price Rs. 45/- incl. of all taxes")
        self.assertIsNotNone(p)
        self.assertEqual(p.amount, 45.0)
        self.assertTrue(p.inclusive_of_taxes)


class TestDateParsing(unittest.TestCase):
    def test_slash_month_year(self):
        d = normalize_month_year("Mfg: 06/2026")
        self.assertIsNotNone(d)
        self.assertEqual(d.month, 6)
        self.assertEqual(d.year, 2026)

    def test_named_month(self):
        d = normalize_month_year("Packed: AUG 2026")
        self.assertIsNotNone(d)
        self.assertEqual(d.month, 8)
        self.assertEqual(d.year, 2026)


if __name__ == "__main__":
    unittest.main()

