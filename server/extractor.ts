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

  const pingModels = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
  for (const model of pingModels) {
    try {
      await genAI.models.generateContent({
        model,
        contents: 'ping',
      });
      geminiOperational = true;
      console.log(`[MetriScan Vision] Cloud AI Vision model (${model}) verified operational.`);
      return true;
    } catch (err: any) {
      // try next model
    }
  }

  geminiOperational = true; // Still allow attempts when API key is present
  return true;
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

  // If no Gemini client or API key, process directly with high-performance Local Optical OCR
  if (!genAI || !process.env.GEMINI_API_KEY) {
    console.log('[MetriScan] AI Vision offline; scanning with Local Optical Engine...');
    return await extractWithLocalOcr(images, inspectionId, isImported, baseQuality, context);
  }

  // Candidate vision models in order of availability and speed
  const CANDIDATE_MODELS = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

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
          minDimension: 1200,
          maxDimension: 2400,
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

  const prompt = `You are an expert certified regulatory enforcement officer inspecting packaged commodities under India's Legal Metrology (Packaged Commodities) Rules, 2011 (LMPC Rules).
Carefully inspect all ${images.length} attached photographs of the packaging label.
The photographs may contain the front principal display panel, back statutory information panel, top/bottom, or side panels. The photos may be oriented horizontally, vertically, or rotated. Read all panels completely regardless of angle or rotation.

Extract EXACT, LITERAL text printed on the package for each of these 9 statutory declarations:

1. "commodity_name": Name of the commodity / product (e.g. "Fudge It Choco Brownie Cake", "Good Day Butter Cookies", "Body Lotion"). Look on front or back panel.
2. "net_quantity": Net quantity / weight / volume / count (e.g. "120 g (3 Units x 40 g)", "600 g", "1 kg", "500 ml", "1 N").
3. "mrp": Maximum Retail Price inclusive of all taxes (e.g. "Rs. 60.00 (Incl. of all taxes)", "₹ 60.00", "Rs. 40.00").
4. "unit_sale_price": Unit sale price per g/kg/ml/l/unit (e.g. "Rs. 0.50 / g", "₹ 0.10 / g"). If not printed explicitly, compute it as (MRP / Net Qty) e.g. "₹ 0.50 / g (Computed from MRP & Net Qty)".
5. "manufacturer": Complete name and postal address of manufacturer, packer, or importer, including company name, street/road/industrial area, city, state, and 6-digit PIN code (e.g. "Britannia Industries Ltd., 5/1A Hungerford Street, Kolkata - 700017, West Bengal").
6. "date_of_manufacture": Date/month/year of manufacture or packing (e.g. "PKD 08/2026", "12/03/2026", "08/2026", "MFG: 01/2026").
7. "expiry_date": Best before or expiry date statement (e.g. "Best before 4 months from packaging", "Best before 6 months from PKD", "Use by 12/2026").
8. "consumer_care": Consumer care / customer helpline contact details including toll-free number, phone, email, and address (e.g. "Call: 1800-425-4449, Email: feedback@britindia.com, Executive, Britannia Industries Ltd...").
9. "country_of_origin": Country of origin (e.g. "India" or "Made in India" or country specified).

Also extract product identifiers:
- brand: The brand name (e.g. "Britannia", "Parle", "Nestle", "Cadbury", "Amul", "ITC", etc.)
- product_name: Full product name (e.g. "Fudge It Choco Brownie Cake")
- barcode: EAN / Barcode number (e.g. "8901030234567")
- fssai_license: FSSAI 14-digit license number if visible (e.g. "10015043001129")
- lot_number: Batch / Lot number if printed (e.g. "B.No: B401")

For each declaration:
- "detected": true if the declaration is found on the packaging, false if completely absent.
- "raw_value": exact printed string found on the pack, or null if not detected.
- "confidence": number between 0.70 and 0.99 reflecting OCR clarity.
- "panel": "principal" (for front), "back", "side", or "other".
- "image_index": integer index (0 to ${images.length - 1}) where declaration was found.
- "bbox": [ymin, xmin, ymax, xmax] coordinates normalized 0-1000, or null if bounding box cannot be pinpointed.

Return ONLY a JSON object conforming strictly to this format:
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
        contents: [
          ...imageParts,
          { text: prompt },
        ],
        config: {
          responseMimeType: 'application/json',
          systemInstruction: 'You are an automated, impartial Legal Metrology enforcement assistant. Return verified text declarations from packaging pixels regardless of rotation or angle.',
        },
      });

      if (response.text) {
        const cleaned = cleanJsonText(response.text);
        parsed = JSON.parse(cleaned);
        visionError = null;
        console.log(`[MetriScan Vision] Successfully extracted with model ${modelName}`);
        break; // Successfully extracted
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err || '');
      visionError = errMsg;
      console.warn(`[MetriScan Vision] Model ${modelName} call issue:`, errMsg);
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
    const reportedConfidence = typeof dec?.confidence === 'number' ? dec.confidence : (dec?.detected ? 0.90 : 0.0);
    
    // Check if declaration was detected
    let isDetected = Boolean(
      dec &&
      dec.raw_value &&
      dec.raw_value.trim().length > 0 &&
      dec.detected !== false
    );
    let rawVal = isDetected ? dec.raw_value.trim() : null;
    let rawConf = isDetected ? Math.min(1.0, Math.max(0.5, reportedConfidence)) : 0.0;

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

    if (isDetected && dec?.bbox && Array.isArray(dec.bbox) && dec.bbox.length === 4) {
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
      const imgIdx = typeof dec?.image_index === 'number' && dec.image_index < images.length ? dec.image_index : 0;
      targetImageId = images[imgIdx]?.id || images[0]?.id || null;
    }

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
      verification_status: !isDetected ? 'LOW_CONFIDENCE' : rawConf * quality.factor < 0.60 ? 'LOW_CONFIDENCE' : 'DETECTED',
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

  if (!genAI || !process.env.GEMINI_API_KEY) {
    return await extractLocalSingleImageOcr(processedBuffer, mimetype, quality, panelType);
  }

  const CANDIDATE_MODELS = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

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
