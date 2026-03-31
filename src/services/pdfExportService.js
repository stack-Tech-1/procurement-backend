import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

// KUN Brand Colors (RGB)
const NAVY  = [10, 22, 40];
const GOLD  = [184, 150, 10];
const WHITE = [255, 255, 255];
const LIGHT_GRAY = [248, 249, 250];
const DARK_GRAY  = [60, 60, 60];
const MID_GRAY   = [120, 120, 120];

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Draw the KUN Real Estate branded page header.
 * @param {PDFDocument} doc
 * @param {string} reportTitle
 */
const drawPageHeader = (doc, reportTitle) => {
  const pageWidth = doc.page.width;
  doc.rect(0, 0, pageWidth, 70).fill(NAVY);
  doc.fillColor(GOLD).fontSize(9).font('Helvetica-Bold')
    .text('KUN REAL ESTATE', 40, 18, { align: 'left' });
  doc.fillColor(WHITE).fontSize(16).font('Helvetica-Bold')
    .text(reportTitle, 40, 34, { align: 'left' });
  doc.moveDown(3.5);
};

/**
 * Draw a gold accent rule.
 */
const drawRule = (doc, y) => {
  const pageWidth = doc.page.width;
  doc.moveTo(40, y).lineTo(pageWidth - 40, y).strokeColor(GOLD).lineWidth(1.5).stroke();
};

/**
 * Draw page footer with page number and generation date.
 */
const drawPageFooter = (doc) => {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  drawRule(doc, pageHeight - 40);
  doc.fillColor(MID_GRAY).fontSize(8).font('Helvetica')
    .text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 40, pageHeight - 28, { align: 'left' })
    .text(`Page ${doc.bufferedPageRange().start + 1}`, 0, pageHeight - 28, { align: 'right', width: pageWidth - 40 });
};

/**
 * Draw a two-column key-value info row.
 */
const drawInfoRow = (doc, label, value, y) => {
  doc.fillColor(MID_GRAY).fontSize(9).font('Helvetica').text(label + ':', 40, y);
  doc.fillColor(DARK_GRAY).fontSize(9).font('Helvetica-Bold').text(String(value ?? '—'), 200, y);
};

/**
 * Draw a simple table.
 * @param {PDFDocument} doc
 * @param {{ header: string; width: number }[]} columns
 * @param {Array<Array<string|number>>} rows
 * @param {number} startY
 */
const drawTable = (doc, columns, rows, startY) => {
  const pageWidth = doc.page.width;
  const margin = 40;
  const rowHeight = 20;
  let y = startY;

  // Header
  let x = margin;
  doc.rect(margin, y, pageWidth - margin * 2, rowHeight).fill(NAVY);
  columns.forEach((col) => {
    doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold')
      .text(col.header, x + 3, y + 5, { width: col.width - 6, ellipsis: true });
    x += col.width;
  });
  y += rowHeight;

  // Data rows
  rows.forEach((row, idx) => {
    if (y > doc.page.height - 80) {
      doc.addPage();
      drawPageHeader(doc, '');
      y = 90;
    }
    const bg = idx % 2 === 0 ? WHITE : LIGHT_GRAY;
    x = margin;
    const rowTotalWidth = columns.reduce((s, c) => s + c.width, 0);
    doc.rect(margin, y, rowTotalWidth, rowHeight).fill(bg);

    columns.forEach((col, ci) => {
      const val = row[ci] != null ? String(row[ci]) : '—';
      doc.fillColor(DARK_GRAY).fontSize(8).font('Helvetica')
        .text(val, x + 3, y + 5, { width: col.width - 6, ellipsis: true });
      x += col.width;
    });
    doc.rect(margin, y, rowTotalWidth, rowHeight).strokeColor([220, 220, 220]).lineWidth(0.3).stroke();
    y += rowHeight;
  });

  return y;
};

