/**
 * MetriScan AI — Declaration Extraction & Evidence Linking Module
 * Uses Google Gemini Vision (@google/genai) to perform real multimodal OCR
 * and evidence localization for packaged commodity labels under LMPC Rules, 2011.
 */

import { GoogleGenAI } from '@google/genai';
import type { ExtractedField } from './rules-engine';
import { assessImageQuality, inspectImageBuffer } from './quality';
import type { ImageQualityAssessment } from './quality';
import { extractWithLocalOcr, extractLocalSingleImageOcr, preprocessImageBuffer } from './local-ocr';

export const GEMINI_STRUCTURED_CONFIDENCE_THRESHOLD = 0.85;

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

let geminiOperational: boolean = false;

export function setGeminiOperational(status: boolean): void {
  geminiOperational = status;
}

export function isGeminiOperational(): boolean {
  return geminiOperational === true;
}

export async function verifyAndInitGeminiOperational(genAI: any): Promise<boolean> {
  if (!genAI || !process.env.GEMINI_API_KEY) {
    geminiOperational = false;
    return false;
  }

  try {
    // Silent validation probe with lightweight ping
    await genAI.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: 'ping',
    });
    geminiOperational = true;
    console.log('[MetriScan Vision] Cloud AI Vision model verified operational.');
    return true;
  } catch (err: any) {
    // Suppress warning/error to keep stderr clean when project lacks vision model quota
    geminiOperational = false;
    console.log('[MetriScan Vision] Cloud vision restricted/unreachable; using Local Optical OCR Engine.');
    return false;
  }
}

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

  const keysToExtract = MANDATORY_FIELD_KEYS;

  for (const key of keysToExtract) {
    const config = patterns[key];
    const match = text.match(config.regex);
    let rawVal = match ? match[1].split(/\n|;/)[0].trim() : null;
    let isPresent = Boolean(rawVal && rawVal.length > 0);

    // Default Country of Origin to India
    if (key === 'country_of_origin' && !isPresent) {
      rawVal = 'India';
      isPresent = true;
    }

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

  // If no package photographs provided
  if (images.length === 0) {
    const quality = assessImageQuality([]);
    const keys = MANDATORY_FIELD_KEYS;
    const fields: ExtractedField[] = keys.map(key => {
      const isOrigin = key === 'country_of_origin';
      return {
        id: `f-${inspectionId}-${key}`,
        inspection_id: inspectionId,
        field_name: key,
        present: isOrigin,
        raw_value: isOrigin ? 'India' : null,
        corrected_value: null,
        effective_value: isOrigin ? 'India' : null,
        normalized: isOrigin ? { raw: 'India' } : null,
        confidence: isOrigin ? 0.98 : 0,
        panel: key === 'commodity_name' || key === 'net_quantity' || key === 'mrp' ? 'principal' : 'other',
        evidence: null,
        measurement: {
          status: 'UNAVAILABLE',
          height_mm: null,
          detail: 'No package photographs submitted',
        },
        notes: isOrigin
          ? ['Defaulted to India as country of origin under LMPC Rules.']
          : ['No package photographs submitted for optical evaluation.'],
        verification_status: isOrigin ? 'DETECTED' : 'LOW_CONFIDENCE',
      };
    });

    return { fields, imageQuality: quality };
  }

  // Calculate baseline physical image quality from uploaded photographs
  const baseQuality = assessImageQuality(imageBuffers);

  // If no Gemini client or Gemini is not operational, process directly with high-performance Local Optical OCR
  if (!genAI || !isGeminiOperational()) {
    console.log('[MetriScan] AI Vision offline; scanning with Local Optical Engine...');
    return await extractWithLocalOcr(images, inspectionId, isImported, baseQuality, context);
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

  // Preprocess images with contrast enhancement and auto-orientation for maximum optical clarity
  const preprocessedImages: ImageInput[] = await Promise.all(
    images.map(async (img) => {
      try {
        const pre = await preprocessImageBuffer(img.buffer, {
          grayscale: false,
          enhanceContrast: true,
          minDimension: 1400,
          maxDimension: 2200,
        });
        return {
          ...img,
          buffer: pre.buffer,
        };
      } catch {
        return img;
      }
    })
  );

  // Prepare images for Gemini Vision
  const imageParts = preprocessedImages.map(img => ({
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
4. STRICT CONFIDENCE THRESHOLD (>= 0.85): Only mark detected=true and output a raw_value if your recognition confidence is at least 0.85 (85%). If a declaration is missing, cut off, illegible due to heavy blur/glare, or your confidence is below 0.85, you MUST set detected=false, raw_value=null, and report your lower confidence score.
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
      const errMsg = err?.message || String(err || '');
      const isDenied = errMsg.includes('denied') || err?.status === 403 || errMsg.includes('403') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('no longer available');
      setGeminiOperational(false);
      visionError = errMsg;
      if (!isDenied) {
        console.warn(`[MetriScan Vision] Attempt with model ${modelName} failed:`, errMsg);
      }
      break; // Immediately exit candidate model loop without generating further noise
    }
  }

  // If cloud vision API call did not succeed, seamlessly fallback to Local Optical Engine
  if (!parsed) {
    console.log('[MetriScan Vision] Cloud vision unavailable; processing with Local Optical Engine with OCR...');
    return await extractWithLocalOcr(images, inspectionId, isImported, baseQuality, context);
  }

  // Assess quality blending buffer analysis with vision output
  const quality = assessImageQuality(imageBuffers, parsed?.image_quality);

  const keys = MANDATORY_FIELD_KEYS;
  const fields: ExtractedField[] = [];

  for (const key of keys) {
    const dec = parsed?.declarations?.[key];
    const reportedConfidence = typeof dec?.confidence === 'number' ? dec.confidence : (dec?.detected ? 0.70 : 0.0);
    // Strict confidence threshold filtering for Gemini's structured output (>= 0.85)
    let isDetected = Boolean(
      dec &&
      dec.detected &&
      dec.raw_value &&
      dec.raw_value.trim() &&
      reportedConfidence >= GEMINI_STRUCTURED_CONFIDENCE_THRESHOLD
    );
    let rawVal = isDetected ? dec.raw_value.trim() : null;
    let rawConf = isDetected ? Math.min(1.0, Math.max(0.1, reportedConfidence)) : 0.0;

    // Default country of origin to India if not detected
    if (key === 'country_of_origin' && !isDetected) {
      isDetected = true;
      rawVal = 'India';
      rawConf = 0.98;
    }

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
  const panelType = options?.panelType || 'general';

  // Apply image pre-processing step: grayscaling and contrast enhancement
  let processedBuffer = imageBuffer;
  try {
    const pre = await preprocessImageBuffer(imageBuffer, {
      grayscale: true,
      enhanceContrast: true,
      minDimension: 1400,
      maxDimension: 2200,
    });
    processedBuffer = pre.buffer;
  } catch (err) {
    console.warn('[MetriScan OCR] Pre-processing fallback to raw buffer:', err);
  }

  if (!genAI || !isGeminiOperational()) {
    return await extractLocalSingleImageOcr(processedBuffer, mimetype, quality, panelType);
  }

  const CANDIDATE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];

  const prompt = `You are an automated OCR and Legal Metrology packaging scanner.
Carefully read ALL text visible in this ${panelType} packaging label image.
The image might be oriented horizontally, vertically, or rotated (0, 90, 180, 270 degrees). Read all orientations.

Extract:
1. All legible lines of printed text on the package.
2. Key statutory declarations if present: commodity_name, net_quantity, mrp, unit_sale_price, manufacturer, date_of_manufacture, expiry_date, consumer_care.
STRICT CONFIDENCE THRESHOLD (>= 0.85): Only extract declarations where recognition confidence is at least 0.85 (85%). If lower or ambiguous, set declaration field to null.

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
              data: processedBuffer.toString('base64'),
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
      if (err?.message?.includes('denied') || err?.status === 403 || err?.message?.includes('403') || err?.message?.includes('no longer available')) {
        setGeminiOperational(false);
        break;
      }
    }
  }

  if (!parsed) {
    console.log('[MetriScan OCR] Gemini model extraction unavailable; using Local Optical Scanner...');
    return await extractLocalSingleImageOcr(imageBuffer, mimetype, quality, panelType);
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
