# MetriScan AI — Product Requirements Document (PRD)

**Document Version:** 1.0 — SIH MVP  
**Organization:** Ministry of Consumer Affairs, Food & Public Distribution  
**Department:** Department of Consumer Affairs (DoCA)  
**Problem Statement ID:** 26034  

---

## 1. Vision & Purpose
MetriScan AI provides an intelligent, explainable, and legally compliant copilot for Legal Metrology enforcement officers in India. The platform automates the extraction and validation of mandatory packaged-commodity declarations from photographic evidence, dramatically cutting down inspection cycle times while upholding statutory rigor and auditability.

---

## 2. Problem Statement to Product Capability Mapping

| Real-World Challenge | Current Manual Method | MetriScan AI Product Capability |
| :--- | :--- | :--- |
| **Micro-print & hard-to-read text** | Magnifying glasses, visual fatigue | OpenCV image enhancement, adaptive thresholding, multi-scale OCR |
| **Missing mandatory declarations** | Manual checklist comparison | Automated deterministic rule check flagging any missing statutory field |
| **Non-standard units or pricing** | Manual mental calculations | Automated unit normalization (e.g., verifying ₹/g or ₹/ml unit sale price) |
| **Evidentiary challenges in court** | Handwritten notes, loose phone photos | Cryptographically linked image bounding boxes tied to rule violation records |
| **Disjointed records** | Paper logbooks, delayed reporting | Centralized searchable PostgreSQL ledger with instant audit trails |
| **Legal rule amendments over time** | Outdated reference booklets | Versioned Rule Engine matching date-of-manufacture to applicable gazette rules |

---

## 3. User Roles & Permission Matrix (RBAC)

| Feature / Capability | Enforcement Officer | Reviewer / Senior Officer | System Administrator |
| :--- | :---: | :---: | :---: |
| Login & Secure JWT Session | Yes | Yes | Yes |
| Create Inspection & Upload Images | Yes | Yes | Yes |
| Run Automated AI/OCR Analysis | Yes | Yes | Yes |
| View Extracted Fields & Confidence | Yes | Yes | Yes |
| View Visual Bounding Box Evidence | Yes | Yes | Yes |
| Correct Extracted Fields (Human-in-the-Loop) | Yes (own inspection) | Yes (all assigned) | Yes |
| Finalize Inspection & Issue Notice | Yes | Yes | No |
| Generate Official Legal PDF Report | Yes | Yes | Yes |
| View History & Search Archive | Yes (own jurisdiction) | Yes (state-wide) | Yes (all) |
| Access Analytics Dashboard | Basic Officer Stats | Advanced Regional Stats | Complete National Stats |
| Create / Edit / Version Legal Rules | No | No | Yes |
| View System Audit Logs | No | Read-Only | Full Access |

---

## 4. End-to-End User Journey

```
[Officer Login]
      |
      v
[Create New Inspection] ---> Enter Product Name, Brand, Category, Store/Location
      |
      v
[Upload Package Images] ---> Front Panel, Back Panel, Side Panels (Min 1, Up to 6)
      |
      v
[Image Quality Pre-Check] ---> Checks Blur (Laplacian), Brightness, Minimum Resolution
      |                         |-> If Unusable: Alert Officer to Retake Photo
      v
[Execute AI Analysis] ---------> Denoise -> Deskew -> OCR -> Structured Field Extraction
      |
      v
[Review Extracted Fields] -----> Side-by-side view with visual bounding boxes & confidence scores
      |                         |-> High Confidence (>85%): Auto-verified
      |                         |-> Low/Medium Confidence: Highlighted for quick tap-to-verify
      v
[Compliance Rule Check] -------> Deterministic Rule Engine evaluates against PCR 2011
      |                         |-> Generates PASS / FAIL / REVIEW per rule
      v
[Review & Finalize] -----------> Officer inspects flagged violations, adds officer notes
      |
      v
[Generate Report & Close] -----> Generates tamper-evident PDF inspection certificate with DoCA header
```

---

## 5. Functional Requirements (FR)

