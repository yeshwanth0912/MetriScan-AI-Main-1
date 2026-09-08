/**
 * MetriScan AI — Declaration Extraction & Evidence Linking Module
 * Uses Google Gemini Vision (@google/genai) to perform real multimodal OCR
 * and evidence localization for packaged commodity labels under LMPC Rules, 2011.
 */

import { GoogleGenAI } from '@google/genai';
import type { ExtractedField } from './rules-engine';
import { assessImageQuality, inspectImageBuffer } from './quality';
import type { ImageQualityAssessment } from './quality';

export interface ImageInput {
  id: string;
  imageType: 'front' | 'back' | 'side';
  buffer: Buffer;
  mimetype: string;
  fileName: string;
}

export interface ExtractionResult {
  fields: ExtractedField[];
  imageQuality: ImageQualityAssessment;
  productDetails?: {
    brand?: string;
    product_name?: string;
    barcode?: string;
  };
  rawVisionOutput?: any;
}

const MANDATORY_FIELD_KEYS = [
  'commodity_name',
  'net_quantity',
  'mrp',
  'unit_sale_price',
  'manufacturer',
  'date_of_manufacture',
  'expiry_date',
  'consumer_care',
  'country_of_origin',
] as const;

/**
 * Deterministically parse mandatory fields from e-commerce listing text
 */
export function extractFromListingText(
  listingText: string,
  inspectionId: string,
  isImported: boolean
): ExtractionResult {
  const fields: ExtractedField[] = [];
  const text = listingText || '';

  const patterns: Record<string, { regex: RegExp; panel: string }> = {
    commodity_name: { regex: /(?:commodity|product(?:\s+name)?|item(?:\s+name)?|name):\s*(.+)/i, panel: 'principal' },
    net_quantity: { regex: /(?:net\s*(?:quantity|weight|wt|contents?)|quantity):\s*(.+)/i, panel: 'principal' },
    mrp: { regex: /(?:m\.?r\.?p\.?|maximum\s*retail\s*price|retail\s*price|price):\s*(.+)/i, panel: 'principal' },
    unit_sale_price: { regex: /(?:unit\s*sale\s*price|usp|unit\s*price):\s*(.+)/i, panel: 'principal' },
    manufacturer: { regex: /(?:manufactured\s*by|mfg\s*by|packer|importer|marketed\s*by|manufacturer):\s*(.+)/i, panel: 'other' },
    date_of_manufacture: { regex: /(?:date\s*of\s*(?:mfg|manufacture|packing)|mfg\s*date|pkd|manufactured\s*on):\s*(.+)/i, panel: 'other' },
    expiry_date: { regex: /(?:expiry\s*date|best\s*before|use\s*by|exp\s*date):\s*(.+)/i, panel: 'other' },
    consumer_care: { regex: /(?:consumer\s*care|customer\s*care|helpline|complaints?\s*to|feedback):\s*(.+)/i, panel: 'other' },
    country_of_origin: { regex: /(?:country\s*of\s*origin|origin|made\s*in):\s*(.+)/i, panel: 'other' },
  };

  const keysToExtract = isImported
    ? MANDATORY_FIELD_KEYS
    : MANDATORY_FIELD_KEYS.filter(k => k !== 'country_of_origin');

  for (const key of keysToExtract) {
    const config = patterns[key];
    const match = text.match(config.regex);
    const rawVal = match ? match[1].split(/\n|;/)[0].trim() : null;
    const isPresent = Boolean(rawVal && rawVal.length > 0);

    fields.push({
      id: `f-${inspectionId}-${key}`,
      inspection_id: inspectionId,
      field_name: key,
      present: isPresent,
      raw_value: isPresent ? rawVal : null,
      corrected_value: null,
      effective_value: isPresent ? rawVal : null,
      normalized: isPresent ? { raw: rawVal } : null,
      confidence: isPresent ? 0.95 : 0.0,
      panel: config.panel,
      evidence: isPresent
        ? {
            image_id: null,
            bbox: null,
            ocr_text: rawVal,
            source: 'ecommerce_listing_text',
          }
        : null,
      measurement: {
        status: 'UNAVAILABLE',
        height_mm: null,
        detail: 'Digital listing text: physical character height not applicable',
      },
      notes: isPresent ? [] : ['Mandatory declaration missing from e-commerce listing page under Rule 6(10).'],
      verification_status: isPresent ? 'DETECTED' : 'LOW_CONFIDENCE',
    });
  }

  const quality = assessImageQuality([], {
    summary: 'E-commerce marketplace listing declarations parsed under Rule 6(10). Physical image metrics not applicable.',
  });

  return { fields, imageQuality: quality };
}

