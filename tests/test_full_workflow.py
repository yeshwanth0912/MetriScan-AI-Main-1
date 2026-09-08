"""End-to-end integration test of the complete MetriScan workflow.

Covers:
  1. System & API Health checks
  2. Authentication (Login, Me, RBAC)
  3. Rule pack loading & verification inspection
  4. Inspection creation
  5. Image upload (front & back synthetic images)
  6. Analysis pipeline with fixture OCR
  7. Results inspection & evidence retrieval
  8. Finalisation of inspection
  9. PDF report generation
 10. Dashboard summary & violation metrics
"""
import io
import os
import sys
import pytest
from PIL import Image
from fastapi.testclient import TestClient

# Ensure root & backend are in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.main import app
from app.seed import main as seed_db


@pytest.fixture(scope="session", autouse=True)
def ensure_seeded():
    seed_db()


@pytest.fixture
def client():
    return TestClient(app)


def _make_dummy_image(color=(220, 220, 220), size=(800, 600)):
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=color)
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf


def test_full_workflow_end_to_end(client, monkeypatch):
    monkeypatch.setenv("OCR_ENGINE", "fixture")
    monkeypatch.setenv("OCR_FIXTURE_CASE", "compliant-biscuit-500g")
    monkeypatch.setenv("ALLOW_UNVERIFIED_RULES", "true")

    # 1. Health checks
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert res.json()["rules_loaded"] > 0

    # 2. Login as Officer
    res = client.post("/api/auth/login", json={
        "email": "officer@metriscan.local",
        "password": "MetriScan#2026"
    })
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Verify /api/auth/me
    res = client.get("/api/auth/me", headers=headers)
    assert res.status_code == 200
    assert res.json()["email"] == "officer@metriscan.local"
    assert res.json()["role"] == "OFFICER"

    # 4. Rules endpoint
    res = client.get("/api/rules", headers=headers)
    assert res.status_code == 200
    assert len(res.json()["items"]) >= 15

    # 5. Create Inspection
    res = client.post("/api/inspections", headers=headers, json={
        "brand": "Britannia",
        "product_name": "Good Day Butter Cookies 500g",
        "category": "food",
        "channel": "retail",
        "location": "Hyderabad",
        "premises": "Supermarket #12",
        "is_imported": False,
        "panel_width_mm": 100.0,
        "panel_height_mm": 80.0,
    })
    assert res.status_code == 201, f"Create inspection failed: {res.text}"
    insp_data = res.json()
    insp_id = insp_data["id"]
    assert insp_id is not None
    assert insp_data["status"] == "DRAFT"

    # 6. Upload front & back images
    front_buf = _make_dummy_image((240, 200, 200))
    res = client.post(
        f"/api/inspections/{insp_id}/images",
        headers=headers,
        data={"image_type": "front"},
        files={"file": ("front.jpg", front_buf, "image/jpeg")}
    )
    assert res.status_code == 201, f"Front image upload failed: {res.text}"

    back_buf = _make_dummy_image((200, 240, 200))
    res = client.post(
        f"/api/inspections/{insp_id}/images",
        headers=headers,
        data={"image_type": "back"},
        files={"file": ("back.jpg", back_buf, "image/jpeg")}
    )
    assert res.status_code == 201, f"Back image upload failed: {res.text}"

    # 7. Analyze inspection
    res = client.post(f"/api/analysis/inspections/{insp_id}/analyze", headers=headers)
    assert res.status_code == 200, f"Analysis failed: {res.text}"
    analysis_res = res.json()
    assert "status" in analysis_res
    assert len(analysis_res["fields"]) > 0
    assert len(analysis_res["rule_results"]) > 0

    # 8. Results and evidence check
    res = client.get(f"/api/analysis/inspections/{insp_id}/results", headers=headers)
    assert res.status_code == 200
    results_data = res.json()
    first_field = results_data["fields"][0]["field_name"]

    res = client.get(f"/api/analysis/inspections/{insp_id}/evidence/{first_field}", headers=headers)
    assert res.status_code == 200
    evidence = res.json()
    assert "field" in evidence

    # 9. Finalize inspection
    res = client.post(f"/api/review/inspections/{insp_id}/finalize", headers=headers)
    assert res.status_code == 200, f"Finalize failed: {res.text}"
    assert res.json()["workflow_status"] == "FINALIZED"

    # 10. Generate PDF Report
    res = client.post(f"/api/reports/inspections/{insp_id}/generate", headers=headers)
    assert res.status_code == 200, f"Report generation failed: {res.text}"
    report_data = res.json()
    assert "pdf_url" in report_data or "id" in report_data

    # 11. Dashboard Summary
    res = client.get("/api/dashboard/summary", headers=headers)
    assert res.status_code == 200
    summary = res.json()
    assert "total_inspections" in summary
    assert summary["total_inspections"] >= 1
