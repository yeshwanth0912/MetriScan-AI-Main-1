# MetriScan AI

Automated compliance checking for packaged commodities under the Legal Metrology
(Packaged Commodities) Rules. Built for SIH Problem Statement 26034.

An officer photographs a pack (or pastes an online listing). The system reads the
mandatory declarations, measures printed character height in millimetres, checks
everything against a versioned rule pack, and produces a report where every finding
traces back to an image region and a specific rule version.

---

## Read this before you demo

**The rule pack ships with placeholder legal content.** The rule *codes*, *structure*
and *engine* are real and tested. The rule *text*, rule numbers and every numeric
threshold marked `UNVERIFIED` in `rules/lmpc_rules.json` are placeholders derived from
the problem statement's own list of mandatory declarations. They are not a legal source.

The character-height threshold table in particular is invented structure with plausible
numbers. Replace it with the table from the current consolidated Rules before the
system makes any claim about readability.

The application enforces this rather than trusting you to remember: an inspection
cannot be finalised while an `UNVERIFIED` rule version produced a PASS or FAIL. Work
through **Rules → Mark verified** for each version, recording the G.S.R. reference you
checked it against. `ALLOW_UNVERIFIED_RULES=false` is the safe default. Only set it to `true` for a clearly
labelled local/demo run using the placeholder rule pack, and never present those results
as legally verified findings.

Amendments to check while you do this, all after the 2011 principal rules:

| Notification | Date | Effect |
|---|---|---|
| G.S.R. 128(E) | 13 Feb 2026 | Inserted Rule 6(10A) — country-of-origin filter for e-commerce listings of imported products |
| Second Amendment Rules 2026 | 27 Apr 2026 | Substituted Rule 6(10A); commencement moved to 1 Jul 2027 |
| Third Amendment Rules 2026, G.S.R. 418(E) | 29 May 2026 | Importer labelling at AEO bonded warehouses, director accountability, annual online updates |
| Jan Vishwas (Amendment of Provisions) Act, 2026 | 8 Apr 2026 | Decriminalisation — affects the severity model, not the declarations |

`LM-E-010A` in the rule pack is a worked example of the versioning mechanism: the same
sub-rule with two versions and two different effective dates. Copy that shape.

---

## What is actually tested

Be precise about this if you are asked.

**Executed and verified:**

- Python unit suite — 26/26 tests pass (`python -m pytest -q`).
- Rule engine, extraction, normalisation — 8/8 golden cases pass
  (`python backend/tests/run_golden.py`).
- FastAPI integration workflow — login → inspection → image upload → fixture OCR →
  rule evaluation → finalisation → PDF report, plus reviewer resolution and RBAC checks.
- Character-height measurement on a synthetic 100 × 80 mm panel photographed at a
  known 8.0 px/mm: panel detection within 3 px, derived scale 8.07 px/mm (0.8% error),
  measured glyph heights within 7–8% of ground truth using the ink-row method.
- PDF and JSON report generation — renders a two-page report with findings, evidence
  and rule sources.

**Not fully executed in this sandbox:** the React production build and Docker image build
require downloading npm/Paddle dependencies, and this environment does not have Docker
or network access to install them. The backend application itself has been started and
its HTTP workflow has been exercised with the deterministic fixture OCR engine.

**Not built:** Alembic migrations (the app uses `create_all`, which is fine until the
first schema change on data you care about), rate limiting, refresh tokens, and any
e-commerce crawler. Listing analysis works on pasted text only, which is deliberate.

---

## Running it

```bash
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"   # paste into JWT_SECRET
docker compose up --build
docker compose exec api python -m app.seed
```

Frontend at `http://localhost:3000`, API docs at `http://localhost:8000/docs`.

Seeded accounts (password `MetriScan#2026`, change `SEED_PASSWORD` first):

| Email | Role | Can do |
|---|---|---|
| `officer@metriscan.local` | OFFICER | Own inspections, corrections, finalise |
| `reviewer@metriscan.local` | REVIEWER | All inspections, confirm/override findings, reopen |
| `admin@metriscan.local` | ADMIN | Rules, users, verification |

### Without Docker

```bash
# API
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export PYTHONPATH=$PWD:$PWD/..
export DATABASE_URL="postgresql+psycopg://metriscan:metriscan@localhost:5432/metriscan"
export JWT_SECRET="dev-secret" STORAGE_PATH="$PWD/../storage" RULES_PATH="$PWD/../rules/lmpc_rules.json"
python -m app.seed && uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```

**PaddleOCR will be the hardest install. If it fights you, set `OCR_ENGINE=tesseract`
with `tesseract-ocr` installed, or explicitly set `OCR_ENGINE=fixture` to replay stored
OCR output. The application no longer silently falls back to fixture data when production
OCR is unavailable; this prevents a demo fixture from being mistaken for real OCR.

---

## How it is put together

```
ai/                    Analysis. Pure Python where possible so it tests without a DB.
  normalization/       "500g", "0.5 KG", "12 x 50g" → one canonical quantity
  extraction/          Anchor-based field extraction; every field carries its evidence
  metrology/           px → mm scale and character height measurement
  preprocessing/       Quality gate, deskew, CLAHE, panel detection
  ocr/                 PaddleOCR | Tesseract | fixture, behind one interface
  pipeline.py          analyze(): images and/or listing text → declarations → findings
rules/
  engine.py            Deterministic, version-aware evaluation and aggregation
  lmpc_rules.json      The rule pack. Rules are data, never code.
backend/app/           FastAPI: auth, inspections, analysis, review, rules, reports
frontend/src/          React: dashboard, capture, inspection workspace, rule admin
dataset/test_cases/    Golden fixtures — add a case every time OCR gets something wrong
```

### Four decisions worth defending

**Absence of evidence is never a violation.** Anything the system cannot establish —
low OCR confidence, no scale reference, unknown panel — returns `REVIEW` or
`NOT_APPLICABLE`, never `FAIL`. A missed violation is recoverable; a false accusation
against a manufacturer is not.

**Character height is measured, not guessed.** This is what most solutions to this
problem statement skip, and the problem statement names it twice. Height in
millimetres needs a pixel-to-millimetre scale, and a photograph does not carry one, so
`ai/metrology/font_size.py` takes it from one of three sources — officer-entered panel
dimensions, a printed ArUco marker, or a reference object of known width — and refuses
to answer without one. Glyph height comes from binarising the crop and measuring inked
rows, which is meaningfully tighter than the OCR bounding box.

**Rule results store a rule version, not a rule.** A finalised inspection stays
reproducible after the rules change. This is also why a version in use cannot be
deleted, only superseded.

**The AI reading is never overwritten.** A correction goes to `corrected_value` with
the original preserved in `raw_value`, and both appear in the report so a reader can
see what the machine read and what the officer changed it to.

---

## Where to go next

In rough order of value:

1. Replace the placeholder rule content with verified gazette text. Nothing else
   matters until this is done.
2. Boot the API and frontend for the first time and fix what breaks.
3. Build the real dataset. Photograph 100+ actual packs, label ground truth, run them
   through, and add every failure to `dataset/test_cases/fixtures.json`. Your accuracy
   claim is only worth what this dataset supports — a number quoted without it will not
   survive questioning.
4. Panel classification from the image itself, rather than trusting the officer's
   front/back tag.
5. Multilingual extraction. The anchor vocabulary in `ai/extraction/fields.py` is
   English-only; Hindi and regional-language labels need their own anchors.
6. Alembic migrations before any deployment holding data you cannot lose.
