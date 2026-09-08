# MetriScan AI — REST API Specification

**Base URL:** `http://localhost:8000/api`  
**Authentication Scheme:** HTTP Bearer (JWT)  
**Content Types:** `application/json`, `multipart/form-data`  

---

## 1. Standard Response & Error Formats

### Success Wrapper
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

### Standard Error Response
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested inspection does not exist or has been archived.",
    "details": {}
  }
}
```

---

## 2. Authentication & User APIs

### `POST /auth/login`
Authenticates user credentials and returns JWT bearer tokens.
* **Access:** Public
* **Request:**
```json
{
  "email": "officer@doca.gov.in",
  "password": "SecurePassword123"
}
```
* **Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "c1f7a4e2-8924-4b51-9e58-3617a4192b91",
    "name": "Rajesh Kumar",
    "email": "officer@doca.gov.in",
    "role": "OFFICER",
    "jurisdiction": "New Delhi Central"
  }
}
```

### `GET /auth/me`
Retrieves current authenticated session profile.
* **Access:** Any authenticated user
* **Headers:** `Authorization: Bearer <token>`
* **Response (200 OK):**
```json
{
  "id": "c1f7a4e2-8924-4b51-9e58-3617a4192b91",
  "name": "Rajesh Kumar",
  "role": "OFFICER",
  "email": "officer@doca.gov.in"
}
```

---

## 3. Inspection Lifecycle APIs

### `POST /inspections`
Initializes a new inspection record.
* **Access:** `OFFICER`, `REVIEWER`, `ADMIN`
* **Request:**
```json
{
  "product_name": "Crunchy Almond Cookies",
  "brand": "NutriBake",
  "category": "FOOD_PACKAGED",
  "location": "SuperBazaar Retail, Connaught Place, New Delhi",
  "gps_lat": 28.6315,
  "gps_lng": 77.2167
}
```
* **Response (201 Created):**
```json
{
  "id": "e932b1a4-3701-447a-8b83-2f08a47cfd21",
  "status": "DRAFT",
  "officer_id": "c1f7a4e2-8924-4b51-9e58-3617a4192b91",
  "created_at": "2026-09-07T10:15:30Z"
}
```

### `GET /inspections`
Lists inspections with query filters and pagination.
* **Query Parameters:** `page=1&limit=20&status=REVIEW&category=FOOD_PACKAGED&search=NutriBake`
* **Response (200 OK):**
```json
{
  "total": 142,
  "page": 1,
  "limit": 20,
  "items": [
    {
      "id": "e932b1a4-3701-447a-8b83-2f08a47cfd21",
      "product_name": "Crunchy Almond Cookies",
      "brand": "NutriBake",
      "status": "REVIEW",
      "compliance_summary": { "pass": 6, "fail": 1, "review": 1 },
      "created_at": "2026-09-07T10:15:30Z"
    }
  ]
}
```

### `GET /inspections/{id}`
Fetches full inspection details, attached images, extracted declarations, and compliance findings.
* **Response (200 OK):**
```json
{
  "id": "e932b1a4-3701-447a-8b83-2f08a47cfd21",
  "status": "REVIEW",
  "product": {
    "name": "Crunchy Almond Cookies",
    "brand": "NutriBake",
    "category": "FOOD_PACKAGED"
  },
  "images": [
    {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "file_path": "/storage/originals/package_front.jpg",
      "image_type": "FRONT_PANEL",
      "quality_score": 0.94,
      "is_usable": true
    }
  ],
  "extracted_fields": [
    {
      "id": "f1a1-field-net-qty",
      "field_name": "net_quantity",
      "raw_value": "Net Wt. 200g",
      "normalized_value": "200",
      "unit": "g",
      "confidence": 0.98,
      "verification_status": "VERIFIED",
      "evidence_ref": {
        "image_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "bbox": [240, 560, 420, 600]
      }
    }
  ],
  "rule_results": [
    {
      "rule_code": "LM_RULE_06_NET_QTY",
      "rule_title": "Mandatory Net Quantity Declaration",
      "result": "PASS",
      "reason": "Standard SI unit 'g' correctly specified.",
      "severity": "CRITICAL"
    }
  ]
}
```

---

## 4. Image Upload & Analysis APIs

### `POST /inspections/{id}/images`
Uploads package photograph (front, back, or side panel).
* **Content-Type:** `multipart/form-data`
* **Form Fields:** `file` (binary), `image_type` (`FRONT_PANEL`, `BACK_PANEL`, `PRINCIPAL_DISPLAY_PANEL`)
* **Response (201 Created):**
```json
{
  "image_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "quality_score": 0.92,
  "is_usable": true,
  "warnings": []
}
```

### `POST /inspections/{id}/analyze`
Triggers image preprocessing, OCR extraction, field normalization, and legal rule engine checks.
* **Response (200 OK):**
```json
{
  "inspection_id": "e932b1a4-3701-447a-8b83-2f08a47cfd21",
  "status": "REVIEW",
  "extracted_count": 7,
  "rule_evaluations": {
    "total": 8,
    "pass": 6,
    "fail": 1,
    "review": 1,
    "not_applicable": 0
  },
  "review_required": true
}
```

---

## 5. Review, Correction & Finalization APIs

### `PATCH /fields/{id}`
Allows an enforcement officer or reviewer to correct an OCR misread.
* **Request:**
```json
{
  "corrected_value": "250 g",
  "reason": "OCR detected 25Og due to font curved glare",
  "re_evaluate": true
}
```
* **Response (200 OK):**
```json
{
  "field_id": "f1a1-field-net-qty",
  "previous_value": "25Og",
  "current_value": "250 g",
  "updated_rule_results": [
    {
      "rule_code": "LM_RULE_06_NET_QTY",
      "result": "PASS"
    }
  ]
}
```

### `POST /inspections/{id}/finalize`
Locks the inspection record, commits the immutable audit log, and marks it ready for legal notice issuance.
* **Request:**
```json
{
  "officer_remarks": "Verified in person. Non-compliance notice issued for missing Consumer Care Email.",
  "final_verdict": "NON_COMPLIANT"
}
```
* **Response (200 OK):**
```json
{
  "status": "FINALIZED",
  "finalized_at": "2026-09-07T10:45:00Z",
  "report_url": "/api/reports/e932b1a4-3701-447a-8b83-2f08a47cfd21/download"
}
```

---

## 6. Report & Dashboard Analytics APIs

### `POST /inspections/{id}/report`
Generates the official PDF inspection certificate.
* **Response (200 OK):**
```json
{
  "report_id": "rep-4819a2b0-4491",
  "download_url": "/api/reports/rep-4819a2b0-4491/download",
  "generated_at": "2026-09-07T10:45:30Z"
}
```

### `GET /dashboard/summary`
Returns live statistics for the executive dashboard.
* **Response (200 OK):**
```json
{
  "total_inspections": 348,
  "compliant_count": 264,
  "non_compliant_count": 68,
  "review_pending_count": 16,
  "compliance_rate_pct": 75.8,
  "top_violations": [
    { "category": "Consumer Care Email Missing", "count": 34 },
    { "category": "Improper Unit Sale Price (USP)", "count": 22 },
    { "category": "Net Quantity Font Size < Minimum", "count": 12 }
  ]
}
```
