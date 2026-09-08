# MetriScan AI — Developer Setup & Contribution Guide

**Target Audience:** SIH Team Members & Open-Source Contributors  

---

## 1. Local Machine Quickstart

### Step 1: Clone & Configure Environment
```bash
git clone https://github.com/your-org/metriscan-ai.git
cd metriscan-ai
cp .env.example .env
```

### Step 2: Database Initialization
Ensure PostgreSQL is installed and running locally on port 5432:
```bash
createdb metriscan_ai
```

### Step 3: Backend Setup
```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
# source venv/bin/activate

pip install -r requirements.txt
alembic upgrade head
python ../scripts/seed_database.py
uvicorn app.main:app --reload --port 8000
```

### Step 4: Frontend Setup
Open a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Visit `http://localhost:5173` to access the application.

---

## 2. Coding Conventions

* **Backend:** Follow PEP 8. Format using `black` and lint with `ruff`. Type annotations required for all public functions.
* **Frontend:** TypeScript strict mode. Use Tailwind utility classes or custom theme tokens. Avoid inline styles.
* **Git Commits:** Conventional Commits (e.g., `feat(ocr): add CLAHE preprocessing step`, `fix(rules): correct net quantity regex parsing`).
