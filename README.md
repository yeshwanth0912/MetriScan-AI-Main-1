# MetriScan AI Inspector

> **Automated Statutory Compliance Verification for Packaged Commodities under Legal Metrology (Packaged Commodities) Rules, 2011**  
> *Developed for Smart India Hackathon (SIH) Problem Statement 26034*

[![Node.js](https://img.shields.io/badge/Node.js-18%2B%20%7C%2020%2B-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.3-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Gemini](https://img.shields.io/badge/Vision%20AI-Google%20Gemini%20Flash-orange.svg)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/License-Proprietary-lightgrey.svg)]()

---

## 📌 Overview

**MetriScan AI** is an intelligent regulatory compliance platform engineered for Legal Metrology enforcement officers, senior inspectors, and controllers. An officer photographs packaging panels (front, back, side) or pastes an e-commerce product listing. The platform:

1. **Assesses Optical Quality**: Evaluates blur, sharpness, glare, lighting balance, and resolution, applying optical clarity penalty factors to prevent erroneous accusations.
2. **Extracts Statutory Declarations**: Uses a two-tier OCR/Vision pipeline (primary **Google Gemini Flash Vision** + secondary **Local Tesseract OCR engine**) to extract mandatory pack declarations.
3. **Audits Against Versioned Rules**: Evaluates declarations against codified Legal Metrology (Packaged Commodities) Rules, 2011 (LMPC Rules) and gazette amendments.
4. **Preserves Chain of Custody**: When an officer manually verifies or edits an extracted value, the original machine reading (`raw_value`) is permanently locked alongside the `corrected_value`.
5. **Generates Court-Admissible Reports**: Produces high-contrast, publication-grade PDF inspection dossiers, printable HTML reports, and machine-readable JSON exports.

---

## 🚀 Key Features

- **Dual-Tier Vision Pipeline**:
  - *Primary*: Google Gemini Flash Vision (`@google/genai`) for multi-panel statutory declaration extraction, panel localization, and font height estimation.
  - *Secondary / Offline Fallback*: Local Tesseract OCR with regex pattern anchors and phonetic matching.
- **Optical Integrity & Quality Gate**:
  - Image quality scoring (0–100) analyzing contrast, glare, and sharpness.
  - Dynamic confidence formula: `Final Confidence = Model Confidence × Optical Clarity Factor`.
- **Statutory LMPC Rule Engine**:
  - Evaluates Commodity Name, Net Quantity, MRP (Maximum Retail Price), Unit Sale Price (USP), Date of Manufacture/Packing, Expiry/Best Before, Manufacturer/Packer/Importer details, Country of Origin, and Consumer Care contacts.
  - Rule versioning with gazette citations (e.g., GSR 128(E), Jan Vishwas Act).
- **Audit Trails & Tamper Resistance**:
  - Full audit logging for every inspection state transition, field override, and reviewer sign-off.
- **High-Contrast Court-Admissible Dossier Export**:
  - Precision PDF generation (`jspdf`) featuring high-contrast light styling, evidence photo integration, statutory evaluation matrix, and official regulatory disclaimers.
- **Role-Based Access Control (RBAC)**:
  - Three distinct permission tiers: Officer, Senior Reviewer, and Admin Controller.

---

## 👥 Seeded User Accounts

The application boots with pre-configured regulatory accounts for immediate testing:

| Role | Email | Password | Permissions |
|---|---|---|---|
| **Enforcement Officer** | `officer@metriscan.local` | `MetriScan#2026` | Capture packaging, analyze listings, review OCR, make corrections, submit inspections |
| **Senior Inspector / Reviewer** | `reviewer@metriscan.local` | `MetriScan#2026` | View all inspections, confirm/override findings, certify, reopen cases |
| **Controller / Admin** | `admin@metriscan.local` | `MetriScan#2026` | Manage rule packs, verify statutory rule definitions, manage user access, jurisdiction analytics |

---

## 🛠️ System Architecture

```
metriscan-ai-inspector/
├── server.ts                    # Full-stack entry point (Express API + Vite SPA integration)
├── server/                      # Server-side TypeScript modules
│   ├── extractor.ts             # Multimodal Gemini Vision & Local OCR extraction pipeline
│   ├── local-ocr.ts             # Tesseract.js engine & regex pattern anchors
│   ├── quality.ts               # Sharpness, glare, and optical quality assessment
│   └── rules-engine.ts          # Deterministic LMPC statutory rule evaluation
├── src/                         # React 18 Frontend
│   ├── App.jsx                  # Main router and shell layout
│   ├── api.js                   # Client API abstraction with JWT handling
│   ├── auth.jsx                 # Authentication context & role-based routing
│   ├── components/              # Reusable UI components (Navbar, StatCards, Badges)
│   ├── pages/                   # Application views
│   │   ├── Dashboard.jsx        # Analytics, inspection status counters & activity feed
│   │   ├── NewInspection.jsx    # Photo upload & e-commerce listing capture
│   │   ├── InspectionDetail.jsx # Visual inspection workspace, OCR review & PDF trigger
│   │   ├── InspectionList.jsx   # Filterable registry of all packaging audits
│   │   ├── RuleManagement.jsx   # LMPC statutory rule pack browser & verifier
│   │   └── Login.jsx            # User sign-in interface
│   └── utils/
│       └── pdfExport.js         # High-contrast court-admissible PDF generator (jsPDF)
├── rules/
│   └── lmpc_rules.json          # Codified Legal Metrology rules and statutory thresholds
├── storage/                     # Persistent local database & file storage
│   └── database.json            # Auto-persisted inspections, violations, and audit logs
├── docs/                        # Detailed architectural specifications & PRD documents
└── package.json                 # Project dependencies and operational scripts
```

---

## 💻 Installation & Quickstart

### Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/)

### 1. Clone & Install Dependencies

```bash
# Clone repository
git clone https://github.com/your-org/metriscan-ai.git
cd metriscan-ai

# Install npm dependencies
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Gemini API Key (Required for primary Vision AI)
GEMINI_API_KEY=your_gemini_api_key_here

# JWT Secret for Session Security
JWT_SECRET=metriscan-secret-key-2026

# Server Port (Defaults to 3000)
PORT=3000

# Environment Mode
NODE_ENV=development
```

### 3. Start Development Server

```bash
npm run dev
```

The application will start at **`http://localhost:3000`** with live hot-reloading for client assets and backend APIs.

---

## 📦 Production Deployment

### Build the Application

The production build compiles the React frontend with Vite and bundles `server.ts` using `esbuild` into a self-contained CommonJS artifact (`dist/server.cjs`):

```bash
npm run build
```

### Launch Production Server

```bash
npm start
```

The server binds to `0.0.0.0:3000` and serves the static production build alongside backend API endpoints.

---

## ⚖️ Legal Metrology Compliance Matrix

MetriScan AI validates packaging against the **Legal Metrology (Packaged Commodities) Rules, 2011** and key statutory amendments:

| Rule Code | Statutory Provision | Target Mandate | Enforcement Criterion |
|---|---|---|---|
| **LM-M-001** | Rule 6(1)(a) | Name & Address of Manufacturer / Packer / Importer | Complete address with PIN code, city, and state |
| **LM-M-002** | Rule 6(1)(b) | Generic / Common Name of Commodity | Clearly declared on Principal Display Panel (PDP) |
| **LM-M-003** | Rule 6(1)(c) / Rule 12 | Net Quantity Declaration | Standard metric units (g, kg, ml, L), correct numeral casing |
| **LM-M-004** | Rule 6(1)(d) / Rule 13 | Month & Year of Manufacture / Packing | Valid MM/YYYY or standard format |
| **LM-M-005** | Rule 6(1)(e) | Maximum Retail Price (MRP) | "MRP Rs. ... incl. of all taxes" formulation |
| **LM-M-006** | Rule 6(11) | Unit Sale Price (USP) | Required for commodities sold by weight, volume, or count |
| **LM-M-007** | Rule 6(1)(f) | Best Before / Expiry Period | Mandatory for perishable commodities / cosmetics |
| **LM-M-008** | Rule 6(1)(g) | Consumer Care Details | Name, address, telephone, and email for complaints |
| **LM-M-009** | Rule 6(10) / Rule 6(10A) | Country of Origin | Mandatory on imported goods & e-commerce listings (GSR 128(E)) |
| **LM-M-010** | Schedule II / Rule 9 | Minimum Font Height | Proportional to principal display panel area (e.g. ≥ 2.0 mm) |

---

## 🧪 Verification & Quality Control

### Codebase Validation

```bash
# Validate TypeScript syntax and build integrity
npm run lint

# Execute production build compilation
npm run build
```

---

## 📄 Court-Admissible Reporting

Every finalised inspection produces an official regulatory dossier in three formats:
1. **Dossier PDF (`.pdf`)**: Formatted using high-contrast styling with official Government of India / Legal Metrology Division headers, high-resolution evidence crops, confidence adjustments, and officer sign-off blocks.
2. **Web-Printable Report (`.html`)**: Clean browser-printable version with styled tables.
3. **Audit Data Interchange (`.json`)**: Structured export containing raw and verified extraction records, timestamped audit logs, and citation references.

---

## 📜 Legal Disclaimer

*MetriScan AI is an automated regulatory assistance tool designed to assist statutory authorities under the Legal Metrology Act, 2009. Automated optical readings and rule evaluations serve as preliminary statutory evidence. Final legal notices under Section 36(1) or compounding proceedings under Section 48 must be confirmed and signed by an authorized Enforcement Officer or Inspector.*
