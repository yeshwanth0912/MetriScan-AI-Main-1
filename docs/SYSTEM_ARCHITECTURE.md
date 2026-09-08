# MetriScan AI — System Architecture Specification

**Product:** AI-Assisted Legal Metrology Compliance Inspection Platform  
**Target Organization:** Department of Consumer Affairs (DoCA), Ministry of Consumer Affairs, Food & Public Distribution  
**Document Version:** 1.0 — SIH MVP  

---

## 1. Architectural Strategy & Design Principles

### Modular Monolith Architecture
For the Smart India Hackathon prototype and initial government field deployments, MetriScan AI is engineered as a **Modular Monolith**. 
* **Why Monolith?** Avoids distributed transaction overhead, network latency, and orchestration complexity of multi-container microservices during field testing.
* **Why Modular?** Clean boundary separation ensures that the AI/OCR pipeline, the Compliance Rule Engine, and the API/Reporting services can be split into standalone microservices or serverless workers (e.g., Celery/Redis, AWS Lambda, or Triton Inference Server) as scale demands.

```
+-----------------------------------------------------------------------------------------------------+
|                                          SYSTEM CONTEXT                                             |
|                                                                                                     |
|  [ Enforcement Officer / Admin ]                                                                    |
|                |                                                                                    |
|                | HTTPS / JSON & Multipart Uploads                                                   |
|                v                                                                                    |
|  +-----------------------------------------------------------------------------------------------+  |
|  |                             REACT 18 + TYPESCRIPT FRONTEND (Vite)                             |  |
|  |   - Auth & Role Guards        - Inspection Workflow Stepper    - Interactive Evidence Canvas  |  |
|  |   - Live Dashboard Analytics  - Legal Metrology Rule Admin     - PDF Report Previewer         |  |
|  +-----------------------------------------------------------------------------------------------+  |
|                |                                                                                    |
|                | REST API (JWT Bearer Auth)                                                         |
|                v                                                                                    |
|  +-----------------------------------------------------------------------------------------------+  |
|  |                             FASTAPI ASYNC BACKEND (Modular Core)                              |  |
|  |                                                                                               |  |
|  |  +---------------------+  +---------------------+  +---------------------+                    |  |
|  |  |  Auth & RBAC Module |  |  Inspection Module  |  |  Reporting Module   |                    |  |
|  |  +---------------------+  +---------------------+  +---------------------+                    |  |
|  |             |                        |                        |                               |  |
|  |  +---------------------+  +---------------------+  +---------------------+                    |  |
|  |  | AI Orchestration Svc|  | Compliance Engine   |  | Audit Logging Svc   |                    |  |
|  |  +---------------------+  +---------------------+  +---------------------+                    |  |
|  +-----------------------------------------------------------------------------------------------+  |
|             |                                        |                                              |
|             v                                        v                                              v
|  +-----------------------+              +-----------------------+              +-----------------+  |
|  | AI / CV PIPELINE      |              | POSTGRESQL 16         |              | SECURE STORAGE  |  |
|  | - OpenCV Preprocessor |              | - Relational Schema   |              | - Raw Originals |  |
|  | - PaddleOCR Engine    |              | - JSONB Bounding Boxes|              | - Processed Img |  |
|  | - Field Normalizers   |              | - Rule Version Stores |              | - PDF Reports   |  |
|  +-----------------------+              +-----------------------+              +-----------------+  |
+-----------------------------------------------------------------------------------------------------+
```

---

## 2. Component Layers & Responsibilities

### 1. Presentation Layer (React + Vite + Tailwind CSS)
* **Mobile-Responsive Inspection Stepper:** Single-handed camera capture or file drag-and-drop for field officers.
* **Dual-Pane Evidence Viewer:** Left side displays original package image with SVG overlay bounding boxes; right side displays extracted field cards with confidence badges (`HIGH` in green, `MEDIUM` in amber, `LOW` in red).
* **Click-to-Highlight Interactivity:** Clicking an extracted declaration (e.g., `Net Quantity: 500g`) instantly pans and zooms the image canvas to highlight the exact physical label region.
* **Inline Correction Drawer:** Allows the officer to correct misread characters, triggering real-time re-analysis of the compliance rule without refreshing the page.

### 2. Application & API Layer (FastAPI)
* **Asynchronous Request Handling:** Async I/O prevents long-running image operations from blocking read operations.
* **Strict Type Safety:** Pydantic v2 schemas enforce validation on all inputs and outputs.
* **Middleware Pipeline:** CORS, Security Headers, JWT Token Verification, Rate Limiting, Request Logging with Correlation IDs.