// ─── Vendor Profile PDF ───────────────────────────────────────────────────────
export const generateVendorProfilePDF = async (vendor) => {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const stream = new PassThrough();
    doc.pipe(stream);

    // Page 1: Identity + Score
    drawPageHeader(doc, 'Vendor Profile Report');

    const q = vendor.vendorQualifications?.[0];
    const score = vendor.qualificationScore || 0;
    const scoreColor = score >= 85 ? [22, 163, 74] : score >= 70 ? GOLD : score >= 50 ? [249, 115, 22] : [220, 38, 38];

    // Company name + class badge
    doc.fillColor(NAVY).fontSize(20).font('Helvetica-Bold')
      .text(vendor.companyLegalName || vendor.user?.name || 'Unknown Vendor', 40, 95);

    // Score circle (right side)
    const scoreX = doc.page.width - 110;
    doc.circle(scoreX, 115, 35).fill(scoreColor);
    doc.fillColor(WHITE).fontSize(18).font('Helvetica-Bold')
      .text(String(Math.round(score)), scoreX - 20, 105, { width: 40, align: 'center' });
    doc.fontSize(8).text('/ 100', scoreX - 20, 124, { width: 40, align: 'center' });

    // Class badge
    const vcColor = vendor.vendorClass === 'A' ? [22, 163, 74] :
      vendor.vendorClass === 'B' ? GOLD :
      vendor.vendorClass === 'C' ? [249, 115, 22] : [220, 38, 38];
    doc.roundedRect(scoreX - 25, 155, 55, 22, 4).fill(vcColor);
    doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold')
      .text(`Class ${vendor.vendorClass || 'D'}`, scoreX - 22, 160, { width: 50, align: 'center' });

    drawRule(doc, 170);
    let y = 185;

    // Key fields
    const fields = [
      ['Vendor ID', vendor.vendorId || vendor.id],
      ['Vendor Type', vendor.vendorType],
      ['Status', vendor.status],
      ['CR Number', vendor.crNumber],
      ['VAT Number', vendor.vatNumber],
      ['Years in Business', vendor.yearsInBusiness],
      ['Contact Email', vendor.contactEmail || vendor.user?.email],
      ['Contact Phone', vendor.contactPhone],
      ['City', vendor.addressCity],
      ['Country', vendor.addressCountry],
    ];
    fields.forEach(([label, value]) => {
      drawInfoRow(doc, label, value, y);
      y += 18;
    });

    // AI Evaluation Notes
    if (q?.aiEvaluationNotes) {
      y += 10;
      drawRule(doc, y);
      y += 10;
      doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('AI Evaluation Notes', 40, y);
      y += 18;
      doc.fillColor(MID_GRAY).fontSize(9).font('Helvetica-Oblique')
        .text(q.aiEvaluationNotes, 40, y, { width: doc.page.width - 80 });
    }

    drawPageFooter(doc);

    // Page 2: Document Compliance
    doc.addPage();
    drawPageHeader(doc, 'Vendor Profile — Documents');

    const REQUIRED_DOC_TYPES = [
      'COMMERCIAL_REGISTRATION', 'ZAKAT_CERTIFICATE', 'VAT_CERTIFICATE',
      'GOSI_CERTIFICATE', 'BANK_LETTER', 'INSURANCE_CERTIFICATE',
      'ISO_CERTIFICATE', 'HSE_PLAN', 'TECHNICAL_FILE',
    ];
    const now = new Date();

    const docRows = REQUIRED_DOC_TYPES.map((dt) => {
      const doc_ = vendor.documents?.find((d) => d.docType === dt);
      if (!doc_) return [dt.replace(/_/g, ' '), 'Missing', '—', '—'];
      const days = doc_.expiryDate
        ? Math.round((new Date(doc_.expiryDate) - now) / (1000 * 60 * 60 * 24))
        : null;
      const status = !doc_.isValid ? 'Invalid' : days !== null && days < 0 ? 'Expired' : days !== null && days < 30 ? 'Expiring Soon' : 'Valid';
      return [
        dt.replace(/_/g, ' '),
        status,
        doc_.expiryDate ? new Date(doc_.expiryDate).toLocaleDateString('en-GB') : '—',
        days !== null ? `${days} days` : '—',
      ];
    });

    drawTable(doc, [
      { header: 'Document Type', width: 200 },
      { header: 'Status', width: 100 },
      { header: 'Expiry Date', width: 100 },
      { header: 'Days Until Expiry', width: 115 },
    ], docRows, 90);

    drawPageFooter(doc);

    // Page 3: Score Breakdown
    if (q) {
      doc.addPage();
      drawPageHeader(doc, 'Vendor Profile — Evaluation Scores');
      y = 90;

      const scores = [
        ['Document Compliance (20%)', q.documentScore],
        ['Technical Capability (25%)', q.technicalScore],
        ['Financial Strength (20%)', q.financialScore],
        ['Experience (25%)', q.experienceScore],
        ['Responsiveness (10%)', q.responsivenessScore],
      ];

      scores.forEach(([label, val]) => {
        if (val == null) return;
        doc.fillColor(DARK_GRAY).fontSize(9).font('Helvetica').text(label, 40, y);
        const barWidth = (val / 10) * 300;
        doc.rect(40, y + 14, 300, 10).fill([235, 235, 235]);
        doc.rect(40, y + 14, barWidth, 10).fill(GOLD);
        doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold').text(`${val.toFixed(1)} / 10`, 350, y + 14);
        y += 38;
      });

      drawPageFooter(doc);
    }

    doc.end();

    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err) => { console.error(err); resolve(Buffer.alloc(0)); });
  });
};