/**
 * Real Multimodal Vision Extraction using Gemini Vision
 */
export async function extractDeclarationsWithVision(
  genAI: GoogleGenAI | null,
  images: ImageInput[],
  inspectionId: string,
  isImported: boolean,
  context?: {
    productName?: string;
    brand?: string;
    category?: string;
    panelWidthMm?: number | null;
    panelHeightMm?: number | null;
  }
): Promise<ExtractionResult> {
  const imageBuffers = images.map(img => img.buffer);

  // Fallback if no Gemini client or no images
  if (!genAI || images.length === 0) {
    const quality = assessImageQuality(imageBuffers);
    const keys = isImported ? MANDATORY_FIELD_KEYS : MANDATORY_FIELD_KEYS.filter(k => k !== 'country_of_origin');
    const fields: ExtractedField[] = keys.map(key => ({
      id: `f-${inspectionId}-${key}`,
      inspection_id: inspectionId,
      field_name: key,
      present: false,
      raw_value: null,
      corrected_value: null,
      effective_value: null,
      normalized: null,
      confidence: 0,
      panel: key === 'commodity_name' || key === 'net_quantity' || key === 'mrp' ? 'principal' : 'other',
      evidence: null,
      measurement: {
        status: 'UNAVAILABLE',
        height_mm: null,
        detail: 'Measurement unavailable (no automated vision extraction)',
      },
      notes: [
        genAI
          ? 'No package photographs provided for visual analysis.'
          : 'AI vision extraction unavailable (GEMINI_API_KEY required). Manual officer review or field entry required.',
      ],
      verification_status: 'DETECTED',
    }));

    return { fields, imageQuality: quality };
  }

  // Candidate vision models in order of availability and speed
  const CANDIDATE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];

  function cleanJsonText(raw: string): string {
    let s = raw.trim();
    if (s.startsWith('```json')) {
      s = s.slice(7);
    } else if (s.startsWith('```')) {
      s = s.slice(3);
    }
    if (s.endsWith('```')) {
      s = s.slice(0, -3);
    }
    return s.trim();
  }

  // Prepare images for Gemini Vision
  const imageParts = images.map(img => ({
    inlineData: {
      data: img.buffer.toString('base64'),
      mimeType: img.mimetype || 'image/jpeg',
    },
  }));

  const prompt = `You are a certified regulatory enforcement officer inspecting packaged commodities under India's Legal Metrology (Packaged Commodities) Rules, 2011 (LMPC Rules).
Carefully inspect all ${images.length} attached photographs of the packaging label.

CRITICAL READING & ORIENTATION RULES:
1. The label panels may be photographed at any angle (upright, upside down, or rotated 90°, 180°, 270° degrees, e.g. tall vertical side or back panels). You MUST thoroughly read all text regardless of label orientation or rotation.
2. Read all small print, consumer care addresses, MRP, date of manufacture/packing (PKD/MFG), expiry/use by dates, net quantity (weight/volume/count), unit sale price (USP), complete manufacturer address with PIN code, and commodity name.
3. Extract EXACT literal text seen in the pixels. DO NOT summarize, hallucinate, or fabricate default data.
4. If a declaration is missing, cut off, or illegible due to heavy blur/glare, set detected=false and raw_value=null.
5. For each detected declaration, localize its bounding box coordinates:
   bbox = [ymin, xmin, ymax, xmax] normalized to 0-1000 integers. If unable to localize exact box, set bbox=null.
6. Note the 0-based image index (0 to ${images.length - 1}) where each declaration appears.
7. Identify panel: 'principal' (if on front PDP), 'back', 'side', or 'other'.
8. Assess visual image quality: sharpness ('SHARP'|'ACCEPTABLE'|'BLURRY'), lighting ('BALANCED'|'DARK'|'BRIGHT_GLARE'), framing ('CLEAR'|'CROPPED'|'OBSTRUCTED'), quality_score (0-100), and specific issues observed.

Return ONLY a JSON object conforming to this schema:
{
  "declarations": {
    "commodity_name": { "detected": boolean, "raw_value": string | null, "confidence": number, "panel": string, "image_index": number, "bbox": [number, number, number, number] | null },
    "net_quantity": { "detected": boolean, "raw_value": string | null, "confidence": number, "panel": string, "image_index": number, "bbox": [number, number, number, number] | null },
    "mrp": { "detected": boolean, "raw_value": string | null, "confidence": number, "panel": string, "image_index": number, "bbox": [number, number, number, number] | null },
    "unit_sale_price": { "detected": boolean, "raw_value": string | null, "confidence": number, "panel": string, "image_index": number, "bbox": [number, number, number, number] | null },
    "manufacturer": { "detected": boolean, "raw_value": string | null, "confidence": number, "panel": string, "image_index": number, "bbox": [number, number, number, number] | null },
    "date_of_manufacture": { "detected": boolean, "raw_value": string | null, "confidence": number, "panel": string, "image_index": number, "bbox": [number, number, number, number] | null },
    "expiry_date": { "detected": boolean, "raw_value": string | null, "confidence": number, "panel": string, "image_index": number, "bbox": [number, number, number, number] | null },
    "consumer_care": { "detected": boolean, "raw_value": string | null, "confidence": number, "panel": string, "image_index": number, "bbox": [number, number, number, number] | null },
    "country_of_origin": { "detected": boolean, "raw_value": string | null, "confidence": number, "panel": string, "image_index": number, "bbox": [number, number, number, number] | null }
  },
  "product_identifiers": {
    "brand": string | null,
    "product_name": string | null,
    "barcode": string | null,
    "fssai_license": string | null,
    "lot_number": string | null
  },
  "image_quality": {
    "sharpness": "SHARP" | "ACCEPTABLE" | "BLURRY",
    "lighting": "BALANCED" | "DARK" | "BRIGHT_GLARE",
    "framing": "CLEAR" | "CROPPED" | "OBSTRUCTED",
    "quality_score": number,
    "issues": string[],
    "summary": string
  },
  "raw_recognized_text": string
}`;

  let parsed: any = null;
  let visionError: string | null = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const response = await genAI.models.generateContent({
        model: modelName,
        contents: [...imageParts, prompt],
        config: {
          responseMimeType: 'application/json',
          systemInstruction: 'You are an automated, impartial Legal Metrology enforcement assistant. Return verified text declarations from packaging pixels regardless of rotation or angle.',
        },
      });

      if (response.text) {
        const cleaned = cleanJsonText(response.text);
        parsed = JSON.parse(cleaned);
        visionError = null;
        break; // Successfully extracted
      }
    } catch (err: any) {
      console.warn(`[MetriScan Vision] Attempt with model ${modelName} failed:`, err?.message || err);
      visionError = err?.message || 'Vision extraction call failed';
    }
  }

  // If vision API call failed completely across all models
  if (!parsed) {
    const errorQuality: ImageQualityAssessment = {
      status: 'UNREADABLE',
      score: 20,
      factor: 0.40,
      issues: [
        'Photographs could not be scanned or read by the automated vision engine.',
        visionError ? `Engine notice: ${visionError}` : 'Optical reading unavailable.',
        'Text may be blurry, low contrast, severely rotated, or obscured by glare.',
      ],
      metrics: {
        resolution: 'LOW',
        sharpness: 'BLURRY',
        lighting: 'BALANCED',
        framing: 'OBSTRUCTED',
      },
      warning: 'The scanner could not read the packaging text clearly. Please upload clearer, well-lit photos of each panel, or open the Live Camera Scanner.',
      model_confidence: 0,
      adjusted_confidence: 0,
      can_proceed: false,
      summary: 'Optical scanner could not process the submitted photograph(s).',
      assessed_at: new Date().toISOString(),
    };

    const keys = isImported ? MANDATORY_FIELD_KEYS : MANDATORY_FIELD_KEYS.filter(k => k !== 'country_of_origin');
    const fields: ExtractedField[] = keys.map(key => ({
      id: `f-${inspectionId}-${key}`,
      inspection_id: inspectionId,
      field_name: key,
      present: false,
      raw_value: null,
      corrected_value: null,
      effective_value: null,
      normalized: null,
      confidence: 0,
      panel: key === 'commodity_name' || key === 'net_quantity' || key === 'mrp' ? 'principal' : 'back',
      evidence: null,
      measurement: {
        status: 'UNAVAILABLE',
        height_mm: null,
        detail: 'Measurement unavailable (unreadable photograph)',
      },
      notes: [
        'Could not scan or read text from photograph. Please re-upload a clearer, well-lit photo of this panel, or use the Live Scanner.'
      ],
      verification_status: 'LOW_CONFIDENCE',
    }));

    return { fields, imageQuality: errorQuality };
  }

  // Assess quality blending buffer analysis with vision output
  const quality = assessImageQuality(imageBuffers, parsed?.image_quality);

  const keys = isImported ? MANDATORY_FIELD_KEYS : MANDATORY_FIELD_KEYS.filter(k => k !== 'country_of_origin');
  const fields: ExtractedField[] = [];

  for (const key of keys) {
    const dec = parsed?.declarations?.[key];
    const isDetected = Boolean(dec && dec.detected && dec.raw_value && dec.raw_value.trim());
    const rawVal = isDetected ? dec.raw_value.trim() : null;
    const rawConf = isDetected && typeof dec.confidence === 'number' ? Math.min(1.0, Math.max(0.1, dec.confidence)) : (isDetected ? 0.90 : 0.0);

    // Bounding box normalization:
    // Model returns [ymin, xmin, ymax, xmax] in 0-1000 range.
    // EvidenceViewer expects pixel coordinates [x1, y1, x2, y2] based on image natural width/height.
    let pixelBbox: [number, number, number, number] | null = null;
    let targetImageId: string | null = null;

    if (isDetected && dec.bbox && Array.isArray(dec.bbox) && dec.bbox.length === 4) {
      const imgIdx = typeof dec.image_index === 'number' && dec.image_index < images.length ? dec.image_index : 0;
      const targetImg = images[imgIdx] || images[0];
      targetImageId = targetImg.id;

      const imgInfo = inspectImageBuffer(targetImg.buffer);
      const w = imgInfo.width || 1200;
      const h = imgInfo.height || 1600;

      const [ymin, xmin, ymax, xmax] = dec.bbox;
      const x1 = Math.round((xmin / 1000) * w);
      const y1 = Math.round((ymin / 1000) * h);
      const x2 = Math.round((xmax / 1000) * w);
      const y2 = Math.round((ymax / 1000) * h);

      if (x2 > x1 && y2 > y1) {
        pixelBbox = [x1, y1, x2, y2];
      }
    } else if (isDetected) {
      // Image exists but bbox couldn't be localized
      const imgIdx = typeof dec?.image_index === 'number' && dec.image_index < images.length ? dec.image_index : 0;
      targetImageId = images[imgIdx]?.id || images[0]?.id || null;
    }

    // Physical character height measurement:
    // Can only be calculated if panel dimensions are provided and bbox is localized!
    let measurement: any = {
      status: 'UNAVAILABLE',
      height_mm: null,
      detail: 'Measurement unavailable (panel scale not calibrated)',
    };

    if (context?.panelWidthMm && context?.panelHeightMm && pixelBbox) {
      const targetImg = images.find(img => img.id === targetImageId) || images[0];
      const imgInfo = inspectImageBuffer(targetImg.buffer);
      const imgH = imgInfo.height || 1600;
      const bboxHeightPx = pixelBbox[3] - pixelBbox[1];
      // Estimate height in mm: bboxHeightPx / imgH * panelHeightMm
      const estHeightMm = Math.round(((bboxHeightPx / imgH) * context.panelHeightMm) * 10) / 10;
      if (estHeightMm > 0.5 && estHeightMm < 30) {
        measurement = {
          status: 'MEASURED',
          height_mm: estHeightMm,
          confidence: Math.round(rawConf * 100) / 100,
          detail: `Calibrated from panel dimensions ${context.panelWidthMm}x${context.panelHeightMm} mm.`,
        };
      }
    }

    const panel = dec?.panel === 'principal' ? 'principal' : (key === 'commodity_name' || key === 'net_quantity' ? 'principal' : 'back');

    fields.push({
      id: `f-${inspectionId}-${key}`,
      inspection_id: inspectionId,
      field_name: key,
      present: isDetected,
      raw_value: rawVal,
      corrected_value: null,
      effective_value: rawVal,
      normalized: isDetected ? { raw: rawVal } : null,
      confidence: rawConf,
      panel,
      evidence: isDetected
        ? {
            image_id: targetImageId,
            bbox: pixelBbox,
            ocr_text: rawVal,
          }
        : null,
      measurement,
      notes: isDetected ? [] : ['Statutory declaration was not detected on any submitted label panel.'],
      verification_status: !isDetected ? 'LOW_CONFIDENCE' : rawConf * quality.factor < 0.70 ? 'LOW_CONFIDENCE' : 'DETECTED',
    });
  }

  // Check if zero declarations were detected despite having images
  const detectedCount = fields.filter(f => f.present).length;
  if (detectedCount === 0 && images.length > 0) {
    quality.status = 'POOR';
    quality.can_proceed = false;
    quality.warning = 'The scanner could not detect readable statutory declarations in the submitted photographs. Please ensure photographs are well-lit, in focus, not obscured by glare or shadows, and re-upload or use the Live Camera Scanner.';
    if (!quality.issues.some(i => i.includes('legible declarations'))) {
      quality.issues.push('Zero legible declarations detected on submitted label photograph(s)');
    }
    for (const f of fields) {
      f.notes = ['Could not scan or read text from photograph. Please re-upload a clearer, well-lit photo of this panel, or use the Live Scanner.'];
    }
  }

  return {
    fields,
    imageQuality: quality,
    productDetails: parsed?.product_identifiers ? {
      brand: parsed.product_identifiers.brand || undefined,
      product_name: parsed.product_identifiers.product_name || undefined,
      barcode: parsed.product_identifiers.barcode || undefined,
    } : undefined,
    rawVisionOutput: parsed,
  };
}

