# MetriScan AI — Troubleshooting & FAQ

## 1. Common Issues & Resolutions

### Q: PaddleOCR fails to install or gives CUDA / C++ runtime errors on Windows
* **Resolution:** In local developer mode, set `OCR_ENGINE=tesseract` or `OCR_ENGINE=mock_demo` in `.env`. Alternatively, install the Visual C++ Redistributable 2015-2022 from Microsoft's official portal.

### Q: Database connection error (`ConnectionRefusedError: port 5432`)
* **Resolution:** Ensure PostgreSQL service is started:
  - On Windows: `net start postgresql-x64-16` or check Services manager.
  - Or use Docker: `docker run -d --name metriscan_pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=metriscan_ai postgres:16`

### Q: Uploaded image exceeds size limit
* **Resolution:** The maximum allowed file upload size is set by `MAX_UPLOAD_SIZE_MB=15`. If camera files are larger, either downscale using client-side canvas before uploading or adjust the configuration in `.env`.

### Q: PDF Report generation fails with missing font error
* **Resolution:** ReportLab uses Helvetica and Times-Roman standard PDF typefaces by default. Ensure UTF-8 fonts (such as DejaVu Sans) are referenced if printing Hindi / regional script declarations.