// ─── Procurement Spend PDF ────────────────────────────────────────────────────
export const generateProcurementSpendPDF = async (data, filters = {}) => {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const stream = new PassThrough();
    doc.pipe(stream);

    const { rows: projectRows, summary } = data;

    // Cover Page
    drawPageHeader(doc, 'Procurement Spend Report');
    doc.fillColor(NAVY).fontSize(14).font('Helvetica-Bold').text('Executive Summary', 40, 90);
    drawRule(doc, 112);

    let y = 125;
    [
      ['Total Purchase Orders', summary.totalPOs],
      ['Total Committed Value (SAR)', summary.totalCommitted?.toFixed(2)],
      ['Average PO Value (SAR)', summary.avgPOValue?.toFixed(2)],
      ['Projects Covered', summary.projectCount],
      ['Date From', filters.dateFrom || 'All time'],
      ['Date To', filters.dateTo || 'All time'],
    ].forEach(([label, val]) => { drawInfoRow(doc, label, val, y); y += 20; });

    drawPageFooter(doc);

    // Project tables
    projectRows.forEach((proj) => {
      doc.addPage();
      drawPageHeader(doc, `Project: ${proj.projectName}`);
      y = 90;
      doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold')
        .text(`${proj.projectName} — ${proj.poCount} Purchase Orders`, 40, y);
      y += 20;
      doc.fillColor(MID_GRAY).fontSize(9).font('Helvetica')
        .text(`Total Committed: SAR ${proj.totalCommitted?.toFixed(2)}`, 40, y);
      y += 20;

      const poRows = proj.pos.slice(0, 30).map((p) => [
        p.poNumber, p.vendor, p.status,
        `${p.totalValue?.toFixed(0)} ${p.currency}`,
        new Date(p.createdAt).toLocaleDateString('en-GB'),
      ]);

      drawTable(doc, [
        { header: 'PO Number', width: 90 },
        { header: 'Vendor', width: 140 },
        { header: 'Status', width: 80 },
        { header: 'Value', width: 90 },
        { header: 'Created', width: 80 },
      ], poRows, y + 10);

      drawPageFooter(doc);
    });

    doc.end();
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', () => resolve(Buffer.alloc(0)));
  });
};

// ─── Weekly Executive Summary PDF ─────────────────────────────────────────────
export const generateWeeklyExecutivePDF = async (summaryData) => {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const stream = new PassThrough();
    doc.pipe(stream);

    drawPageHeader(doc, 'Weekly Executive Summary');

    const {
      weekStart, weekEnd,
      newVendors, posIssued, posTotalValue,
      rfqsOpened, rfqsClosed,
      tasksCompleted, overdueTasks,
      pendingApprovals, documentAlerts,
      topVendors,
    } = summaryData;

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

    doc.fillColor(MID_GRAY).fontSize(10).font('Helvetica')
      .text(`Week: ${fmt(weekStart)} — ${fmt(weekEnd)}`, 40, 90);
    drawRule(doc, 108);

    // KPI Grid (2 columns)
    const kpis = [
      ['New Vendors', newVendors],
      ['POs Issued', posIssued],
      ['Total PO Value (SAR)', posTotalValue?.toFixed(0)],
      ['RFQs Opened', rfqsOpened],
      ['RFQs Awarded', rfqsClosed],
      ['Tasks Completed', tasksCompleted],
      ['Overdue Tasks', overdueTasks],
      ['Pending Approvals', pendingApprovals],
      ['Document Alerts', documentAlerts],
    ];

    let kpiY = 120;
    let kpiCol = 0;
    kpis.forEach(([label, value]) => {
      const x = kpiCol === 0 ? 40 : 300;
      doc.rect(x, kpiY, 240, 44).fill(LIGHT_GRAY);
      doc.fillColor(MID_GRAY).fontSize(8).font('Helvetica').text(label, x + 10, kpiY + 8);
      doc.fillColor(NAVY).fontSize(20).font('Helvetica-Bold').text(String(value ?? 0), x + 10, kpiY + 18);
      kpiCol = kpiCol === 0 ? 1 : 0;
      if (kpiCol === 0) kpiY += 52;
    });

    // Top Vendors
    if (topVendors?.length > 0) {
      kpiY += 70;
      drawRule(doc, kpiY);
      kpiY += 14;
      doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('Top Performing Vendors', 40, kpiY);
      kpiY += 20;

      drawTable(doc, [
        { header: 'Company', width: 220 },
        { header: 'Class', width: 60 },
        { header: 'Score', width: 80 },
      ], topVendors.map((v) => [v.companyLegalName || '—', v.vendorClass || '—', v.qualificationScore?.toFixed(1)]),
      kpiY);
    }

    drawPageFooter(doc);
    doc.end();

    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', () => resolve(Buffer.alloc(0)));
  });
};
