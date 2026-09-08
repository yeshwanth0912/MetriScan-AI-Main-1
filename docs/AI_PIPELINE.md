# MetriScan AI — AI & Computer Vision Pipeline Specification

**Module:** `ai/`  
**Purpose:** Transform unconstrained package photographs into high-precision, structured declaration fields with spatial evidence bounding boxes.

---

## 1. End-to-End Pipeline Stages

```
+-----------------------------------------------------------------------------------------------+
|                                      AI / CV PIPELINE FLOW                                    |
|                                                                                               |
|  [Input Package Image (JPG/PNG)]                                                              |
|               |                                                                               |
|               v                                                                               |
|  [Stage 1: Image Quality Assessment]                                                          |
|       - Blur Detection (Laplacian Variance < 100)                                             |
|       - Illumination Histogram (Mean Pixel < 40 or > 230)                                     |
|       - Resolution Gate (Min Width/Height >= 800px)                                           |
|       -> Output: quality_score [0.0 - 1.0], is_usable [True/False], warnings []               |
|               |                                                                               |
|               v                                                                               |
|  [Stage 2: Computer Vision Preprocessing]                                                     |
|       - Orientation Correction (EXIF & Text Orientation Angle)                               |
|       - Perspective Deskewing (Hough Transform / Contour MinAreaRect)                         |
|       - Contrast Limited Adaptive Histogram Equalization (CLAHE)                              |
|       - Bilateral Filtering (Denoising while preserving sharp text edges)                    |
|               |                                                                               |
|               v                                                                               |
|  [Stage 3: Deep Learning OCR Engine (PaddleOCR / Tesseract)]                                  |
|       - Text Detection (DBNet / DB++ for curved/irregular text regions)                       |
|       - Text Recognition (SVTR / CRNN for character sequences)                                |
|       -> Output: Full Text, Words, Normalized Box Coordinates [x1, y1, x2, y2], Token Conf     |
|               |                                                                               |
|               v                                                                               |
|  [Stage 4: Statutory Field Extraction (Deterministic Heuristics + Spatial Proximity)]         |
|       - MRP & Unit Sale Price Extractor                                                       |
|       - Net Quantity & SI Unit Extractor                                                      |
|       - Month & Year Dates Extractor (Mfg / Pkd / Use By)                                     |
|       - Manufacturer / Packer / Importer Name & Postal PIN Code Extractor                     |
|       - Consumer Care Contacts Extractor (Email, Phone, Helpline)                             |
|               |                                                                               |
|               v                                                                               |
|  [Stage 5: Normalization & Canonical Formatting]                                              |
|       - SI Metric Unit Normalization (500gm -> 500 g; 1 Litre -> 1000 ml)                     |
|       - Currency & Price Normalization (Rs. 99.00 -> 99.00 INR)                               |
|       - Date Normalization (MM/YYYY standard)                                                 |
|               |                                                                               |
|               v                                                                               |
|  [Stage 6: Multi-Signal Confidence Scoring]                                                    |
|       - OCR Token Confidence (40% weight)                                                     |
|       - Regex Anchor Precision (30% weight)                                                   |
|       - Spatial Key-Value Proximity (20% weight)                                              |
|       - Image Quality Index (10% weight)                                                      |
|       -> Output: HIGH (>=0.85) | MEDIUM (0.65-0.84) | LOW (<0.65)                             |
+-----------------------------------------------------------------------------------------------+
```

---

## 2. Image Quality Gate (`ai/quality/`)

Before passing images to expensive OCR models, the system runs rapid OpenCV diagnostics:

### 1. Blur Detection (Laplacian Variance)
$$\text{Blur Score} = \text{Var}\left(\nabla^2 I\right) = \frac{1}{N} \sum (L(x,y) - \mu_L)^2$$
* If $\text{Score} < 100$: Package image is motion-blurred or out of focus.
* Result: System prompts officer with warning: *"Image appears blurry. Text might be illegible. Consider retaking under stable lighting."*

### 2. Illumination & Glare Check
* Calculates grayscale histogram $\mu_I$ and saturation ratio.
* $\mu_I < 40$: Severely underexposed / dark.
* Percentage of saturated pixels ($I > 250$) exceeds 15%: Flash glare detected, often obliterating shiny plastic wrapper text.

### 3. Resolution Gate
* Checks dimensions $(W, H)$. Minimum resolution of $800 \times 800$ required for legible micro-text.

---

## 3. Preprocessing Pipeline (`ai/preprocessing/`)

