# MetriScan AI — Compliance Rule Engine Specification

**Module:** `backend/app/rules/`  
**Legal Baseline:** Legal Metrology Act, 2009 & Legal Metrology (Packaged Commodities) Rules, 2011 (PCR 2011, as amended)  

---

## 1. Compliance Philosophy: AI Extracts, Rules Decide

```
+-----------------------------------------------------------------------------------------------+
|                                    COMPLIANCE EVALUATION FLOW                                 |
|                                                                                               |
|  Extracted Declarations [JSON] + Inspection Context (Product Category, Mfg Date, Origin)      |
|                                           |                                                   |
|                                           v                                                   |
|                         [Step 1: Rule Applicability Resolver]                                 |
|                         - Matches Category (Food / Non-Food / Imported)                       |
|                         - Selects active Rule Version for Date of Manufacture                 |
|                                           |                                                   |
|                                           v                                                   |
|                         [Step 2: Deterministic Rule Execution]                                |
|                         Runs discrete, isolated validators:                                   |
|                         * Presence Validator (is mandatory field declared?)                   |
|                         * Unit Validator (is SI unit compliant with PCR Schedule?)            |
|                         * Pricing Validator (is MRP tax-inclusive? USP present?)              |
|                         * Consumer Care Validator (are phone/email provided?)                 |
|                         * Date Format Validator (MM/YYYY syntax)                              |
|                                           |                                                   |
|                                           v                                                   |
|                         [Step 3: Confidence & Uncertainty Gating]                             |
|                         - If field is present but confidence < 0.65:                          |
|                           Result = REVIEW (Do NOT falsely Fail or Pass)                       |
|                                           |                                                   |
|                                           v                                                   |
|                         [Step 4: Global Status Aggregator]                                    |
|                         Evaluates all Rule Results into overall verdict                       |
+-----------------------------------------------------------------------------------------------+
```

---

## 2. Core Legal Metrology Rules Catalog (PCR 2011)

### Rule 1: `LM_RULE_06_1_A_MFG_DETAILS`
* **Statutory Reference:** Rule 6(1)(a) of Legal Metrology (Packaged Commodities) Rules, 2011.
* **Requirement:** Name and complete address of the manufacturer, or packer (if packed by a third party), or importer (if imported).
* **Severity:** `CRITICAL`
* **Validation Logic:**
  - Presence of entity identifier (e.g., "Mfd by", "Packed by", "Imported by").
  - Name string length $\ge 3$ characters.
  - Address must contain geographic anchors (e.g., city, state, or 6-digit postal PIN code).
* **Evaluation:**
  - If missing: `FAIL`
  - If present but confidence $< 0.65$: `REVIEW`
  - If verified: `PASS`

### Rule 2: `LM_RULE_06_1_B_COMMODITY_NAME`
* **Statutory Reference:** Rule 6(1)(b).
* **Requirement:** Common or generic name of the commodity contained in the package.
* **Severity:** `MAJOR`
* **Validation Logic:**
  - Check presence on Principal Display Panel (PDP).
  - Must not be solely a promotional brand slogan.

### Rule 3: `LM_RULE_06_1_C_NET_QUANTITY`
* **Statutory Reference:** Rule 6(1)(c) read with Rule 11 & 12 (Schedule II/III).
* **Requirement:** Net quantity declared in standard units of weight, measure, or number.
* **Severity:** `CRITICAL`
* **Validation Logic:**
  - Unit must be legal SI symbol: `g`, `kg` for mass; `ml`, `l` for liquids; `m`, `cm` for length; `N` or `U` for number.
  - Symbols like `gms`, `grm`, `kilo`, `ltrs` are prohibited by statute (violates Rule 13).
  - Magnitude must be numeric $> 0$.
* **Evaluation:**
  - If unit is non-standard (e.g., `500 gms`): `FAIL` with citation *"Non-standard unit symbol used. Rule 13 permits only 'g'"*.

### Rule 4: `LM_RULE_06_1_D_DATES`
* **Statutory Reference:** Rule 6(1)(d).
* **Requirement:** Month and year in which the commodity is manufactured, pre-packed, or imported.
* **Severity:** `CRITICAL`
* **Validation Logic:**
  - Must match standard date notation (`MM/YYYY` or `Month YYYY` e.g., `08/2026` or `Aug 2026`).
  - Manufacturing date must not be in the future relative to the inspection date.

### Rule 5: `LM_RULE_06_1_E_MAX_RETAIL_PRICE`
* **Statutory Reference:** Rule 6(1)(e).
* **Requirement:** Maximum Retail Price (MRP) clearly stated, inclusive of all taxes.
* **Severity:** `CRITICAL`
* **Validation Logic:**
  - Must declare currency symbol (`₹` or `Rs.` or `INR`).
  - Must contain the mandatory legal phrase *"inclusive of all taxes"* or *"incl. of all taxes"*.
  - For packages containing $> 1\text{ kg}$ or $> 1\text{ L}$, Unit Sale Price (USP e.g., `₹/g` or `₹/ml`) must be declared (as per 2022 amendment).

### Rule 6: `LM_RULE_06_1_F_CONSUMER_CARE`
* **Statutory Reference:** Rule 6(1)(n).
* **Requirement:** Name, address, telephone number, and email address of the person or office to contact in case of consumer complaints.
* **Severity:** `MAJOR`
* **Validation Logic:**
  - Verification of Contact Person / Office title.
  - Valid telephone number / toll-free helpline.
  - Valid email address format.

### Rule 7: `LM_RULE_06_1_G_COUNTRY_OF_ORIGIN`
* **Statutory Reference:** Rule 6(10).
* **Requirement:** Declaration of Country of Origin on imported commodities.
* **Applicability:** Condition `is_imported == True`.
* **Validation Logic:**
  - Explicit country declaration (e.g., "Country of Origin: India", "Made in Vietnam").
  - If domestic product: returns `NOT_APPLICABLE`.

---

## 3. Global Status Aggregation Logic

The final status of the inspection is mathematically derived from the individual rule evaluations:

```python
def aggregate_inspection_status(rule_results: list[RuleResult]) -> str:
    # 1. Any critical or major rule confirmed as FAIL -> Overall status is FAIL
    if any(r.result == "FAIL" and r.severity in ["CRITICAL", "MAJOR"] for r in rule_results):
        return "FAIL"
    
    # 2. Any rule requiring human verification (low confidence OCR or ambiguity) -> REVIEW
    if any(r.result == "REVIEW" for r in rule_results):
        return "REVIEW"
    
    # 3. All applicable rules passed
    if all(r.result in ["PASS", "NOT_APPLICABLE"] for r in rule_results):
        return "PASS"
    
    # Fallback to safe REVIEW state
    return "REVIEW"
```

> [!IMPORTANT]
> **Safety Invariant:** In no situation will an uncertain OCR extraction lead to an automatic `PASS` or automatic `FAIL`. It will always default to `REVIEW`, maintaining strict adherence to legal standards of proof.
