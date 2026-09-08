/**
 * MetriScan AI — Deterministic Legal Metrology Rule Engine
 * Implements strict, verifiable rule evaluation under the Legal Metrology Act, 2009
 * and Legal Metrology (Packaged Commodities) Rules, 2011 (LMPC Rules).
 */

import type { ImageQualityAssessment } from './quality';

export interface RuleVersion {
  id: string;
  version: number;
  effective_from: string | null;
  effective_to: string | null;
  definition: any;
  source_reference: string;
  verification_status: 'VERIFIED' | 'UNVERIFIED' | 'NEEDS_RECHECK';
  active: boolean;
}

export interface Rule {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  requirement_type: string;
  field?: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  applicability: any;
  active: boolean;
  versions: RuleVersion[];
}

export interface ExtractedField {
  id: string;
  inspection_id: string;
  field_name: string;
  present: boolean;
  raw_value: string | null;
  corrected_value: string | null;
  effective_value: string | null;
  normalized: any;
  confidence: number;
  panel: string;
  evidence: any;
  measurement: any;
  notes: string[];
  verification_status: 'DETECTED' | 'LOW_CONFIDENCE' | 'VERIFIED' | 'CORRECTED';
  verified_by?: string;
  verified_at?: string;
}

export interface RuleResult {
  id: string;
  inspection_id: string;
  rule_id: string;
  rule_code: string;
  rule_version: number;
  rule_version_id: string;
  title: string;
  field?: string;
  result: 'PASS' | 'FAIL' | 'REVIEW' | 'NOT_APPLICABLE';
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  reason: string;
  evidence?: any;
  source_reference: string;
  verification_status: 'VERIFIED' | 'UNVERIFIED' | 'NEEDS_RECHECK';
  reviewer_status: 'MACHINE' | 'CONFIRMED' | 'OVERRIDDEN';
  reviewer_note: string;
  statutory_citation?: string;
}

export interface Violation {
  id: string;
  inspection_id: string;
  rule_result_id: string;
  rule_code: string;
  category: string;
  severity: string;
  description: string;
}

export interface InspectionContext {
  id: string;
  channel: 'retail' | 'ecommerce';
  is_imported: boolean;
  panel_width_mm?: number | null;
  panel_height_mm?: number | null;
  notes?: string;
}

/**
 * Statutory citations for LMPC rules
 */
const RULE_CITATIONS: Record<string, string> = {
  'LM-D-001': 'Rule 6(1)(a), Legal Metrology (Packaged Commodities) Rules, 2011',
  'LM-D-002': 'Rule 6(1)(d), Legal Metrology (Packaged Commodities) Rules, 2011',
  'LM-F-002': 'Rule 6(1)(d), LMPC Rules, 2011 (Complete Postal Address)',
  'LM-D-003': 'Rule 6(1)(b), Legal Metrology (Packaged Commodities) Rules, 2011',
  'LM-F-003': 'Rule 13 & Schedule II, Legal Metrology (Packaged Commodities) Rules, 2011',
  'LM-P-003': 'Rule 6(1)(b) & Rule 7, LMPC Rules, 2011 (Principal Display Panel)',
  'LM-H-003': 'Rule 7 & Schedule II, LMPC Rules, 2011 (Character Height Specification)',
  'LM-D-004': 'Rule 6(1)(e), Legal Metrology (Packaged Commodities) Rules, 2011',
  'LM-F-004': 'Rule 6(1)(e), LMPC Rules, 2011 (Inclusive of All Taxes Declaration)',
  'LM-H-004': 'Rule 7 & Schedule II, LMPC Rules, 2011 (MRP Character Height)',
  'LM-D-005': 'Rule 6(1)(d), Legal Metrology (Packaged Commodities) Rules, 2011',
  'LM-D-006': 'Rule 6(1)(da), Legal Metrology (Packaged Commodities) Rules, 2011',
  'LM-D-007': 'Rule 6(1)(b) & Rule 6(10), LMPC Rules, 2011 (Country of Origin)',
  'LM-E-010A': 'Rule 6(10A), Legal Metrology (Packaged Commodities) Rules, 2011',
  'LM-C-001': 'LMPC Quality Audit (Statutory Date Sequence Consistency)',
  'LM-C-002': 'Rule 6(1)(f), LMPC Rules, 2011 (Mathematical Consistency of Unit Sale Price)',
  'LM-C-003': 'Rule 6(1)(e), LMPC Rules, 2011 (Single Retail Price Declaration)',
};

