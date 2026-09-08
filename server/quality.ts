/**
 * MetriScan AI — Image Quality Assessment Module
 * Evaluates image characteristics and calculates regulatory quality factors
 * under the Legal Metrology (Packaged Commodities) Rules inspection workflow.
 */

export interface ImageQualityMetrics {
  resolution: 'HIGH' | 'MEDIUM' | 'LOW';
  sharpness: 'SHARP' | 'ACCEPTABLE' | 'BLURRY';
  lighting: 'BALANCED' | 'DARK' | 'BRIGHT_GLARE';
  framing: 'CLEAR' | 'CROPPED' | 'OBSTRUCTED';
}

export interface ImageQualityAssessment {
  status: 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'VERY_POOR';
  score: number;
  factor: number;
  issues: string[];
  metrics: ImageQualityMetrics;
  warning: string | null;
  model_confidence: number;
  adjusted_confidence: number;
  can_proceed: boolean;
  summary: string;
  assessed_at: string;
}

export const QUALITY_FACTORS: Record<string, number> = {
  GOOD: 1.00,
  ACCEPTABLE: 0.85,
  POOR: 0.60,
  VERY_POOR: 0.40,
};

/**
 * Inspect image buffer headers to extract dimensions and basic file metadata
 */
export function inspectImageBuffer(buffer: Buffer): { width: number | null; height: number | null; format: string } {
  if (!buffer || buffer.length < 24) {
    return { width: null, height: null, format: 'unknown' };
  }

  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height, format: 'png' };
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      // SOF0, SOF1, SOF2 markers contain dimensions
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height, format: 'jpeg' };
      }
      // Skip segment
      const length = buffer.readUInt16BE(offset + 2);
      offset += 2 + length;
    }
    return { width: null, height: null, format: 'jpeg' };
  }

  // WebP
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    if (buffer.toString('ascii', 12, 16) === 'VP8 ') {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      return { width, height, format: 'webp' };
    }
    return { width: null, height: null, format: 'webp' };
  }

  return { width: null, height: null, format: 'unknown' };
}

/**
 * Assess image quality from buffer and vision model feedback
 */
export function assessImageQuality(
  imageBuffers: Buffer[],
  visionFeedback?: {
    sharpness?: 'SHARP' | 'ACCEPTABLE' | 'BLURRY';
    lighting?: 'BALANCED' | 'DARK' | 'BRIGHT_GLARE';
    framing?: 'CLEAR' | 'CROPPED' | 'OBSTRUCTED';
    score?: number;
    issues?: string[];
    summary?: string;
  }
): ImageQualityAssessment {
  const issues: string[] = [];
  let score = 90;

  if (imageBuffers.length === 0) {
    return {
      status: 'ACCEPTABLE',
      score: 80,
      factor: 0.85,
      issues: ['No physical packaging images uploaded; text-only assessment.'],
      metrics: {
        resolution: 'MEDIUM',
        sharpness: 'ACCEPTABLE',
        lighting: 'BALANCED',
        framing: 'CLEAR',
      },
      warning: 'E-commerce listing text verified without physical package photograph.',
      model_confidence: 85,
      adjusted_confidence: 72,
      can_proceed: true,
      summary: 'Declarations evaluated from listing text.',
      assessed_at: new Date().toISOString(),
    };
  }

  // Analyze buffer dimensions and size
  let minResolution: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
  for (const buf of imageBuffers) {
    const info = inspectImageBuffer(buf);
    if (info.width && info.height) {
      const pixels = info.width * info.height;
      if (pixels < 400000) {
        // Less than 0.4 MP
        minResolution = 'LOW';
        issues.push(`Low image resolution (${info.width}x${info.height} px); small label text may be illegible.`);
        score -= 25;
      } else if (pixels < 1000000) {
        // Less than 1 MP
        if (minResolution !== 'LOW') minResolution = 'MEDIUM';
        score -= 10;
      }
    } else if (buf.length < 50 * 1024) {
      // Very small file size (< 50 KB)
      minResolution = 'LOW';
      issues.push('Highly compressed image; compression artifacts may obscure fine print.');
      score -= 20;
    }
  }

  // Incorporate vision feedback if provided
  const sharpness: 'SHARP' | 'ACCEPTABLE' | 'BLURRY' = visionFeedback?.sharpness || 'SHARP';
  const lighting: 'BALANCED' | 'DARK' | 'BRIGHT_GLARE' = visionFeedback?.lighting || 'BALANCED';
  const framing: 'CLEAR' | 'CROPPED' | 'OBSTRUCTED' = visionFeedback?.framing || 'CLEAR';

  if (sharpness === 'BLURRY') {
    issues.push('Optical motion blur or defocus detected; characters may be indistinct.');
    score -= 25;
  } else if (sharpness === 'ACCEPTABLE') {
    score -= 5;
  }

  if (lighting === 'BRIGHT_GLARE') {
    issues.push('Specular reflection / lighting glare over packaging surface.');
    score -= 20;
  } else if (lighting === 'DARK') {
    issues.push('Underexposed lighting; text contrast is low.');
    score -= 15;
  }

  if (framing === 'CROPPED') {
    issues.push('Package edges cropped; mandatory declarations may be cut off outside frame.');
    score -= 20;
  } else if (framing === 'OBSTRUCTED') {
    issues.push('Partial obstruction or occlusion over label area.');
    score -= 25;
  }

  if (visionFeedback?.issues && visionFeedback.issues.length > 0) {
    for (const issue of visionFeedback.issues) {
      if (!issues.includes(issue)) {
        issues.push(issue);
      }
    }
  }

  if (visionFeedback?.score != null && typeof visionFeedback.score === 'number') {
    // Weighted blend of calculated score and vision model assessment
    score = Math.round(0.4 * score + 0.6 * visionFeedback.score);
  }

  score = Math.max(15, Math.min(98, score));

  let status: 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'VERY_POOR' = 'GOOD';
  if (score < 45) {
    status = 'VERY_POOR';
  } else if (score < 68) {
    status = 'POOR';
  } else if (score < 82) {
    status = 'ACCEPTABLE';
  }

  const factor = QUALITY_FACTORS[status] ?? 1.0;
  const rawConfidence = 92;
  const adjustedConfidence = Math.round(rawConfidence * factor);

  let warning: string | null = null;
  if (status === 'POOR' || status === 'VERY_POOR') {
    warning = `Low image quality (${status.replace('_', ' ')}) reduces extraction certainty. Findings must be verified by an authorized officer.`;
  }

  const summary = visionFeedback?.summary ||
    (status === 'GOOD'
      ? 'High-resolution packaging imagery with balanced exposure and sharp text legibility.'
      : status === 'ACCEPTABLE'
      ? 'Packaging photograph is acceptable for statutory audit, though slight glare or compression was detected.'
      : 'Degraded image clarity. Statutory declarations must be manually confirmed on the physical pack.');

  return {
    status,
    score,
    factor,
    issues,
    metrics: {
      resolution: minResolution,
      sharpness,
      lighting,
      framing,
    },
    warning,
    model_confidence: rawConfidence,
    adjusted_confidence: adjustedConfidence,
    can_proceed: status !== 'VERY_POOR',
    summary,
    assessed_at: new Date().toISOString(),
  };
}