1. **Auto-Deskew:** Detects dominant text line orientation using Radon or Hough Line transforms; performs affine rotation to align lines horizontally (within $\pm 45^\circ$).
2. **CLAHE (Contrast Limited Adaptive Histogram Equalization):** Amplifies contrast between ink and colored packaging backgrounds without amplifying high-frequency noise.
3. **Adaptive Thresholding / Edge Enhancement:** Applies bilateral filter to smooth glossy packaging texture while retaining sharp letter edges for the OCR recognition head.

---

## 4. OCR Engine (`ai/ocr/`)

* **Primary Engine:** **PaddleOCR (PP-OCRv4)**
  * Ultra-lightweight, high-accuracy model trained on diverse fonts, multi-lingual texts, and non-horizontal text banners.
  * Detects text bounding polygon boxes $[(x_1, y_1), (x_2, y_2), (x_3, y_3), (x_4, y_4)]$.
  * Converts polygons to bounding boxes $[x_{min}, y_{min}, x_{max}, y_{max}]$ normalized to canvas scale.
* **Secondary / Fallback Engine:** **Tesseract OCR (LSTM engine)**
  * Activated for offline development fallback if deep learning weights are not downloaded.

---

## 5. Structured Field Extraction Strategies (`ai/extraction/`)

### 1. Net Quantity Extractor (`quantity.py`)
* Regex targets:
  - `(?:Net\s*(?:Quantity|Qty|Wt|Weight|Volume)?\s*[:.-]?\s*)([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gm|gms|grams|l|lt|ltr|litres|ml|milli-litres|n|units|u|pieces|pcs)\b`
* Captures raw number and unit token, maps coordinates of both the label and value tokens.

### 2. Maximum Retail Price (MRP) Extractor (`mrp.py`)
* Regex targets:
  - `(?:M\.?R\.?P\.?|MAX(?:IMUM)?\s*RETAIL\s*PRICE)?\s*(?:₹|Rs\.?|INR)?\s*([0-9]+(?:\.[0-9]{2})?)\s*(?:(?:incl\.?|inclusive)\s*(?:of\s*)?all\s*taxes)?`
* Extracts MRP figure, confirms presence of statutory phrase "inclusive of all taxes".

### 3. Date Extractor (`dates.py`)
* Recognizes Manufacturing Date (`MFD`, `MFG DATE`, `PACKED ON`, `PKD`):
  - `(?:MFD|MFG|PKD|PACKED)\s*[:.-]?\s*([0-9]{1,2}[\/\-][0-9]{2,4}|[A-Za-z]{3,9}\s*[0-9]{2,4})`
* Recognizes Best Before / Expiry (`EXP`, `USE BY`, `BEST BEFORE`):
  - `(?:BEST\s*BEFORE|EXP(?:IRY)?|USE\s*BY)\s*[:.-]?\s*([0-9]{1,2}\s*(?:MONTHS|DAYS)|[0-9]{1,2}[\/\-][0-9]{2,4})`

### 4. Consumer Care Extractor (`consumer_care.py`)
* Detects mandatory 4-point consumer care channels:
  - Phone / Toll-free: `(?:Toll\s*Free|Helpline|Customer\s*Care|Ph(?:one)?)\s*[:.-]?\s*([0-9]{3,5}[\s-]?[0-9]{3,5}[\s-]?[0-9]{3,4})`
  - Email: `[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+`
  - Postal Address: Proximity to keywords "Customer Care Manager", "Consumer Care Cell".

---

## 6. Multi-Signal Confidence Formula (`ai/confidence/`)

$$\text{Confidence}(F) = w_{ocr} \cdot C_{ocr} + w_{regex} \cdot S_{match} + w_{spatial} \cdot P_{kv} + w_{img} \cdot Q_{img}$$
Where:
* $w_{ocr} = 0.40$ (OCR recognition confidence of characters)
* $w_{regex} = 0.30$ (Exactness of regex pattern match)
* $w_{spatial} = 0.20$ (Proximity of key label e.g., "MRP" to value "120.00")
* $w_{img} = 0.10$ (Global image quality score)

**Classification Tiers:**
* $\ge 0.85 \rightarrow \mathbf{HIGH}$ (Green badge; eligible for automated verification)
* $0.65 - 0.84 \rightarrow \mathbf{MEDIUM}$ (Amber badge; displayed with gentle review indicator)
* $< 0.65 \rightarrow \mathbf{LOW}$ (Red badge; triggers mandatory officer verification in review workflow)
