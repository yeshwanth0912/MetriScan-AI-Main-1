"""MetriScan AI application entrypoint."""
import logging
import os
import sys
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# The ai/ and rules/ packages sit beside backend/ in the repository.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.api import analysis, auth, dashboard, inspections, reports, review  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import Base, engine  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("metriscan")

app = FastAPI(
    title=settings.app_name,
    version="0.9.0",
    description=(
        "AI-assisted compliance verification for packaged commodities. "
        "Extraction is machine-assisted; compliance is decided by a versioned "
        "deterministic rule engine and confirmed by an authorised officer."
    ),
)
@app.get("/health", tags=["system"])
def health_check():
    return {
        "status": "ok",
        "service": "MetriScan AI"
    }

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_journal(request: Request, call_next):
    request_id = str(uuid.uuid4())[:8]
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("request=%s %s %s failed", request_id, request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Something went wrong on our side. The action was not saved.",
                     "request_id": request_id},
        )
    duration = int((time.perf_counter() - started) * 1000)
    response.headers["x-request-id"] = request_id
    log.info("request=%s %s %s -> %s %sms",
             request_id, request.method, request.url.path, response.status_code, duration)
    return response


for router in (auth.router, inspections.router, analysis.router, review.router,
               reports.router, dashboard.router):
    app.include_router(router)

# Rules router is imported last because it touches the rule repository singleton.
from app.api import rules  # noqa: E402
app.include_router(rules.router)


@app.on_event("startup")
def startup() -> None:
    # For the MVP the schema is created directly. Switch to Alembic migrations
    # before any deployment that holds data you cannot lose.
    Base.metadata.create_all(bind=engine)
    for sub in ("originals", "processed", "reports"):
        os.makedirs(os.path.join(settings.storage_path, sub), exist_ok=True)

    from app.services import compliance_service
    try:
        repo = compliance_service.repository()
        unverified = repo.unverified()
        log.info("Loaded %d rules from %s", len(repo.rules), settings.rules_path)
        if unverified:
            log.warning(
                "%d rule version(s) are UNVERIFIED against the gazette text: %s. "
                "Finalisation is blocked for inspections that rely on them.",
                len(unverified), ", ".join(unverified[:8]),
            )
    except Exception as exc:
        log.error("Rule pack could not be loaded from %s: %s", settings.rules_path, exc)


@app.get("/api/health")
def health():
    from app.services import compliance_service
    try:
        repo = compliance_service.repository()
        rules_loaded, unverified = len(repo.rules), len(repo.unverified())
    except Exception:
        rules_loaded, unverified = 0, 0
    return {
        "status": "ok",
        "environment": settings.app_env,
        "rules_loaded": rules_loaded,
        "unverified_rule_versions": unverified,
        "allow_unverified_rules": settings.allow_unverified_rules,
    }