### 3. AI & Computer Vision Subsystem
* **Quality Assessor (`quality.py`):** Calculates blur score via variance of Laplacian ($Var(Laplacian) < 100$ flags blur); assesses brightness histogram to detect severe underexposure or flash glare.
* **Preprocessor (`preprocessing/`):** Auto-rotates orientation using EXIF and text orientation classifiers; applies Contrast Limited Adaptive Histogram Equalization (CLAHE); removes background noise.
* **OCR Ingestor (`ocr/`):** Integrates PaddleOCR (or Tesseract fallback) to extract word-level tokens, bounding box coordinates $[x_1, y_1, x_2, y_2]$, and confidence scores $[0.0 - 1.0]$.
* **Deterministic Field Extractor (`extraction/`):** Domain-specific heuristic regex engines extract statutory fields:
  - MRP & Unit Sale Price
  - Net Quantity & Measurement Units
  - Manufacturing / Packing / Expiry Dates
  - Manufacturer / Packer / Importer Name & Postal Address
  - Consumer Care Details (Phone, Email, Web, Address)
* **Normalizer (`normalization/`):** Canonicalizes values (e.g., standardizing `1 Litre` to `1 L` or `1000 ml`; parsing ambiguous date representations).

### 4. Compliance & Rule Engine (`rules/`)
* **Decoupled Rule Definitions:** Rules are stored as versioned JSON configuration records in PostgreSQL, not hard-coded in Python scripts.
* **Rule Applicability Engine:** Filters rules by commodity category (e.g., food vs. non-food, liquid vs. solid, imported vs. domestic).
* **Multi-Attribute Validators:**
  - `PresenceValidator`: Verifies that mandatory declarations exist.
  - `FormatValidator`: Validates statutory syntax (e.g., "MRP Rs. XX.XX incl. of all taxes").
  - `UnitValidator`: Verifies SI units conform to Legal Metrology Schedule standards.
  - `ConfidenceGate`: Escalates low-confidence extractions to `REVIEW` status rather than returning a false `FAIL` or false `PASS`.

---

## 3. Detailed Data Flow

```
[1. Officer Uploads Package Images]
        |
        v
[2. API validates MIME, file size, assigns UUID]
        |
        v
[3. Storage Service saves raw image to /storage/originals/{uuid}.jpg]
        |
        v
[4. Quality Check calculates Blur & Light score]
        |---> If score < threshold: Return WARNING to user
        v
[5. CV Preprocessor enhances contrast and deskews]
        |
        v
[6. OCR Engine extracts text tokens + bounding boxes]
        |
        v
[7. Extraction Engine maps tokens to Legal Metrology fields]
        |
        v
[8. Normalizer converts to standard units & ISO dates]
        |
        v
[9. Confidence Engine assigns confidence category (HIGH/MED/LOW)]
        |
        v
[10. Compliance Engine matches active Rule Version for inspection date]
        |
        v
[11. Validators evaluate each requirement -> PASS / FAIL / REVIEW]
        |
        v
[12. Aggregator determines overall inspection state]
        |
        v
[13. Results, Bounding Boxes, and Findings persisted to PostgreSQL]
        |
        v
[14. Frontend renders interactive result with clickable evidence overlay]
```

---

## 4. Rule Versioning Architecture

To withstand legal scrutiny in court proceedings, MetriScan AI guarantees **reproducibility across statutory changes**:

```
+---------------------------+             +---------------------------------------+
|           RULES           |             |             RULE_VERSIONS             |
+---------------------------+             +---------------------------------------+
| id: UUID (PK)             | 1         * | id: UUID (PK)                         |
| code: "LM_RULE_06_NETQTY" |<------------| rule_id: UUID (FK)                    |
| title: "Net Quantity"     |             | version: "2022.1"                     |
| category: "FOOD_PACKAGED" |             | effective_from: "2022-01-01"          |
| requirement: "MANDATORY"  |             | effective_to: NULL (Active)           |
| severity: "CRITICAL"      |             | definition: JSONB { logic, regex, .. }|
+---------------------------+             | source_ref: "Gazette GSR 779(E)"      |
                                          +---------------------------------------+
                                                              | 1
                                                              |
                                                              | *
                                          +---------------------------------------+
                                          |             RULE_RESULTS              |
                                          +---------------------------------------+
                                          | id: UUID (PK)                         |
                                          | inspection_id: UUID (FK)              |
                                          | rule_version_id: UUID (FK)            |
                                          | result: "PASS" | "FAIL" | "REVIEW"    |
                                          | reason: "Net quantity unit matches"   |
                                          | evidence_ref: JSONB { bbox, value }   |
                                          +---------------------------------------+
```

When an inspection is created and finalized, it references the specific `rule_version_id` active at that timestamp. If the Ministry amends a rule in 2026, old inspections retain their original version references and remain completely reproducible for legal evidence.
