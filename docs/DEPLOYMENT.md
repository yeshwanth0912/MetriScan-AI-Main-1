# MetriScan AI — Deployment Specification

**Target Environments:** Local Developer Environment, Docker Compose (SIH Stage), Cloud Production (AWS / DigitalOcean / MeitY Cloud)  

---

## 1. Local Developer Setup

### Prerequisites
* Python 3.11+
* Node.js 18+ (or 20 LTS) & npm / pnpm
* PostgreSQL 16 (or running via Docker)
* Tesseract OCR or PaddleOCR Python dependencies

### Quick Run
```bash
# 1. Backend Setup
cd backend
python -m venv venv
source venv/bin/activate  # Or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
alembic upgrade head
python ../scripts/seed_database.py
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 2. Frontend Setup (New Terminal)
cd ../frontend
npm install
npm run dev
```

---

## 2. Containerized Docker Deployment

### Architecture
```
+-------------------------------------------------------------------+
|                        DOCKER COMPOSE NETWORK                     |
|                                                                   |
|   +-----------------------+              +--------------------+   |
|   |  Frontend Container   |              | Backend Container  |   |
|   |  React / NGINX        | -----------> | FastAPI + Python   |   |
|   |  Port: 3000           |  Proxy API   | Port: 8000         |   |
|   +-----------------------+              +--------------------+   |
|                                                     |             |
|                                                     v             |
|                                          +--------------------+   |
|                                          | Database Container |   |
|                                          | PostgreSQL 16      |   |
|                                          | Port: 5432         |   |
|                                          +--------------------+   |
+-------------------------------------------------------------------+
```

### Run Command
```bash
docker compose up --build
```
* **Frontend:** Accessible at `http://localhost:3000`
* **API Documentation (Swagger):** Accessible at `http://localhost:8000/docs`
* **Database:** Internal PostgreSQL accessible on port 5432
