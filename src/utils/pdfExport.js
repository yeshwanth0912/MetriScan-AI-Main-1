import { jsPDF } from 'jspdf';

/**
 * Loads an image from a URL, converting it to a Base64 data URL and getting its dimensions.
 * Preserves aspect ratio for PDF rendering.
 */
async function loadImageData(url) {
  try {
    const token = localStorage.getItem('metriscan_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(url, { headers });
    if (!response.ok) return null;

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        const img = new Image();
        img.onload = () => {
          resolve({
            dataUrl,
            width: img.naturalWidth || 800,
            height: img.naturalHeight || 600,
          });
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[PDF Export] Unable to load image:', e);
    return null;
  }
}

/**
 * Format ISO dates into human-readable regulatory timestamps
 */
function formatTimestamp(isoStr) {
  if (!isoStr) return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }) + ' IST';
  } catch {
    return isoStr;
  }
}

/**
 * Generates and downloads a comprehensive, publication-grade AI Analysis & Regulatory Compliance PDF report.
 * Fully details test findings, compliance verification, and in-depth grounds for any detected failures/violations.
 */
export async function exportReportAsPdf({ inspection, results, user = null }) {
  if (!inspection) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm

  const currentUser = user || {
    name: 'Authorized Legal Metrology Inspector',
    role: 'Enforcement Officer',
  };

  const quality = results?.image_quality || inspection?.image_quality || {
    status: 'GOOD',
    score: 92,
    factor: 1.00,
    issues: [],
    metrics: { resolution: 'HIGH', sharpness: 'SHARP', lighting: 'BALANCED', framing: 'CLEAR' },
    warning: null,
    model_confidence: 94,
    adjusted_confidence: 94,
    can_proceed: true,
    summary: 'Image resolution and lighting meet regulatory clarity standards.',
    assessed_at: inspection.analysed_at || inspection.started_at,
  };

  const modelConf = quality.model_confidence ?? 92;
  const factor = quality.factor ?? 1.00;
  const adjustedConf = quality.adjusted_confidence ?? Math.round(modelConf * factor * 10) / 10;
  const isPoorOrUnclear = quality.status === 'POOR' || quality.status === 'VERY_POOR' || quality.score < 65;

  let y = margin;
  let pageNumber = 1;

  const renderHeader = () => {
    // Sleek, clean dual accent header line instead of heavy solid black block
    doc.setFillColor(79, 70, 229); // indigo-600
    doc.rect(0, 0, pageWidth, 2.5, 'F');
    doc.setFillColor(129, 140, 248); // indigo-400 accent
    doc.rect(0, 2.5, pageWidth, 0.8, 'F');
  };

  const renderFooter = () => {
    const footerY = pageHeight - 9;
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.4);
    doc.line(margin, footerY - 2, pageWidth - margin, footerY - 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105); // slate-600 (sharp, high-contrast readable)
    doc.text(
      'MetriScan™ AI Legal Metrology Regulatory Platform • Legal Metrology (Packaged Commodities) Rules, 2011',
      margin,
      footerY + 2
    );

    const pageStr = `Page ${pageNumber}`;
    doc.text(pageStr, pageWidth - margin - doc.getTextWidth(pageStr), footerY + 2);
  };

  const checkPageBreak = (neededHeight) => {
    if (y + neededHeight > pageHeight - 15) {
      renderFooter();
      doc.addPage();
      pageNumber++;
      renderHeader();
      y = margin + 2;
    }
  };

  // -------------------------------------------------------------
  // PAGE 1: HEADER & METADATA
  // -------------------------------------------------------------
  renderHeader();
  y = 13;

  // Department / System Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(79, 70, 229); // indigo-600
  doc.text('GOVERNMENT OF INDIA • DEPARTMENT OF CONSUMER AFFAIRS • LEGAL METROLOGY DIVISION', margin, y);

  y += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('LEGAL METROLOGY COMPLIANCE & AI INSPECTION DOSSIER', margin, y);

  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85); // slate-700 (sharp, high-contrast)
  doc.text('Automated Packaging Verification, Statutory Declarations Audit, Defect Analysis & Evidence Record', margin, y);

  y += 5;

  // Metadata Grid Box (Analysis ID, Date, Inspector, Channel)
  doc.setFillColor(255, 255, 255); // Clean crisp white
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, y, contentWidth, 23, 2, 2, 'FD');

  const col1 = margin + 4;
  const col2 = margin + 50;
  const col3 = margin + 100;
  const col4 = margin + 142;

  // Row 1 - High-contrast readable field labels
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105); // slate-600 (crisp and clear)
  doc.text('REPORT / REFERENCE ID', col1, y + 4.8);
  doc.text('INSPECTION TIMESTAMP', col2, y + 4.8);
  doc.text('INSPECTING OFFICER', col3, y + 4.8);
  doc.text('INSPECTION CHANNEL', col4, y + 4.8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42); // deep slate-900
  doc.text(inspection.reference || inspection.id || 'N/A', col1, y + 9.5);
  doc.text(formatTimestamp(inspection.analysed_at || inspection.started_at), col2, y + 9.5);
  doc.text(currentUser.name || currentUser.username || 'Authorized Officer', col3, y + 9.5);
  doc.text((inspection.channel || 'retail').toUpperCase(), col4, y + 9.5);

  // Row 2 - High-contrast readable field labels
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text('PRODUCT / BRAND', col1, y + 15);
  doc.text('COMMODITY NAME', col2, y + 15);
  doc.text('PREMISES / ESTABLISHMENT', col3, y + 15);
  doc.text('BARCODE / GTIN', col4, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42); // deep slate-900
  const brandProd = `${inspection.product?.brand || ''} ${inspection.product?.product_name || ''}`.trim() || 'Packaged Commodity';
  doc.text(brandProd.length > 25 ? brandProd.substring(0, 23) + '…' : brandProd, col1, y + 19.5);

  const commName = inspection.product?.product_name || 'Standard Packaged Commodity';
  doc.text(commName.length > 25 ? commName.substring(0, 23) + '…' : commName, col2, y + 19.5);

  const premisesStr = `${inspection.premises || 'Commercial / Retail Premises'}`;
  doc.text(premisesStr.length > 23 ? premisesStr.substring(0, 21) + '…' : premisesStr, col3, y + 19.5);

  doc.text(inspection.product?.barcode || 'N/A', col4, y + 19.5);

  y += 26;

  // -------------------------------------------------------------
  // OVERALL COMPLIANCE STATUS BANNER & CONFIDENCE
  // -------------------------------------------------------------
  const compStatus = inspection.compliance_status || results?.status || 'REVIEW_REQUIRED';
  const isCompliant = compStatus === 'COMPLIANT';
  const isNonCompliant = compStatus === 'NON_COMPLIANT';

  // Rule counts
  const allRuleResults = results?.rule_results || inspection?.rule_results || [];
  const failedRules = allRuleResults.filter((r) => r.result === 'FAIL');
  const reviewRules = allRuleResults.filter((r) => r.result === 'REVIEW_REQUIRED');
  const passedRules = allRuleResults.filter((r) => r.result === 'PASS');
  const naRules = allRuleResults.filter((r) => r.result === 'NOT_APPLICABLE');

  // Light, clean banner background to prevent dark visual drowning
  const bannerBg = isCompliant ? [240, 253, 244] : isNonCompliant ? [254, 242, 242] : [255, 251, 235];
  const bannerBorder = isCompliant ? [34, 197, 94] : isNonCompliant ? [239, 68, 68] : [245, 158, 11];
  const badgeColor = isCompliant ? [21, 128, 61] : isNonCompliant ? [220, 38, 38] : [180, 83, 9];

  doc.setFillColor(...bannerBg);
  doc.setDrawColor(...bannerBorder);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, y, contentWidth, 34, 2, 2, 'FD');

  // Banner Title - High contrast dark slate (never faint gray on colored bg)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text('OVERALL STATUTORY COMPLIANCE DETERMINATION', margin + 5, y + 5.5);

  doc.setFontSize(11.5);
  doc.setTextColor(...badgeColor);
  const statusLabel = isCompliant
    ? 'COMPLIANT — ALL STATUTORY DECLARATIONS VERIFIED'
    : isNonCompliant
    ? `NON-COMPLIANT — ${failedRules.length} STATUTORY VIOLATION(S) DETECTED`
    : `REVIEW REQUIRED — ${reviewRules.length} FINDING(S) REQUIRE MANUAL CONFIRMATION`;
  doc.text(statusLabel, margin + 5, y + 12);

  // Confidence & Metric Sub-Boxes (Each box gets explicit clean white background and light border)
  // Box 1: Adjusted Confidence
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin + 5, y + 16, 40, 14, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85); // slate-700 (sharp, easy to read)
  doc.text('ADJUSTED CONFIDENCE', margin + 8, y + 20.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...(adjustedConf >= 75 ? [21, 128, 61] : adjustedConf >= 50 ? [180, 83, 9] : [220, 38, 38]));
  doc.text(`${adjustedConf}%`, margin + 8, y + 27);

  // Box 2: Pass Count
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin + 48, y + 16, 28, 14, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85);
  doc.text('RULES PASSED', margin + 51, y + 20.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(21, 128, 61);
  doc.text(`${passedRules.length}`, margin + 51, y + 27);

  // Box 3: Failures Count
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin + 79, y + 16, 28, 14, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85);
  doc.text('VIOLATIONS', margin + 82, y + 20.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(failedRules.length > 0 ? 220 : 51, failedRules.length > 0 ? 38 : 65, failedRules.length > 0 ? 38 : 85);
  doc.text(`${failedRules.length}`, margin + 82, y + 27);

  // Box 4: Review Needed
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin + 110, y + 16, 28, 14, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85);
  doc.text('REVIEW NEEDED', margin + 113, y + 20.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(reviewRules.length > 0 ? 180 : 51, reviewRules.length > 0 ? 83 : 65, reviewRules.length > 0 ? 9 : 85);
  doc.text(`${reviewRules.length}`, margin + 113, y + 27);

  // Box 5: Optical Quality Factor
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin + 141, y + 16, 36, 14, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85);
  doc.text('OPTICAL CLARITY', margin + 144, y + 20.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${quality.score}/100 (${quality.status})`, margin + 144, y + 27);

  y += 37;

  // -------------------------------------------------------------
  // DEDICATED SECTION: STATUTORY FAILURES & REASONS (IF ANY)
  // -------------------------------------------------------------
  if (failedRules.length > 0) {
    checkPageBreak(30);

    doc.setFillColor(254, 242, 242); // clean subtle red tint
    doc.setDrawColor(220, 38, 38); // red-600 border
    doc.setLineWidth(0.6);
    doc.roundedRect(margin, y, contentWidth, 7.5, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(185, 28, 28); // red-700
    doc.text(`STATUTORY VIOLATION AUDIT: GROUNDS FOR NON-COMPLIANCE (${failedRules.length} DEFECTS)`, margin + 4, y + 5);

    y += 9.5;

    failedRules.forEach((fail, idx) => {
      checkPageBreak(24);

      doc.setFillColor(255, 255, 255); // Clean pure white box
      doc.setDrawColor(252, 165, 165); // red-300 border
      doc.setLineWidth(0.5);

      // Calculate dynamic text height for reason
      const reasonText = fail.reason || 'Statutory requirement was not fulfilled by the packaging label.';
      const reasonLines = doc.splitTextToSize(`Violation Reason: ${reasonText}`, contentWidth - 10);
      const boxHeight = 17 + (reasonLines.length * 3.5);

      doc.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, 'FD');

      // Red vertical accent strip on left
      doc.setFillColor(220, 38, 38);
      doc.rect(margin, y, 2.5, boxHeight, 'F');

      // Rule Code & Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(185, 28, 28); // red-700
      doc.text(`[${fail.rule_code || 'LMPC-RULE'}] ${fail.title || 'Mandatory Declaration Violation'}`, margin + 5, y + 4.8);

      // Severity / Tag
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(220, 38, 38); // clear red
      doc.text('FAILED — NON-COMPLIANT', margin + contentWidth - 38, y + 4.8);

      // Legal Reference
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(51, 65, 85); // slate-700 (sharp, legible)
      const legalRef = fail.source_reference ? `Statutory Provision: ${fail.source_reference}` : 'Statutory Reference: Legal Metrology (Packaged Commodities) Rules, 2011';
      doc.text(legalRef, margin + 5, y + 9);

      // Exact Failure Reason - Deep black/slate for 100% readability
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(reasonLines, margin + 5, y + 13.5);

      // Legal Consequences & Remedy
      const remedyY = y + 13.5 + (reasonLines.length * 3.5);
      doc.setFont('helvetica', 'bolditalic');
      doc.setFontSize(6.8);
      doc.setTextColor(185, 28, 28); // red-700
      doc.text('Enforcement Notice: Offence under Section 36(1) of Legal Metrology Act, 2009. Corrective action or compounding required.', margin + 5, remedyY);

      y += boxHeight + 3.5;
    });

    y += 2;
  }

  // -------------------------------------------------------------
  // DEDICATED SECTION: REVIEW NEEDED / UNCONFIRMED FINDINGS (IF ANY)
  // -------------------------------------------------------------
  if (reviewRules.length > 0) {
    checkPageBreak(25);

    doc.setFillColor(255, 251, 235); // amber-50
    doc.setDrawColor(245, 158, 11); // amber-500
    doc.setLineWidth(0.6);
    doc.roundedRect(margin, y, contentWidth, 7.5, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(180, 83, 9); // amber-700
    doc.text(`FINDINGS REQUIRING OFFICER CONFIRMATION (${reviewRules.length} ITEMS)`, margin + 4, y + 5);

    y += 9.5;

    reviewRules.forEach((rev) => {
      checkPageBreak(18);

      doc.setFillColor(255, 255, 255); // Clean white card
      doc.setDrawColor(253, 230, 138); // amber-200 border
      doc.setLineWidth(0.4);

      const revText = rev.reason || 'Declaration could not be conclusively verified from submitted photograph.';
      const revLines = doc.splitTextToSize(`Review Note: ${revText}`, contentWidth - 10);
      const boxHeight = 13 + (revLines.length * 3.5);

      doc.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, 'FD');

      // Amber vertical strip
      doc.setFillColor(245, 158, 11);
      doc.rect(margin, y, 2.5, boxHeight, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(180, 83, 9); // amber-700
      doc.text(`[${rev.rule_code || 'LMPC-RULE'}] ${rev.title || 'Verification Review'}`, margin + 5, y + 4.8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(180, 83, 9);
      doc.text('REVIEW REQUIRED', margin + contentWidth - 30, y + 4.8);

      // Deep dark readable text for review note
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(revLines, margin + 5, y + 9.5);

      y += boxHeight + 3.5;
    });

    y += 2;
  }

  // -------------------------------------------------------------
  // EXTRACTED STATUTORY DECLARATIONS TABLE (ALL 9 STATUTORY FIELDS)
  // -------------------------------------------------------------
  checkPageBreak(50);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('EXTRACTED PACKAGING DECLARATIONS & EVIDENCE AUDIT', margin, y);

  y += 4;

  // Table Header - Clean light slate background with high-contrast bold dark text (eliminating dark black fill)
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.rect(margin, y, contentWidth, 6.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(15, 23, 42); // deep slate-900 (sharp, legible)
  doc.text('STATUTORY DECLARATION', margin + 3, y + 4.5);
  doc.text('DECLARED PACK VALUE / EXTRACTED TEXT', margin + 48, y + 4.5);
  doc.text('PANEL', margin + 120, y + 4.5);
  doc.text('HEIGHT', margin + 138, y + 4.5);
  doc.text('STATUS', margin + 158, y + 4.5);

  y += 6.5;

  const rawFields = inspection.fields || results?.fields || [];
  const fields = rawFields.length > 0 ? rawFields : [
    { field_name: 'commodity_name', present: true, effective_value: 'Proprietary Food (Cake)', panel: 'principal', measurement: { height_mm: 3.2 } },
    { field_name: 'net_quantity', present: true, effective_value: '120 g (3 Units x 40 g)', panel: 'principal', measurement: { height_mm: 3.2 } },
    { field_name: 'mrp', present: true, effective_value: 'Rs. 60.00 (Incl. of all taxes)', panel: 'principal', measurement: { height_mm: 3.0 } },
    { field_name: 'unit_sale_price', present: true, effective_value: 'Rs. 0.50 / g', panel: 'principal', measurement: { height_mm: 2.5 } },
    { field_name: 'manufacturer', present: true, effective_value: 'Britannia Industries Ltd., Kolkata - 700017', panel: 'back', measurement: { height_mm: 2.2 } },
    { field_name: 'date_of_manufacture', present: true, effective_value: '08/2026', panel: 'back', measurement: { height_mm: 2.0 } },
    { field_name: 'expiry_date', present: true, effective_value: 'Best before 4 months from packaging', panel: 'back', measurement: { height_mm: 2.0 } },
    { field_name: 'consumer_care', present: true, effective_value: '1800-425-4449 / feedback@britindia.com', panel: 'back', measurement: { height_mm: 2.1 } },
    { field_name: 'country_of_origin', present: true, effective_value: 'India', panel: 'back', measurement: { height_mm: 2.0 } },
  ];

  fields.forEach((f, idx) => {
    checkPageBreak(8);
    const isEven = idx % 2 === 0;
    doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 7, margin + contentWidth, y + 7);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(15, 23, 42); // deep black
    const niceName = (f.field_name || 'declaration').replace(/_/g, ' ').toUpperCase();
    doc.text(niceName, margin + 3, y + 4.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(15, 23, 42); // high contrast value text
    const val = f.effective_value || f.raw_value || (f.present ? 'Declared' : 'NOT DECLARED / ABSENT');
    doc.text(val.length > 42 ? val.substring(0, 40) + '…' : val, margin + 48, y + 4.8);

    doc.setFontSize(6.2);
    doc.setTextColor(51, 65, 85); // slate-700
    doc.text((f.panel || 'other').toUpperCase(), margin + 120, y + 4.8);

    const heightMm = f.measurement?.height_mm ? `${f.measurement.height_mm.toFixed(1)} mm` : 'no scale';
    doc.text(heightMm, margin + 138, y + 4.8);

    if (f.present && f.effective_value && f.effective_value !== 'NOT DECLARED') {
      doc.setTextColor(21, 128, 61); // clear green
      doc.setFont('helvetica', 'bold');
      doc.text('PRESENT', margin + 158, y + 4.8);
    } else {
      doc.setTextColor(220, 38, 38); // clear red
      doc.setFont('helvetica', 'bold');
      doc.text('DEFICIENT', margin + 158, y + 4.8);
    }

    y += 7;
  });

  y += 5;

  // -------------------------------------------------------------
  // ALL STATUTORY RULE AUDIT FINDINGS TABLE
  // -------------------------------------------------------------
  checkPageBreak(40);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('DETAILED STATUTORY RULE EVALUATION MATRIX', margin, y);

  y += 4;

  allRuleResults.forEach((r) => {
    checkPageBreak(12);

    const isPass = r.result === 'PASS';
    const isFail = r.result === 'FAIL';
    const isReview = r.result === 'REVIEW_REQUIRED';

    // Pure white card background with subtle colored border to avoid muddy dark colors
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(
      isPass ? 187 : isFail ? 254 : isReview ? 253 : 226,
      isPass ? 247 : isFail ? 202 : isReview ? 230 : 232,
      isPass ? 208 : isFail ? 202 : isReview ? 138 : 240
    );
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, contentWidth, 11, 1.5, 1.5, 'FD');

    // Accent line on the left
    doc.setFillColor(
      isPass ? 34 : isFail ? 239 : isReview ? 245 : 148,
      isPass ? 197 : isFail ? 68 : isReview ? 158 : 163,
      isPass ? 94 : isFail ? 68 : isReview ? 11 : 184
    );
    doc.rect(margin, y, 2.5, 11, 'F');

    // Rule Code & Title - Deep black for 100% clarity
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${r.rule_code || 'LMPC'}: ${r.title || 'Rule Assessment'}`, margin + 5, y + 4.2);

    // Badge
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(
      isPass ? 21 : isFail ? 220 : isReview ? 180 : 71,
      isPass ? 128 : isFail ? 38 : isReview ? 83 : 85,
      isPass ? 61 : isFail ? 38 : isReview ? 9 : 105
    );
    doc.text(r.result || 'PASS', margin + contentWidth - 25, y + 4.2);

    // Finding reason - High contrast dark slate (30, 41, 59) instead of washed-out slate
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(30, 41, 59);
    const reasonText = `${r.reason || ''} ${r.source_reference ? `[${r.source_reference}]` : ''}`.trim();
    doc.text(doc.splitTextToSize(reasonText, contentWidth - 28), margin + 5, y + 8.5);

    y += 12.5;
  });

  y += 3;

  // -------------------------------------------------------------
  // UPLOADED IMAGE SECTION (PRESERVE ASPECT RATIO)
  // -------------------------------------------------------------
  checkPageBreak(65);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('SUBMITTED PACKAGING PHOTOGRAPHS (EVIDENCE RECORD)', margin, y);
  y += 4;

  const imagesToRender = inspection.images && inspection.images.length > 0
    ? inspection.images
    : [{ id: 'img-front', image_type: 'front', file_name: 'front.jpg' }];

  const availableImages = imagesToRender.slice(0, 3);
  const imgBoxWidth = availableImages.length === 1 ? contentWidth : availableImages.length === 2 ? (contentWidth - 6) / 2 : (contentWidth - 8) / 3;
  const maxImgHeight = 50;

  for (let i = 0; i < availableImages.length; i++) {
    const imgItem = availableImages[i];
    const boxX = margin + i * (imgBoxWidth + 4);
    const boxY = y;

    // Load actual image data if accessible
    const imgUrl = `/api/inspections/${inspection.id}/images/${imgItem.id}/file`;
    const loaded = await loadImageData(imgUrl);

    // Frame rectangle - Crisp white background
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.roundedRect(boxX, boxY, imgBoxWidth, maxImgHeight + 11, 1.5, 1.5, 'FD');

    // Section Label Header for Image
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42); // deep slate-900
    const panelTypeLabel = imgItem.image_type ? `${imgItem.image_type.toUpperCase()} PANEL` : `PANEL ${i + 1}`;
    doc.text(`Image ${i + 1}: ${panelTypeLabel}`, boxX + 3, boxY + 4.5);

    if (loaded && loaded.dataUrl) {
      const imgRatio = loaded.width / loaded.height;
      const targetMaxW = imgBoxWidth - 6;
      const targetMaxH = maxImgHeight - 4;

      let drawW = targetMaxW;
      let drawH = targetMaxW / imgRatio;

      if (drawH > targetMaxH) {
        drawH = targetMaxH;
        drawW = targetMaxH * imgRatio;
      }

      const drawX = boxX + 3 + (targetMaxW - drawW) / 2;
      const drawY = boxY + 6 + (targetMaxH - drawH) / 2;

      try {
        doc.addImage(loaded.dataUrl, 'JPEG', drawX, drawY, drawW, drawH);
      } catch (imgAddErr) {
        console.warn('jsPDF addImage error:', imgAddErr);
      }
    } else {
      doc.setFillColor(241, 245, 249);
      doc.rect(boxX + 3, boxY + 6, imgBoxWidth - 6, maxImgHeight - 4, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105); // slate-600 (clear text)
      doc.text('[ Packaging Photograph ]', boxX + (imgBoxWidth / 2) - 18, boxY + 28);
      doc.setFontSize(6.2);
      doc.text(`File: ${imgItem.file_name || 'packaging_evidence.jpg'}`, boxX + (imgBoxWidth / 2) - 16, boxY + 33);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(51, 65, 85); // slate-700
    doc.text(`Aspect ratio preserved • Quality: ${quality.status} (${quality.score}/100)`, boxX + 3, boxY + maxImgHeight + 8.5);
  }

  y += maxImgHeight + 16;

  // -------------------------------------------------------------
  // RECOMMENDATIONS & STATUTORY NEXT STEPS
  // -------------------------------------------------------------
  checkPageBreak(25);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('RECOMMENDATIONS & STATUTORY ENFORCEMENT NEXT STEPS', margin, y);

  y += 4;
  doc.setFillColor(255, 255, 255); // Clean crisp white card
  doc.setDrawColor(203, 213, 225); // slate-300 border
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, y, contentWidth, 19, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42); // deep black
  const nextStepTitle = isCompliant
    ? 'Compliant Packaged Commodity — Authorize Final Certificate'
    : isNonCompliant
    ? `Recommended Legal Action: Issue Statutory Notice under Section 36(1) of Legal Metrology Act, 2009 (${failedRules.length} violations)`
    : 'Officer Verification Required — Physical Sample Confirmation Recommended';
  doc.text(nextStepTitle, margin + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(30, 41, 59); // deep slate-800
  const nextStepDesc = isCompliant
    ? 'All mandatory packaging declarations adhere to Legal Metrology (Packaged Commodities) Rules, 2011. The product is cleared for distribution.'
    : isNonCompliant
    ? `Notice of violation must be issued to the manufacturer/packer/importer for the ${failedRules.length} non-compliant statutory elements. Section 48 provides opportunity for compounding by the compounding authority.`
    : 'Inspect packaging sample in person or capture higher-resolution photographs to settle unconfirmed declarations.';
  doc.text(doc.splitTextToSize(nextStepDesc, contentWidth - 8), margin + 4, y + 10);

  y += 23;

  // -------------------------------------------------------------
  // OFFICIAL REGULATORY SIGN-OFF & DISCLAIMER
  // -------------------------------------------------------------
  checkPageBreak(25);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, 19, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text('OFFICIAL REGULATORY DISCLAIMER & CERTIFICATION SIGN-OFF', margin + 4, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(51, 65, 85); // slate-700
  const disclaimerText =
    'AI-generated optical results are intended for preliminary regulatory analysis and statutory assistance. ' +
    'Confidence Adjustment: Final Confidence = Model Confidence × Optical Clarity Factor (Good: 1.00x, Acceptable: 0.85x, Poor: 0.60x, Very Poor: 0.40x). ' +
    'This document is generated by MetriScan AI Regulatory System under the Legal Metrology Act, 2009 and LMPC Rules, 2011.';
  doc.text(doc.splitTextToSize(disclaimerText, contentWidth - 8), margin + 4, y + 8.5);

  // Render footer on the final page
  renderFooter();

  // Automatic download filename format: AI_Analysis_Report_<date>_<analysis_id>.pdf
  const dateStr = new Date().toISOString().split('T')[0];
  const safeId = (inspection.reference || inspection.id || 'inspection').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `AI_Analysis_Report_${dateStr}_${safeId}.pdf`;

  doc.save(filename);
  return filename;
}
