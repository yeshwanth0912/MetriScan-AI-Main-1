# MetriScan AI — Project Blueprint
**SIH Problem Statement ID:** 26034  
**Organization:** Ministry of Consumer Affairs, Food & Public Distribution  
**Department:** Department of Consumer Affairs (DoCA)  
**Theme:** Software / AI for Governance  
**Product:** AI-Assisted Legal Metrology Compliance Inspection Platform  

---

## 1. Executive Summary & Problem Understanding

### The Real-World Challenge
Under the **Legal Metrology Act, 2009** and the **Legal Metrology (Packaged Commodities) Rules, 2011 (PCR 2011)**, every pre-packaged commodity sold in India must display mandatory declarations on its packaging (or Principal Display Panel - PDP). These include:
1. **Name and Address of the Manufacturer / Packer / Importer**
2. **Generic or Common Name of the Commodity**
3. **Net Quantity** (in standard SI units: g, kg, ml, l, or number)
4. **Month and Year of Manufacture / Packing / Import**
5. **Maximum Retail Price (MRP)** inclusive of all taxes, with unit sale price where applicable
6. **Consumer Care Details** (name, address, phone number, email)
7. **Country of Origin** (for imported goods)

Currently, Legal Metrology Officers (LMOs) and District Inspectors carry out manual market inspections across retail shops, supermarkets, and warehouses. 

#### Critical Pain Points in Manual Inspection:
* **Severe Human Resource Bottleneck:** Thousands of consumer packaged goods (FMCG) are introduced monthly, but inspectorates operate with limited manpower.
* **Cognitive Fatigue & Errors:** Labels often feature tiny fonts (down to 1 mm), complex multi-panel packaging, glossy reflections, or curved wrappers, making manual verification slow and prone to oversight.
* **Inconsistent Enforcement:** Different officers may interpret ambiguous declarations differently, leading to disputes or court dismissals.
* **Lack of Visual Audit Trails:** Traditional paper challans lack cryptographically bound, image-verified visual evidence of the exact label state at the moment of inspection.
* **E-Commerce & Scale Challenges:** Modern supply chains move at lightning speeds; manual checking cannot keep up with batch-level compliance audits.

---

## 2. The MetriScan AI Solution

**MetriScan AI** is an explainable, rule-versioned, assistive inspection platform designed specifically for Legal Metrology officers. It converts photographs of packaged commodities into structured, legally validated compliance assessments backed by bounding-box visual evidence.

