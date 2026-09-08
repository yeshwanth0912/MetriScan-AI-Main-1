# MetriScan AI — SIH Winning Demo Guide & Script

**Duration:** 5 to 7 Minutes  
**Target Audience:** Smart India Hackathon (SIH) Jury & Ministry of Consumer Affairs Evaluators  
**Key Value Proposition:** *"From package photo to legally defensible, tamper-evident inspection report in under 10 seconds."*

---

## 1. Demo Roles & Pre-Seeded Accounts

| Persona | Email / Username | Password | Purpose in Demo |
| :--- | :--- | :--- | :--- |
| **Field Officer** | `officer@doca.gov.in` | `OfficerPass2026!` | Performs inspection upload, OCR preview, human review, report generation |
| **District Reviewer** | `reviewer@doca.gov.in` | `ReviewerPass2026!` | Inspects pending review cases, checks historical audit logs |
| **National Admin** | `admin@doca.gov.in` | `AdminPass2026!` | Demonstrates rule versioning and national enforcement analytics |

---

## 2. Step-by-Step Demo Walkthrough (5-Minute Script)

### Step 1: Hook the Judges (0:00 - 0:45)
* **Action:** Open Dashboard on screen.
* **Speaker Script:**
  > *"Respected judges, under the Legal Metrology Packaged Commodities Rules 2011, millions of consumer products enter the market with illegible, misleading, or missing statutory declarations. Today, enforcement officers must manually inspect tiny 1mm fonts on curved, glossy wrappers using magnifying glasses and paper registers.  
  > We present **MetriScan AI** — an explainable, rule-versioned inspection platform that acts as an intelligent co-pilot for enforcement officers, turning any package photo into a legally binding compliance report in seconds."*

### Step 2: Create Inspection & Image Quality Gate (0:45 - 1:45)
* **Action:** Click `+ New Inspection`. Select category `FOOD_PACKAGED`, enter store name *"BigBazaar Connaught Place"*. Upload a test package image (`sample_biscuit_pack.jpg`).
* **Highlight:** Show the real-time **Image Quality Assessment**.
* **Speaker Script:**
  > *"Notice that before running expensive models, MetriScan AI checks blur using Laplacian variance and detects flash glare. If an image is illegible, the system tells the officer immediately to retake it, preventing garbage-in-garbage-out errors."*

### Step 3: Run AI & Bounding Box Evidence (1:45 - 3:00)
* **Action:** Click `Run AI Inspection`. Watch the pipeline execute in ~3 seconds.
* **Highlight:** 
  - Dual-pane interface appears.
  - Left: Package image with interactive SVG bounding boxes.
  - Right: Extracted declarations card with confidence badges (Green/Amber/Red).
  - Hover or click on `Net Quantity: 200g (98% Conf)` $\rightarrow$ Image canvas instantly zooms and highlights the exact bounding box on the label!
* **Speaker Script:**
  > *"This is our core innovation: **Evidence-First AI**. MetriScan AI doesn't just give a verdict; it links every extracted token to its exact pixel coordinates on the package. The officer can verify the ground truth with a single glance."*

### Step 4: The Deterministic Rule Engine & Legal Nuance (3:00 - 4:15)
* **Action:** Scroll down to the **Compliance Findings** section.
* **Demonstrate a deliberate violation:** 
  - Show a package with `"Net Wt. 200 gms"` flagged as `FAIL` under Rule 6(1)(c).
  - Reason displayed: *"Statutory unit violation: Rule 13 explicitly mandates the symbol 'g'. The colloquial abbreviation 'gms' is prohibited."*
* **Demonstrate Human-in-the-Loop:**
  - Show a field where a scratch made the date read `08/2O26` (with letter 'O' instead of '0').
  - System safely flagged it as `REVIEW` (amber) with confidence score 61%.
  - Click `Edit Field`, correct `O` to `0`, click `Save & Re-evaluate`.
  - Watch the rule instantly transition from `REVIEW` to `PASS`.
* **Speaker Script:**
  > *"Notice our cardinal rule: **AI extracts, deterministic rules decide**. We do NOT let an LLM hallucinate legal verdicts. A mathematical rule engine evaluates codified gazette rules. And when OCR is uncertain, it never pretends to know — it routes safely to the human officer."*

### Step 5: Immutable Finalization & Official PDF Certificate (4:15 - 5:15)
* **Action:** Click `Finalize Inspection`. Confirm officer remarks.
* **Highlight:** Click `Download Official Inspection Report (PDF)`.
* **Speaker Script:**
  > *"With one click, MetriScan AI generates a tamper-evident, court-admissible PDF inspection certificate featuring the Ministry header, timestamp, officer badge number, high-res label crop with bounding boxes, and specific gazette rule citations."*

### Step 6: DoCA Executive Dashboard & Rule Versioning (5:15 - 6:00)
* **Action:** Switch to `Admin / Dashboard` tab.
* **Highlight:**
  - Dynamic charts showing state-wide compliance rates, top violated rules (e.g., missing consumer care email), and district heatmaps.
  - Open `Rules Engine` tab to demonstrate **Rule Versioning** (showing how gazette amendments take effect without breaking historical inspection data).
* **Closing Line:**
  > *"MetriScan AI transforms Legal Metrology enforcement from slow, subjective spot-checks into a fast, transparent, and legally unshakeable digital workflow. Thank you, and we welcome your questions!"*

---

## 3. Anticipated Judge Questions & Strong Answers

**Q1: Why not just use GPT-4 Vision or Gemini directly?**  
*Answer:* *"General LLMs are non-deterministic, have high inference latency, suffer from hallucinations, and cannot be cited as legal proof in a court of law. MetriScan AI uses localized OCR strictly to extract tokens, and feeds them to a deterministic, unit-tested rule engine based directly on PCR 2011 clauses. That makes our findings 100% explainable, reproducible, and legally sound."*

**Q2: How does the system handle curved bottles or glossy packaging glare?**  
*Answer:* *"We implement an OpenCV preprocessing pipeline that uses Contrast Limited Adaptive Histogram Equalization (CLAHE) to negate specular glare, and our quality checker flags unreadable angles before OCR runs. Furthermore, multi-panel inspections allow officers to upload separate front, back, and nutrition panel shots."*

**Q3: What if the Legal Metrology rules change in 2026?**  
*Answer:* *"Our rules are not hard-coded in Python. They are stored as versioned configuration records in PostgreSQL with `effective_from` and `effective_to` dates. An inspection finalized today will always retain its original rule version, ensuring complete reproducibility in judicial proceedings."*
