import os
from functools import lru_cache
from pydantic_settings import BaseSettings

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "MetriScan AI"

    database_url: str = os.environ.get("DATABASE_URL", f"sqlite:///{os.path.join(_REPO_ROOT, 'metriscan.db')}")

    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 8

    storage_path: str = os.environ.get("STORAGE_PATH", os.path.join(_REPO_ROOT, "storage"))
    max_upload_mb: int = 12
    allowed_upload_types: str = "image/jpeg,image/png,image/webp"

    rules_path: str = os.environ.get("RULES_PATH", os.path.join(_REPO_ROOT, "rules", "lmpc_rules.json"))
    ocr_engine: str = "paddle"
    ocr_lang: str = "en"
    ocr_fixture_path: str = os.environ.get(
        "OCR_FIXTURE_PATH",
        os.path.join(_REPO_ROOT, "dataset", "test_cases", "fixtures.json"),
    )
    ocr_fixture_case: str = os.environ.get("OCR_FIXTURE_CASE", "compliant-biscuit-500g")
    confidence_floor: float = 0.70

    # Finalisation is blocked while rules that have not been checked against the
    # gazette are producing PASS/FAIL results. Set true for demo / development.
    allow_unverified_rules: bool = False

    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"

    @property
    def upload_types(self) -> list[str]:
        return [t.strip() for t in self.allowed_upload_types.split(",") if t.strip()]

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

if not settings.jwt_secret:
    if settings.app_env.lower() in {"production", "staging"}:
        raise RuntimeError("JWT_SECRET must be set in staging/production.")
    settings.jwt_secret = "dev-only-change-me"

# The standalone AI package reads OCR settings from the process environment.
# Pydantic Settings also supports values from .env, so bridge those resolved
# values into os.environ before the analysis pipeline is invoked.
os.environ.setdefault("OCR_ENGINE", settings.ocr_engine)
os.environ.setdefault("OCR_LANG", settings.ocr_lang)
os.environ.setdefault("OCR_FIXTURE_PATH", settings.ocr_fixture_path)
os.environ.setdefault("OCR_FIXTURE_CASE", settings.ocr_fixture_case)