```
+---------------------------------------------------------------------------------------------------+
|                                      METRISCAN AI CORE PIPELINE                                    |
|                                                                                                   |
|  [Product Images]                                                                                 |
|         |                                                                                         |
|         v                                                                                         |
|  +--------------------+      +--------------------+      +--------------------+                   |
|  | Image Quality Gate | ---> | CV Preprocessing   | ---> | OCR Engine         |                   |
|  | (Blur, Light, Res) |      | (Denoise, Deskew)  |      | (Text + Bounding)  |                   |
|  +--------------------+      +--------------------+      +--------------------+                   |
|                                                                     |                             |
|                                                                     v                             |
|  +--------------------+      +--------------------+      +--------------------+                   |
|  | Confidence Engine  | <--- | Normalization      | <--- | Field Extraction   |                   |
|  | (High / Med / Low) |      | (SI Units, Prices) |      | (Regex + Parser)   |                   |
|  +--------------------+      +--------------------+      +--------------------+                   |
|         |                                                                                         |
|         v                                                                                         |
|  +----------------------------------------------------------------------------+                   |
|  | Deterministic Legal Rule Engine (PCR 2011 Config + Rule Versioning)       |                   |
|  | -> Evaluates Mandatory Fields, Date Validity, MRP Format, Unit Price        |                   |
|  | -> Outputs: PASS | FAIL | REVIEW | NOT_APPLICABLE                          |                   |
|  +----------------------------------------------------------------------------+                   |
|         |                                                                                         |
|         v                                                                                         |
|  +----------------------------------------------------------------------------+                   |
|  | Human-in-the-Loop Review & Evidence Linkage                                |                   |
|  | (Officer overrides, visual bounding-box evidence, immutable audit trail)   |                   |
|  +----------------------------------------------------------------------------+                   |
|         |                                                                                         |
|         v                                                                                         |
|  +----------------------------------+          +----------------------------------+               |
|  | Official Legal PDF Inspection    |          | Real-Time DoCA Analytics         |               |
|  | Report & Notice Draft Generation |          | Dashboard & Enforcement Heatmaps |               |
|  +----------------------------------+          +----------------------------------+               |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Core Design Philosophy: Why MetriScan AI Stands Out

### 1. "AI Extracts, Deterministic Rules Decide"
In government legal enforcement, **hallucinating a legal violation is catastrophic**, as is missing an illegal violation. 
* Many naive hackathon projects feed label text to an LLM and ask "Does this comply with Indian law?". This fails because LLMs hallucinate rules, are non-deterministic, and cannot stand scrutiny in a magistrate's court.
* In MetriScan AI, AI is used **strictly for Computer Vision and OCR extraction** (identifying text and coordinates). The actual legal judgment is executed by a **deterministic, unit-tested, mathematical Rule Engine** based directly on codified sections of the Legal Metrology (Packaged Commodities) Rules, 2011.

### 2. Rule Versioning
Statutory regulations evolve (e.g., changes to Unit Sale Price rules in 2022, font size updates, loose commodity exemptions). MetriScan AI models rules as versioned configuration entities (`effective_from`, `effective_to`). An inspection conducted today will always reference the exact rule set in force on the date of manufacture.

### 3. Evidence-First Architecture
Every violation flagged by MetriScan AI links directly to:
* The original unmodified high-resolution photograph.
* Bounding-box coordinates $(x_1, y_1, x_2, y_2)$ highlighting the exact text on the package.
* The extracted raw OCR string and normalized value.
* The exact legal clause violated (e.g., *Rule 6(1)(e) - Net Quantity Unit Violation*).

### 4. Human-in-the-Loop by Design
MetriScan AI is an **assistive tool** that empowers the Legal Metrology Officer; it does not replace the statutory authority of the human officer. If OCR confidence is marginal (e.g., torn label or glare), the system flags the field as `REVIEW` with an amber warning, allowing the officer to confirm or correct the value with a single click.

---

## 4. User Personas & Roles

| Role | Primary Functions | Key Interface Screens |
| :--- | :--- | :--- |
| **Enforcement Officer (LMO)** | Conducts on-field or market audits, captures package photos, verifies extracted fields, logs location, generates official inspection reports. | Quick New Inspection, Mobile-Optimized Camera/Upload, Field Reviewer Screen, PDF Export. |
| **Reviewer / District Officer** | Reviews flagged `REVIEW` inspections, verifies high-penalty violations, resolves disputes, issues formal show-cause notices. | Review Queue, Side-by-Side Evidence Viewer, Audit Trail Inspector. |
| **DoCA System Administrator** | Updates Legal Metrology rules and amendments, manages officer accounts and jurisdiction assignments, views state-wide compliance statistics. | Rule Engine Configurator, Rule Version History, User Management, Global Analytics Dashboard. |

---

## 5. Technology Stack

* **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Canvas/SVG for Bounding Box rendering.
* **Backend:** Python 3.11+, FastAPI (high-performance async API), Pydantic v2 (strict validation), SQLAlchemy 2.0 (ORM), Alembic (migrations).
* **Database:** PostgreSQL 16 (relational integrity, JSONB support for bounding boxes and rule configs).
* **Computer Vision & OCR:** OpenCV (preprocessing, deskew, blur detection via Laplacian variance), PaddleOCR / Tesseract (multi-angle OCR with confidence metrics), NumPy, Pillow.
* **Report Generation:** ReportLab (pixel-precise, tamper-evident legal PDF generation with embedded photos and citations).
* **DevOps & Testing:** Docker, Docker Compose, Pytest (backend unit/integration), Vitest (frontend), Playwright (end-to-end user journeys).

---

## 6. Development Roadmap & Team Division

```
Phase 0: Architecture & Documentation (Completed)
Phase 1: Database Models, Migrations & Core Backend Auth
Phase 2: Image Quality Analysis & Preprocessing Pipeline
Phase 3: OCR Engine & Structured Field Extraction (Regex/Heuristic)
Phase 4: Deterministic Compliance Rule Engine & Versioning
Phase 5: Evidence Linking & Human-in-the-Loop Review APIs
Phase 6: Professional ReportLab PDF Report Generator
Phase 7: Polished React Officer Portal & Real-Time Dashboard
Phase 8: Golden Dataset Benchmarking, Automated Tests & Docker Deployment
```