* **FR-01: Secure Authentication:** Email/Username and password login with salted bcrypt hashing and JWT token issuance.
* **FR-02: Role-Based Access Control:** Strict authorization enforcement at backend middleware/dependency level.
* **FR-03: Inspection Management:** CRUD operations on inspections with metadata: Inspector ID, timestamp, merchant location, GPS coordinates, category.
* **FR-04: Multi-Image Ingestion:** Supports JPG, JPEG, and PNG formats up to 15MB per file with automatic file header validation.
* **FR-05: Image Quality Assessment:** Computes blur index (variance of Laplacian), illumination histogram, and minimum resolution threshold before running OCR.
* **FR-06: Image Preprocessing:** Automatic orientation correction, grayscale normalization, contrast enhancement (CLAHE), and bilateral filtering.
* **FR-07: OCR Text & Bounding Box Extraction:** Dual-pass text extraction outputting UTF-8 text strings, bounding box $(x_1, y_1, x_2, y_2)$ normalized coordinates, and token confidence.
* **FR-08: Statutory Field Extraction:** Deterministic pattern extractors (regex, spatial proximity, key-value association) for:
  - Commodity Name
  - Manufacturer / Packer / Importer Name & Address
  - Net Quantity & Unit
  - Month & Year of Manufacture / Packing / Import
  - Maximum Retail Price (MRP) & Unit Sale Price (USP)
  - Consumer Care Details (Phone, Email, Postal Address)
  - Country of Origin (mandatory for imported commodities)
* **FR-09: Unit & Syntax Normalization:** Standardizes representations (e.g., `500 gm`, `500 gms`, `0.5kg` $\rightarrow$ `500 g`; `Rs. 45/-`, `45.00` $\rightarrow$ `₹ 45.00`).
* **FR-10: Multi-Factor Confidence Scoring:** Calculates field confidence based on OCR word confidence, regex anchor precision, and spatial co-location.
* **FR-11: Deterministic Compliance Rules:** Executes isolated, versioned rules mapping to Legal Metrology (Packaged Commodities) Rules, 2011.
* **FR-12: Four-State Decision Output:** Every rule returns `PASS`, `FAIL`, `REVIEW` (uncertain / occluded), or `NOT_APPLICABLE`.
* **FR-13: Aggregate Inspection Status:** Overall inspection resolves to:
  - `FAIL` if at least one critical mandatory rule fails.
  - `REVIEW` if no failure is confirmed but one or more fields require human confirmation.
  - `PASS` only when all applicable statutory declarations are verified compliant.
* **FR-14: Human-in-the-Loop Override:** Enforcement officers can correct misread OCR values directly, with automatic re-evaluation of affected rules.
* **FR-15: Immutable Audit Logging:** Every user action, field override, and finalization records user ID, previous value, updated value, and timestamp.
* **FR-16: Tamper-Evident PDF Reports:** Generates standardized inspection reports with official Ministry header, product images, highlighted violation bounding boxes, and statutory citations.
* **FR-17: Inspection Archive & Advanced Filters:** Filter inspections by date range, compliance status, commodity category, retail outlet, and officer ID.
* **FR-18: Executive Analytics Dashboard:** Live aggregation of compliance rates, frequent violation categories, officer throughput, and regional breakdown.
* **FR-19: Legal Rule Administration:** Authorized admins can create, update, and deprecate rule sets with explicit effective date windows.

---

## 6. Non-Functional Requirements (NFR)

* **NFR-01 Performance:** Full image processing and OCR extraction pipeline completes within 3 to 8 seconds on standard CPU hardware.
* **NFR-02 Reliability:** Zero data loss on failed uploads; idempotent analysis execution.
* **NFR-03 Explainability:** Every non-compliance alert must cite the specific legal rule clause and display the corresponding visual bounding box.
* **NFR-04 Security:** Passwords stored with Argon2/bcrypt; zero plain-text tokens; all API routes protected by role guards; sanitized file upload paths.
* **NFR-05 Data Integrity:** Raw package images and original OCR JSON payloads are immutable and never overwritten.
* **NFR-06 Maintainability:** Decoupled modular monolith structure; configuration-driven rules allowing updates without backend redeployment.

---

## 7. Status State Machine

```
   [DRAFT] 
      |  (User uploads images & clicks 'Analyze')
      v
 [ANALYZING]
      |  (Pipeline executes: Quality -> Preprocessing -> OCR -> Rules)
      v
  [REVIEW] <-------------------------------+
      |                                    | (Officer edits field & re-runs)
      |-- (Officer verifies all findings) -+
      v
 [FINALIZED] (Locked; read-only; report generated; audit entry logged)
```

---

## 8. MVP Definition of Done (DoD)

1. Officer logs in with authenticated credentials.
2. Officer submits a packaged commodity with 1 to 3 images.
3. System checks image quality and displays actionable feedback if blurry.
4. Preprocessing and OCR extract text and precise bounding boxes.
5. Structured parser extracts Net Quantity, MRP, Dates, Manufacturer, and Consumer Care.
6. Rule Engine validates each field against Legal Metrology Rules, 2011.
7. Officer visualizes the label with interactive bounding boxes highlighting each finding.
8. Officer corrects an OCR typo; rule engine re-runs instantly with audited history.
9. Finalization locks the inspection and produces a downloadable PDF report.
10. Dashboard updates dynamically with real database metrics.