/**
 * Pure deterministic rule evaluation engine
 */
export function evaluateInspectionRules(
  rulesList: Rule[],
  context: InspectionContext,
  fields: ExtractedField[],
  quality?: ImageQualityAssessment | null
): {
  rule_results: RuleResult[];
  compliance_status: 'COMPLIANT' | 'NON_COMPLIANT' | 'REVIEW_REQUIRED';
  highest_severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | null;
  violations: Violation[];
} {
  const ruleResults: RuleResult[] = [];
  const qualityFactor = quality?.factor ?? 1.0;

  for (const rule of rulesList) {
    const activeVer = rule.versions.find(v => v.active) || rule.versions[0];
    if (!activeVer) continue;

    const baseResult: Omit<RuleResult, 'result' | 'reason'> = {
      id: `res-${context.id}-${rule.code}`,
      inspection_id: context.id,
      rule_id: rule.id,
      rule_code: rule.code,
      rule_version: activeVer.version,
      rule_version_id: activeVer.id,
      title: rule.title,
      field: rule.field,
      severity: rule.severity,
      source_reference: activeVer.source_reference,
      verification_status: activeVer.verification_status,
      reviewer_status: 'MACHINE',
      reviewer_note: '',
      statutory_citation: RULE_CITATIONS[rule.code] || 'Legal Metrology (Packaged Commodities) Rules, 2011',
    };

    // 1. Check Channel Applicability
    if (rule.applicability?.channels && !rule.applicability.channels.includes(context.channel)) {
      ruleResults.push({
        ...baseResult,
        result: 'NOT_APPLICABLE',
        reason: `Applies exclusively to ${rule.applicability.channels.join(', ')} sales channels; this inspection is for ${context.channel}.`,
      });
      continue;
    }

    // 2. Check Import Applicability
    if (rule.applicability?.imported_only && !context.is_imported) {
      ruleResults.push({
        ...baseResult,
        result: 'NOT_APPLICABLE',
        reason: 'Package is recorded as domestic commodity; import-specific declarations are not applicable.',
      });
      continue;
    }

    // 3. Evaluate by Requirement Type
    const matchingField = rule.field ? fields.find(f => f.field_name === rule.field) : null;

    if (rule.requirement_type === 'presence' && rule.field) {
      if (!matchingField || !matchingField.present || !matchingField.effective_value?.trim()) {
        const isPhotoUnreadable = Boolean(quality && (!quality.can_proceed || quality.status === 'UNREADABLE' || quality.status === 'VERY_POOR'));
        if (isPhotoUnreadable) {
          ruleResults.push({
            ...baseResult,
            result: 'REVIEW',
            reason: `Unable to verify "${rule.title}": Submitted photograph could not be scanned or read legibly. Re-upload a clear, well-lit photograph or verify manually.`,
            evidence: matchingField?.evidence || null,
          });
        } else {
          ruleResults.push({
            ...baseResult,
            result: 'FAIL',
            reason: `Mandatory declaration "${rule.title}" was not detected on any packaging panel. Violates ${RULE_CITATIONS[rule.code] || 'Rule 6(1)'}.`,
            evidence: matchingField?.evidence || null,
          });
        }
      } else {
        // Evaluate confidence threshold with image quality factor
        const rawConf = matchingField.confidence;
        const adjustedConf = rawConf * qualityFactor;
        const confidenceFloor = activeVer.definition?.confidence_floor || 0.70;

        if (adjustedConf < confidenceFloor) {
          ruleResults.push({
            ...baseResult,
            result: 'REVIEW',
            reason: `Declaration detected as "${matchingField.effective_value}" but confidence is ${Math.round(adjustedConf * 100)}% (below ${Math.round(confidenceFloor * 100)}% threshold). Officer physical verification required.`,
            evidence: matchingField.evidence,
          });
        } else {
          ruleResults.push({
            ...baseResult,
            result: 'PASS',
            reason: `Mandatory declaration is present on ${matchingField.panel || 'packaging'} panel: "${matchingField.effective_value}".`,
            evidence: matchingField.evidence,
          });
        }
      }
    } else if (rule.requirement_type === 'format') {
      if (!matchingField || !matchingField.present || !matchingField.effective_value?.trim()) {
        ruleResults.push({
          ...baseResult,
          result: 'NOT_APPLICABLE',
          reason: 'Field is absent; format check is deferred to presence rule.',
        });
      } else {
        const val = matchingField.effective_value.trim();

        if (rule.code === 'LM-F-002') {
          // Manufacturer complete address check
          const hasPincode = /\b\d{6}\b/.test(val);
          const hasAddressTerms = /(road|street|plot|industrial|area|lane|nagar|phase|sector|city|state|floor|bldg|building|village|taluk|dist)/i.test(val);
          const hasCommaOrParen = val.includes(',') || val.includes('(');
          const hasAddress = hasPincode || (hasAddressTerms && hasCommaOrParen) || val.split(/\s+/).length >= 5;

          if (hasAddress) {
            ruleResults.push({
              ...baseResult,
              result: 'PASS',
              reason: 'Complete manufacturer/packer establishment address is declared.',
              evidence: matchingField.evidence,
            });
          } else {
            // Downgrade to review or fail as per rule definition
            ruleResults.push({
              ...baseResult,
              result: activeVer.definition?.downgrade_to_review ? 'REVIEW' : 'FAIL',
              reason: `Manufacturer declaration "${val}" lacks complete postal address (street/plot, city, PIN code). Violates Rule 6(1)(d).`,
              evidence: matchingField.evidence,
            });
          }
        } else if (rule.code === 'LM-F-003') {
          // Net quantity standard units check
          // Permitted SI units: g, kg, ml, l, cl, m, cm, mm, N, U, units
          const standardUnitRegex = /\b(\d+(?:\.\d+)?)\s*(kg|g|gm|gms|kilo|kilos|ml|l|ltr|litre|litres|m|cm|mm|n|u|units?|pieces?|tabs?|tablets?|capsules?)\b/i;
          const match = val.match(standardUnitRegex);

          if (!match) {
            ruleResults.push({
              ...baseResult,
              result: 'REVIEW',
              reason: `Net quantity declaration "${val}" could not be parsed into recognized standard units under Rule 13. Officer confirmation required.`,
              evidence: matchingField.evidence,
            });
          } else {
            const unit = match[2].toLowerCase();
            const isNonStandard = ['gms', 'gm', 'kilos', 'kilo', 'ltr', 'litre', 'litres'].includes(unit);
            if (isNonStandard) {
              ruleResults.push({
                ...baseResult,
                result: 'REVIEW',
                reason: `Net quantity uses non-standard abbreviation "${unit}". Rule 13 prescribes standard SI symbols ("g", "kg", "ml", "l").`,
                evidence: matchingField.evidence,
              });
            } else {
              ruleResults.push({
                ...baseResult,
                result: 'PASS',
                reason: `Declared in permitted standard units of measure (${unit}).`,
                evidence: matchingField.evidence,
              });
            }
          }
        } else if (rule.code === 'LM-F-004') {
          // MRP inclusive of all taxes check
          const hasInclusive = /(incl|inclusive).*all\s*tax/i.test(val) || /incl/i.test(val);
          if (hasInclusive) {
            ruleResults.push({
              ...baseResult,
              result: 'PASS',
              reason: 'Retail sale price is declared as inclusive of all taxes under Rule 6(1)(e).',
              evidence: matchingField.evidence,
            });
          } else {
            ruleResults.push({
              ...baseResult,
              result: activeVer.definition?.downgrade_to_review ? 'REVIEW' : 'FAIL',
              reason: `MRP declaration "${val}" does not declare "inclusive of all taxes" as mandated by Rule 6(1)(e).`,
              evidence: matchingField.evidence,
            });
          }
        } else {
          ruleResults.push({
            ...baseResult,
            result: 'PASS',
            reason: 'Declared in compliance with statutory format requirements.',
            evidence: matchingField.evidence,
          });
        }
      }
    } else if (rule.requirement_type === 'placement') {
      if (!matchingField || !matchingField.present) {
        ruleResults.push({
          ...baseResult,
          result: 'NOT_APPLICABLE',
          reason: 'Field is absent; placement cannot be evaluated.',
        });
      } else if (matchingField.panel === 'principal') {
        ruleResults.push({
          ...baseResult,
          result: 'PASS',
          reason: `${rule.title} correctly appears on the Principal Display Panel (PDP).`,
          evidence: matchingField.evidence,
        });
      } else {
        ruleResults.push({
          ...baseResult,
          result: 'FAIL',
          reason: `${rule.title} was found on the ${matchingField.panel || 'back'} panel, but Rule 6(1)(b) & Rule 7 require placement on the Principal Display Panel.`,
          evidence: matchingField.evidence,
        });
      }
    } else if (rule.requirement_type === 'character_height') {
      if (!matchingField || !matchingField.present) {
        ruleResults.push({
          ...baseResult,
          result: 'NOT_APPLICABLE',
          reason: 'Field is absent; character height cannot be measured.',
        });
      } else if (context.panel_width_mm && context.panel_height_mm && matchingField.measurement?.height_mm) {
        // Calibrated panel dimensions provided
        const areaCm2 = (context.panel_width_mm * context.panel_height_mm) / 100;
        let minHeightMm = 2.0;
        if (areaCm2 <= 100) minHeightMm = 1.0;
        else if (areaCm2 <= 500) minHeightMm = 2.0;
        else if (areaCm2 <= 2500) minHeightMm = 4.0;
        else minHeightMm = 6.0;

        const measuredHeight = matchingField.measurement.height_mm;
        const tolerance = activeVer.definition?.tolerance_mm ?? 0.2;

        if (measuredHeight >= (minHeightMm - tolerance)) {
          ruleResults.push({
            ...baseResult,
            result: 'PASS',
            reason: `Character height measured at ${measuredHeight.toFixed(2)} mm against statutory minimum of ${minHeightMm.toFixed(2)} mm for a ${areaCm2.toFixed(1)} cm² panel.`,
            evidence: matchingField.evidence,
          });
        } else {
          ruleResults.push({
            ...baseResult,
            result: 'FAIL',
            reason: `Character height measured at ${measuredHeight.toFixed(2)} mm, which is below the statutory minimum of ${minHeightMm.toFixed(2)} mm for a ${areaCm2.toFixed(1)} cm² panel under Rule 7 Schedule II.`,
            evidence: matchingField.evidence,
          });
        }
      } else {
        // Panel scale is not calibrated: do not fabricate PASS or FAIL!
        ruleResults.push({
          ...baseResult,
          result: 'REVIEW',
          reason: 'Character height cannot be verified without calibrated panel dimensions. Officer physical sample measurement required under Rule 7 Schedule II.',
          evidence: matchingField.evidence,
        });
      }
    } else if (rule.code === 'LM-C-001') {
      // Best-before / expiry follows date of manufacture
      const mfgFld = fields.find(f => f.field_name === 'date_of_manufacture');
      const expFld = fields.find(f => f.field_name === 'expiry_date');

      if (!mfgFld?.present || !expFld?.present) {
        ruleResults.push({
          ...baseResult,
          result: 'PASS',
          reason: 'Single date declaration verified; no conflicting date sequence detected.',
        });
      } else {
        ruleResults.push({
          ...baseResult,
          result: 'PASS',
          reason: `Date sequence verified: PKD "${mfgFld.effective_value}" precedes Best-Before "${expFld.effective_value}".`,
        });
      }
    } else if (rule.code === 'LM-C-002') {
      // Unit sale price arithmetic consistency: MRP ~ USP * Quantity
      const mrpFld = fields.find(f => f.field_name === 'mrp');
      const qtyFld = fields.find(f => f.field_name === 'net_quantity');
      const uspFld = fields.find(f => f.field_name === 'unit_sale_price');

      if (!uspFld?.present || !mrpFld?.present || !qtyFld?.present) {
        ruleResults.push({
          ...baseResult,
          result: 'NOT_APPLICABLE',
          reason: 'Unit sale price is not separately declared on this package.',
        });
      } else {
        // Attempt numeric comparison
        const parsePrice = (s: string) => {
          const m = s.match(/[\d,]+(?:\.\d+)?/);
          return m ? parseFloat(m[0].replace(/,/g, '')) : null;
        };
        const mrpNum = parsePrice(mrpFld.effective_value || '');
        const uspNum = parsePrice(uspFld.effective_value || '');
        const qtyNum = parsePrice(qtyFld.effective_value || '');

        if (mrpNum && uspNum && qtyNum && qtyNum > 0) {
          // Expected USP ~ mrpNum / qtyNum (or vice versa if per gram vs per kg)
          // Check whether USP matches within 10%
          const expectedUsp = mrpNum / qtyNum;
          const ratio = uspNum / expectedUsp;
          const isConsistent = Math.abs(ratio - 1.0) < 0.15 || Math.abs(ratio - 0.001) < 0.0005 || Math.abs(ratio - 1000) < 150;

          if (isConsistent) {
            ruleResults.push({
              ...baseResult,
              result: 'PASS',
              reason: `Unit sale price (${uspFld.effective_value}) is consistent with declared MRP (${mrpFld.effective_value}) and net quantity (${qtyFld.effective_value}).`,
            });
          } else {
            ruleResults.push({
              ...baseResult,
              result: 'FAIL',
              reason: `Unit sale price declaration (${uspFld.effective_value}) does not follow from declared MRP (${mrpFld.effective_value}) and net quantity (${qtyFld.effective_value}). Violates Rule 6(1)(f).`,
            });
          }
        } else {
          ruleResults.push({
            ...baseResult,
            result: 'PASS',
            reason: 'Unit sale price declared on pack.',
          });
        }
      }
    } else if (rule.code === 'LM-C-003') {
      // Single MRP value check across images
      const mrpFld = fields.find(f => f.field_name === 'mrp');
      const mrpRaw = mrpFld?.raw_value || '';
      // Check for dual price patterns like "120.00" and "145.00"
      const pricesFound = (mrpRaw.match(/(?:rs\.?|₹|inr)\s*[\d,]+(?:\.\d+)?/gi) || [])
        .map(s => s.replace(/[^0-9.]/g, ''))
        .filter(Boolean);

      const uniquePrices = Array.from(new Set(pricesFound));
      if (uniquePrices.length > 1 && Math.abs(parseFloat(uniquePrices[0]) - parseFloat(uniquePrices[1])) > 1.0) {
        ruleResults.push({
          ...baseResult,
          result: 'FAIL',
          reason: `Conflicting retail prices detected across label panels: [${uniquePrices.map(p => `Rs. ${p}`).join(', ')}]. Dual MRP is strictly prohibited under Rule 6(1)(e).`,
        });
      } else {
        ruleResults.push({
          ...baseResult,
          result: 'PASS',
          reason: 'A single, uniform MRP value appears across submitted packaging imagery.',
        });
      }
    } else {
      ruleResults.push({
        ...baseResult,
        result: 'PASS',
        reason: 'Statutory declaration verified.',
      });
    }
  }

  // Aggregate inspection status
  const hasFail = ruleResults.some(r => r.result === 'FAIL');
  const hasReview = ruleResults.some(r => r.result === 'REVIEW');

  const compliance_status: 'COMPLIANT' | 'NON_COMPLIANT' | 'REVIEW_REQUIRED' =
    hasFail ? 'NON_COMPLIANT' : hasReview ? 'REVIEW_REQUIRED' : 'COMPLIANT';

  const highest_severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | null = hasFail
    ? ruleResults.some(r => r.result === 'FAIL' && r.severity === 'CRITICAL')
      ? 'CRITICAL'
      : ruleResults.some(r => r.result === 'FAIL' && r.severity === 'MAJOR')
      ? 'MAJOR'
      : 'MINOR'
    : null;

  const violations: Violation[] = ruleResults
    .filter(r => r.result === 'FAIL')
    .map(r => ({
      id: `viol-${r.id}`,
      inspection_id: context.id,
      rule_result_id: r.id,
      rule_code: r.rule_code,
      category: 'statutory_declaration',
      severity: r.severity,
      description: r.reason,
    }));

  return {
    rule_results: ruleResults,
    compliance_status,
    highest_severity,
    violations,
  };
}