/**
 * Single-image OCR extraction helper for Live Scanner and OCR service API
 */
export async function extractSingleImageOcr(
  genAI: GoogleGenAI | null,
  imageBuffer: Buffer,
  mimetype: string,
  options?: {
    panelType?: string;
    isImported?: boolean;
  }
): Promise<{
  success: boolean;
  status: 'SUCCESS' | 'UNREADABLE' | 'UNAVAILABLE' | 'ERROR';
  text: string;
  declarations: Record<string, any>;
  lines: Array<{ text: string; confidence: number; bbox?: number[] }>;
  image_quality: ImageQualityAssessment;
  error?: string;
}> {
  const quality = assessImageQuality([imageBuffer]);

  if (!genAI) {
    return {
      success: false,
      status: 'UNAVAILABLE',
      text: '',
      declarations: {},
      lines: [],
      image_quality: quality,
      error: 'No active OCR engine is configured. GEMINI_API_KEY environment variable is required.',
    };
  }

  const CANDIDATE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
  const panelType = options?.panelType || 'general';

  const prompt = `You are an automated OCR and Legal Metrology packaging scanner.
Carefully read ALL text visible in this ${panelType} packaging label image.
The image might be oriented horizontally, vertically, or rotated (0, 90, 180, 270 degrees). Read all orientations.

Extract:
1. All legible lines of printed text on the package.
2. Key statutory declarations if present: commodity_name, net_quantity, mrp, unit_sale_price, manufacturer, date_of_manufacture, expiry_date, consumer_care.

Return ONLY a JSON object:
{
  "full_text": "all raw text recognized in image line by line",
  "declarations": {
    "commodity_name": string | null,
    "net_quantity": string | null,
    "mrp": string | null,
    "unit_sale_price": string | null,
    "manufacturer": string | null,
    "date_of_manufacture": string | null,
    "expiry_date": string | null,
    "consumer_care": string | null
  },
  "detected_count": number,
  "is_readable": boolean
}`;

  let parsed: any = null;
  let lastErr: string | null = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const res = await genAI.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              data: imageBuffer.toString('base64'),
              mimeType: mimetype || 'image/jpeg',
            },
          },
          prompt,
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });

      if (res.text) {
        let clean = res.text.trim();
        if (clean.startsWith('```json')) clean = clean.slice(7);
        if (clean.startsWith('```')) clean = clean.slice(3);
        if (clean.endsWith('```')) clean = clean.slice(0, -3);
        parsed = JSON.parse(clean.trim());
        break;
      }
    } catch (err: any) {
      lastErr = err?.message || 'Model call failed';
    }
  }

  if (!parsed) {
    return {
      success: false,
      status: 'UNREADABLE',
      text: '',
      declarations: {},
      lines: [],
      image_quality: quality,
      error: lastErr ? `Scanning error: ${lastErr}. Please re-upload a clearer image.` : 'Could not read text from image. Please re-upload with better lighting and focus.',
    };
  }

  const fullText = (parsed.full_text || '').trim();
  const declarations = parsed.declarations || {};

  return {
    success: true,
    status: parsed.is_readable === false ? 'UNREADABLE' : 'SUCCESS',
    text: fullText,
    declarations,
    lines: fullText ? fullText.split('\n').map((line: string) => ({ text: line.trim(), confidence: 0.9 })) : [],
    image_quality: quality,
  };
}
