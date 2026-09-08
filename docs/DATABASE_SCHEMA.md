# MetriScan AI — Database Schema Specification

**Engine:** PostgreSQL 16  
**ORM:** SQLAlchemy 2.0 (Async)  
**Migration Tool:** Alembic  

---

## 1. Entity-Relationship (ER) Architecture

```
                  +---------------+
                  |     ROLES     |
                  +---------------+
                          | 1
                          |
                          | *
+---------------+  1    * +---------------+
|   PRODUCTS    |<--------|     USERS     |
+---------------+         +---------------+
        | 1                       | 1
        |                         |
        | *                       | *
+---------------+  *    1 +---------------+
|  INSPECTIONS  |---------|  AUDIT_LOGS   |
+---------------+         +---------------+
   | 1       | 1
   |         +------------------------------------+
   | *                                            | *
+---------------+                          +---------------+
|    IMAGES     |                          |    REPORTS    |
+---------------+                          +---------------+
   | 1
   |
   | *
+---------------+
|  OCR_RESULTS  |
+---------------+
   | 1
   |
   | *
+--------------------+
|  EXTRACTED_FIELDS  |
+--------------------+
   | 1
   |
   | *
+--------------------+       * +--------------------+
|    RULE_RESULTS    |-------->|   RULE_VERSIONS    |
+--------------------+         +--------------------+
   | 1                                    | *
   |                                      | 1
   | *                                 +--------------------+
+--------------------+                 |       RULES        |
|     VIOLATIONS     |                 +--------------------+
+--------------------+
```

---

## 2. Table Definitions

### 1. `roles`
Stores authorization roles.
* `id`: VARCHAR(32) PRIMARY KEY (e.g., `'OFFICER'`, `'REVIEWER'`, `'ADMIN'`)
* `description`: TEXT NOT NULL
* `created_at`: TIMESTAMPTZ DEFAULT NOW()

### 2. `users`
Enforcement officers, reviewers, and DoCA system administrators.
* `id`: UUID PRIMARY KEY DEFAULT gen_random_uuid()
* `role_id`: VARCHAR(32) NOT NULL REFERENCES roles(id)
* `name`: VARCHAR(255) NOT NULL
* `email`: VARCHAR(255) UNIQUE NOT NULL
* `password_hash`: VARCHAR(255) NOT NULL (Argon2 / bcrypt)
* `badge_number`: VARCHAR(64) UNIQUE
* `jurisdiction`: VARCHAR(255)
* `is_active`: BOOLEAN DEFAULT TRUE
* `created_at`: TIMESTAMPTZ DEFAULT NOW()
* `updated_at`: TIMESTAMPTZ DEFAULT NOW()

### 3. `products`
Catalog of packaged commodities inspected.
* `id`: UUID PRIMARY KEY DEFAULT gen_random_uuid()
* `brand`: VARCHAR(255) NOT NULL
* `product_name`: VARCHAR(255) NOT NULL
* `category`: VARCHAR(64) NOT NULL (e.g., `FOOD`, `COSMETIC`, `ELECTRONICS`, `BEVERAGE`)
* `manufacturer_claimed`: TEXT
* `barcode_gtin`: VARCHAR(64)
* `created_at`: TIMESTAMPTZ DEFAULT NOW()

### 4. `inspections`
Core inspection transaction record.
* `id`: UUID PRIMARY KEY DEFAULT gen_random_uuid()
* `officer_id`: UUID NOT NULL REFERENCES users(id)
* `product_id`: UUID NOT NULL REFERENCES products(id)
* `retail_outlet_name`: VARCHAR(255) NOT NULL
* `location_address`: TEXT NOT NULL
* `gps_lat`: NUMERIC(9, 6)
* `gps_lng`: NUMERIC(9, 6)
* `status`: VARCHAR(32) NOT NULL DEFAULT 'DRAFT' (Check: `DRAFT`, `ANALYZING`, `REVIEW`, `FINALIZED`)
* `verdict`: VARCHAR(32) (Check: `COMPLIANT`, `NON_COMPLIANT`, `PENDING_REVIEW`)
* `started_at`: TIMESTAMPTZ DEFAULT NOW()
* `finalized_at`: TIMESTAMPTZ
* `finalized_by`: UUID REFERENCES users(id)
* `officer_notes`: TEXT

### 5. `images`
Photographs of packaged commodities uploaded during inspection.
* `id`: UUID PRIMARY KEY DEFAULT gen_random_uuid()
* `inspection_id`: UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE
* `image_type`: VARCHAR(32) NOT NULL (`FRONT_PANEL`, `BACK_PANEL`, `SIDE_PANEL`, `BOTTOM_PANEL`)
* `file_path`: VARCHAR(512) NOT NULL
* `file_hash_sha256`: VARCHAR(64) NOT NULL
* `width`: INTEGER NOT NULL
* `height`: INTEGER NOT NULL
* `quality_score`: NUMERIC(4, 3) (0.000 to 1.000)
* `is_usable`: BOOLEAN DEFAULT TRUE
* `quality_warnings`: JSONB DEFAULT '[]'::jsonb
* `created_at`: TIMESTAMPTZ DEFAULT NOW()

### 6. `ocr_results`
Raw OCR text, tokens, and geometric bounding boxes.
* `id`: UUID PRIMARY KEY DEFAULT gen_random_uuid()
* `image_id`: UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE
* `engine_name`: VARCHAR(64) NOT NULL (e.g., `'PaddleOCR_v4'`)
* `full_text`: TEXT NOT NULL
* `mean_confidence`: NUMERIC(4, 3) NOT NULL
* `bounding_boxes`: JSONB NOT NULL `[{"text": "...", "confidence": 0.96, "bbox": [x1, y1, x2, y2]}]`
* `created_at`: TIMESTAMPTZ DEFAULT NOW()

