FROM python:3.12-slim

# OpenCV and PaddleOCR need these at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 libgomp1 curl tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# ai/ and rules/ sit beside backend/ and are imported by it.
COPY ai ./ai
COPY rules ./rules
COPY dataset ./dataset
COPY backend ./backend

ENV PYTHONPATH=/app:/app/backend \
    PYTHONUNBUFFERED=1 \
    METRISCAN_RULES_PATH=/app/rules/lmpc_rules.json

WORKDIR /app/backend
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -fsS http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
