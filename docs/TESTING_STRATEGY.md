# MetriScan AI — Testing Strategy Specification

**Document Version:** 1.0 — SIH MVP  
**Frameworks:** Pytest (Backend & AI), Vitest (Frontend), Playwright (End-to-End)  

---

## 1. Testing Pyramid Overview

```
             / \
            /   \
           / E2E \       Playwright Complete Inspection Journey (5 Tests)
          /-------\
         /  Integ  \     FastAPI + PostgreSQL + Rule Engine Tests (30 Tests)
        /-----------\
       /  Unit & AI  \   OCR Parsers, Quality Checks, Rules, Hashing (80+ Tests)
      /---------------\
```

---

## 2. Test Suites & Focus Areas

### 1. AI & Computer Vision Unit Tests (`tests/ai/`)
* **Blur Detector Tests:** Verifies that synthetic sharp images pass ($>100$) and synthetically blurred Gaussian images fail ($<100$).
* **Field Extractor Regex Tests:**
  - Standard MRP declarations: `MRP Rs. 120.00 incl. of all taxes`, `M.R.P. ₹ 99.50`, `₹150/-`.
  - Non-standard Net Quantity formats: `Net Wt. 500g`, `Net Qty: 1 L`, `1.5 kg`, `250 ml`.
  - Edge cases: Malformed abbreviations (`500 gms`, `1 kilo`), multi-currency symbols, missing numbers.
* **Date Parsing Tests:** Verifies extraction of standard `MM/YYYY`, `DD/MM/YYYY`, `Month YYYY`, and rejection of invalid future dates.
* **Confidence Engine Tests:** Verifies that high OCR confidence + high regex anchor score yields $\ge 0.85$ (`HIGH`), while ambiguous tokens trigger `LOW`.

### 2. Legal Metrology Compliance Rule Tests (`tests/rules/`)
* For every rule in PCR 2011:
  - **PASS Case:** Fully compliant label declarations.
  - **FAIL Case:** Missing mandatory field or prohibited unit representation.
  - **REVIEW Case:** Low OCR confidence or occluded text region.
  - **NOT_APPLICABLE Case:** Country of Origin rule tested on domestic products.
* **Status Aggregator Test:** Verifies that a single `CRITICAL` failure yields an overall `FAIL`, whereas isolated medium-confidence fields yield `REVIEW`.

### 3. Backend API & Auth Integration Tests (`tests/api/`)
* JWT login, role elevation checks, and token expiry.
* Multipart image upload validation: mime type checks, max size limit enforcement.
* Inspection lifecycle state machine transitions (`DRAFT` $\rightarrow$ `ANALYZING` $\rightarrow$ `REVIEW` $\rightarrow$ `FINALIZED`), ensuring illegal transitions (e.g. `DRAFT` $\rightarrow$ `FINALIZED`) are rejected with `400 Bad Request`.
* Human-in-the-loop patch test: updating field values triggers automatic audit log creation.

### 4. Playwright End-to-End Test (`tests/e2e/`)
* Automates the full user journey:
  1. Login as `officer@doca.gov.in`
  2. Create new inspection for *"NutriBake Almond Cookies"*
  3. Upload sample packaging photograph
  4. Wait for analysis completion
  5. Assert that interactive bounding boxes are drawn on the image canvas
  6. Assert compliance findings table renders PASS/FAIL/REVIEW correctly
  7. Correct one low-confidence field
  8. Click Finalize and assert that PDF report is generated and downloadable