### 7. `extracted_fields`
Structured declarations parsed from OCR output.
* `id`: UUID PRIMARY KEY DEFAULT gen_random_uuid()
* `inspection_id`: UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE
* `field_name`: VARCHAR(64) NOT NULL (e.g., `net_quantity`, `mrp`, `mfg_date`, `consumer_care_email`)
* `raw_value`: TEXT NOT NULL
* `normalized_value`: TEXT NOT NULL
* `unit`: VARCHAR(32)
* `confidence`: NUMERIC(4, 3) NOT NULL
* `confidence_category`: VARCHAR(16) NOT NULL (`HIGH`, `MEDIUM`, `LOW`)
* `verification_status`: VARCHAR(32) DEFAULT 'DETECTED' (`DETECTED`, `VERIFIED`, `CORRECTED`)
* `evidence_ref`: JSONB NOT NULL `{"image_id": UUID, "bbox": [x1, y1, x2, y2]}`
* `created_at`: TIMESTAMPTZ DEFAULT NOW()

### 8. `rules`
Master legal requirement catalog based on PCR 2011.
* `id`: UUID PRIMARY KEY DEFAULT gen_random_uuid()
* `code`: VARCHAR(64) UNIQUE NOT NULL (e.g., `'LM_RULE_06_MANDATORY_MRP'`)
* `title`: VARCHAR(255) NOT NULL
* `category`: VARCHAR(64) NOT NULL
* `requirement_type`: VARCHAR(64) NOT NULL (`MANDATORY_FIELD`, `UNIT_FORMAT`, `DATE_FORMAT`, `CONSUMER_CARE`)
* `severity`: VARCHAR(32) NOT NULL (`CRITICAL`, `MAJOR`, `MINOR`)
* `created_at`: TIMESTAMPTZ DEFAULT NOW()

### 9. `rule_versions`
Versioned implementation snapshots for legal reproducibility.
* `id`: UUID PRIMARY KEY DEFAULT gen_random_uuid()
* `rule_id`: UUID NOT NULL REFERENCES rules(id)
* `version_number`: VARCHAR(32) NOT NULL
* `effective_from`: DATE NOT NULL
* `effective_to`: DATE
* `definition`: JSONB NOT NULL (validation expressions, thresholds, required fields)
* `source_reference`: TEXT NOT NULL (Gazette Notification reference)
* `is_active`: BOOLEAN DEFAULT TRUE

### 10. `rule_results`
Evaluation results for every applicable rule in an inspection.
* `id`: UUID PRIMARY KEY DEFAULT gen_random_uuid()
* `inspection_id`: UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE
* `rule_version_id`: UUID NOT NULL REFERENCES rule_versions(id)
* `result`: VARCHAR(32) NOT NULL (`PASS`, `FAIL`, `REVIEW`, `NOT_APPLICABLE`)
* `reason`: TEXT NOT NULL
* `evidence_ref`: JSONB
* `created_at`: TIMESTAMPTZ DEFAULT NOW()

### 11. `violations`
Persisted violation entries for non-compliant rule evaluations.
* `id`: UUID PRIMARY KEY DEFAULT gen_random_uuid()
* `inspection_id`: UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE
* `rule_result_id`: UUID NOT NULL REFERENCES rule_results(id)
* `severity`: VARCHAR(32) NOT NULL
* `description`: TEXT NOT NULL
* `statutory_clause`: VARCHAR(255) NOT NULL
* `status`: VARCHAR(32) DEFAULT 'PENDING' (`PENDING`, `NOTICE_ISSUED`, `RESOLVED`)

### 12. `reports`
Generated official PDF certificates.
* `id`: UUID PRIMARY KEY DEFAULT gen_random_uuid()
* `inspection_id`: UUID NOT NULL REFERENCES inspections(id)
* `report_number`: VARCHAR(64) UNIQUE NOT NULL
* `file_path`: VARCHAR(512) NOT NULL
* `generated_by`: UUID NOT NULL REFERENCES users(id)
* `generated_at`: TIMESTAMPTZ DEFAULT NOW()

### 13. `audit_logs`
Immutable ledger tracking all state mutations and officer overrides.
* `id`: UUID PRIMARY KEY DEFAULT gen_random_uuid()
* `user_id`: UUID NOT NULL REFERENCES users(id)
* `entity_type`: VARCHAR(64) NOT NULL (`INSPECTION`, `FIELD`, `RULE`, `REPORT`)
* `entity_id`: UUID NOT NULL
* `action`: VARCHAR(64) NOT NULL (`CREATE`, `UPDATE`, `CORRECT`, `FINALIZE`, `OVERRIDE`)
* `old_value`: JSONB
* `new_value`: JSONB
* `ip_address`: VARCHAR(64)
* `created_at`: TIMESTAMPTZ DEFAULT NOW()

---

## 3. Database Indexes for High-Performance Queries

```sql
-- Fast lookup of inspections by status, date, and officer
CREATE INDEX idx_inspections_status ON inspections(status);
CREATE INDEX idx_inspections_started_at ON inspections(started_at DESC);
CREATE INDEX idx_inspections_officer ON inspections(officer_id);

-- Fast lookup of rule versions and active rules
CREATE INDEX idx_rule_versions_rule_active ON rule_versions(rule_id, is_active);
CREATE INDEX idx_rule_versions_effective_dates ON rule_versions(effective_from, effective_to);

-- Evidence and field queries
CREATE INDEX idx_extracted_fields_inspection ON extracted_fields(inspection_id);
CREATE INDEX idx_rule_results_inspection ON rule_results(inspection_id);
CREATE INDEX idx_violations_inspection ON violations(inspection_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
```
