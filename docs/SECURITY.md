# MetriScan AI — Security & Privacy Specification

**Document Version:** 1.0 — SIH MVP  
**Classification:** Internal Technical Architecture  

---

## 1. Security Architecture Principles

* **Defense in Depth:** Multi-layered security spanning transport, authentication, application authorization, file storage, and database persistence.
* **Statutory Admissibility & Chain of Custody:** Legal evidence must be protected against tampering or retroactive modification.
* **Least Privilege:** Strict role-based access control (RBAC) enforced at the API dependency level, not merely in the client UI.

---

## 2. Authentication & Session Security

### Password Hashing
* Uses **Argon2id** (or `bcrypt` with work factor 12) with unique per-user cryptographically random salts.
* Zero plaintext passwords stored in database or memory logs.

### JWT Token Lifecycle
* Cryptographic signature: HMAC-SHA256 (`HS256`) using a 256-bit secret stored in environment variables (`JWT_SECRET`).
* Access token lifetime: 60 minutes.
* Payload contains: `sub` (User UUID), `role` (`OFFICER`, `REVIEWER`, `ADMIN`), `exp`, and `iat`.
* Backend dependency `get_current_user` validates token validity and revokes tokens if the user account is flagged inactive.

---

## 3. Upload & File System Security

1. **MIME Type & Extension Whitelisting:**
   - Permitted: `image/jpeg` (`.jpg`, `.jpeg`), `image/png` (`.png`).
   - Magic bytes / header inspection prevents executable files masquerading as images (e.g., PHP or ELF binaries renamed to `.jpg`).
2. **File Size Limit:** Capped at 15 MB per image upload to prevent memory exhaustion and Denial of Service (DoS).
3. **Storage Sanitization:**
   - User-supplied filenames are stripped. Uploaded files are renamed using randomly generated UUIDv4 tokens (e.g., `storage/originals/e932b1a4-3701-447a-8b83-2f08a47cfd21.jpg`).
   - Prevents path traversal (`../../etc/passwd` or `..\Windows\System32`) attacks.
4. **Non-Executable Storage Directory:** Storage mounts configured with `noexec` flags to prevent arbitrary code execution.

---

## 4. Audit Trail & Data Immutability

* **Original Images:** Immutable. Once saved, original raw images are set to read-only mode and never overwritten by preprocessing steps.
* **Raw OCR Results:** Persisted in `ocr_results` table as an immutable record of raw machine output.
* **Human Corrections:** When an officer corrects an OCR token, the original OCR record remains unchanged. A new entry is written to `audit_logs` capturing:
  - `user_id`
  - `entity_type` (`EXTRACTED_FIELD`)
  - `entity_id`
  - `old_value`
  - `new_value`
  - `timestamp`
  - `client_ip`
* **Finalized Inspections:** Once transitioned to `FINALIZED`, the inspection record is locked against modifications. Reopening requires `ADMIN` authorization.
