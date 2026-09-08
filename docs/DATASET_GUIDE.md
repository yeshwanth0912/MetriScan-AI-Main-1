# MetriScan AI — Dataset & Golden Benchmarking Guide

**Purpose:** Curating a safe, synthetic, and representative evaluation suite of packaged commodity label photographs.

---

## 1. Directory Structure

```
data/
├── sample/
│   ├── compliant/
│   │   ├── sample_biscuit_pack_01.jpg
│   │   └── sample_shampoo_bottle_02.jpg
│   ├── non_compliant/
│   │   ├── missing_mrp_pack_01.jpg
│   │   ├── non_standard_unit_pack_02.jpg  # "200 gms" instead of "200 g"
│   │   └── missing_consumer_care_03.jpg
│   └── review_cases/
│       ├── blurred_label_01.jpg
│       └── low_contrast_date_02.jpg
└── test/
    ├── annotations/
    │   └── ground_truth_labels.json
    └── synthetic/
```

---

## 2. Privacy & Synthetic Data Guidelines

* **Zero Personal Identifiable Information (PII):** Do NOT include real personal phone numbers or personal home addresses in test assets.
* **Fictitious Demo Brands:** Use synthetic names (e.g., *"NutriBake Foods Ltd.", "PureHimalaya Beverages"*).
* **Ground-Truth Annotation Format (`ground_truth_labels.json`):**
```json
{
  "image_filename": "sample_biscuit_pack_01.jpg",
  "expected_declarations": {
    "product_name": "Almond Butter Cookies",
    "net_quantity": "200 g",
    "mrp": "45.00 INR",
    "mfg_date": "07/2026",
    "manufacturer": "NutriBake Foods Pvt Ltd, Okhla Industrial Area, New Delhi - 110020",
    "consumer_care": "care@nutribake.com / 1800-11-2026"
  },
  "expected_rule_results": {
    "LM_RULE_06_1_C_NET_QUANTITY": "PASS",
    "LM_RULE_06_1_E_MAX_RETAIL_PRICE": "PASS"
  }
}
```
