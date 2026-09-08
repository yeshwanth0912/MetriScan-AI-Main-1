# Changelog

All notable changes to the **MetriScan AI** platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] - Phase 0 & 1

### Added
* Initial project architecture and specifications:
  - `PROJECT_BLUEPRINT.md`: Full problem statement breakdown and product scope.
  - `PRD.md`: 25 functional requirements, 10 NFRs, user personas, and status state machine.
  - `SYSTEM_ARCHITECTURE.md`: Complete modular monolith architecture, sequence flows, and rule versioning design.
  - `API_SPECIFICATION.md`: REST API contracts for auth, inspections, review, rules, and reports.
  - `DATABASE_SCHEMA.md`: 13 core PostgreSQL tables with ER diagram, constraints, and indexes.
  - `AI_PIPELINE.md`: Quality checks, CLAHE preprocessing, PaddleOCR integration, and multi-signal confidence scoring.
  - `COMPLIANCE_ENGINE.md`: Codified Legal Metrology (PCR 2011) rules and PASS/FAIL/REVIEW aggregation.
  - `SECURITY.md`: RBAC, JWT, upload sanitization, and immutable audit logs.
  - `TESTING_STRATEGY.md`: Pytest, Vitest, and Playwright E2E testing strategies.
  - `DEMO_GUIDE.md`: 5-7 minute winning demo script for SIH jury presentation.
