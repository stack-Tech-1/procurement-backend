import ExcelJS from 'exceljs';

// ─── KUN Branding Constants ───────────────────────────────────────────────────
const NAVY  = '0A1628';
const GOLD  = 'B8960A';
const WHITE = 'FFFFFF';
const LIGHT_GRAY = 'F8F9FA';
const LIGHT_GOLD  = 'FDF8E8';

/**
 * Apply KUN Real Estate branding to a worksheet header row.
 * @param {ExcelJS.Worksheet} ws
 * @param {string[]} headers - column header labels
 * @param {number} dataRowStart - row index where data begins (1-based), used for freeze
 */
const applyKUNBranding = (ws, headers, dataRowStart = 2) => {
  // Column definitions
  ws.columns = headers.map((h) => ({
    header: h,
    width: Math.max(h.length + 4, 14),
    style: { alignment: { wrapText: true, vertical: 'middle' } },
  }));

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: GOLD } },
    };
  });

  // Freeze top row
  ws.views = [{ state: 'frozen', ySplit: 1 }];
};

/**
 * Apply alternating row colors to data rows.
 */
const colorDataRows = (ws, startRow, endRow) => {
  for (let i = startRow; i <= endRow; i++) {
    const row = ws.getRow(i);
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (i % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
      }
      cell.alignment = { vertical: 'middle' };
    });
  }
};

/**
 * Add a subtotal / accent row (gold background).
 */
const addAccentRow = (ws, values) => {
  const row = ws.addRow(values);
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  return row;
};

/**
 * Add a KUN Real Estate title header above the table.
 */
const addReportTitle = (ws, title, subtitle, colCount) => {
  ws.spliceRows(1, 0, [], []);
  // Row 1: Company name
  const titleRow = ws.getRow(1);
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = titleRow.getCell(1);
  titleCell.value = 'KUN Real Estate — ' + title;
  titleCell.font = { bold: true, color: { argb: WHITE }, size: 14 };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleRow.height = 34;

  // Row 2: Subtitle / date
  if (subtitle) {
    ws.spliceRows(2, 0, []);
    const subRow = ws.getRow(2);
    ws.mergeCells(2, 1, 2, colCount);
    const subCell = subRow.getCell(1);
    subCell.value = subtitle;
    subCell.font = { italic: true, color: { argb: GOLD }, size: 10 };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    subRow.height = 20;
  }
};

// ─── Vendor Master List Excel ─────────────────────────────────────────────────
export const generateVendorMasterListExcel = async (data, filters = {}) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KUN Real Estate ProcureTrack';
  wb.created = new Date();

  const { rows, summary } = data;

  // Sheet 1: Summary
  const wsSummary = wb.addWorksheet('Summary');
  wsSummary.columns = [{ width: 30 }, { width: 20 }];
  const summaryHeaders = [
    ['KUN Real Estate — Vendor Master List Summary', ''],
    ['Generated', new Date().toLocaleDateString('en-GB')],
    ['', ''],
    ['Metric', 'Value'],
    ['Total Vendors', summary.total],
    ['Approved', summary.approved],
    ['Under Review', summary.underReview],
    ['Rejected', summary.rejected],
    ['Blacklisted', summary.blacklisted],
    ['', ''],
    ['Class A Vendors', summary.classA],
    ['Class B Vendors', summary.classB],
    ['Class C Vendors', summary.classC],
    ['Class D Vendors', summary.classD],
  ];
  summaryHeaders.forEach((row, idx) => {
    const r = wsSummary.addRow(row);
    if (idx === 0) {
      r.font = { bold: true, size: 14, color: { argb: WHITE } };
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      r.height = 32;
    } else if (idx === 3) {
      r.font = { bold: true, color: { argb: WHITE } };
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    }
  });

  // Sheet 2: Full Vendor List
  const wsVendors = wb.addWorksheet('Vendor List');
  const headers = [
    'Vendor ID', 'Company Name', 'Type', 'Class', 'Status',
    'Score', 'Categories', 'Valid Docs', 'Expired Docs', 'Required Docs',
    'CR Number', 'City', 'Country', 'Years in Business', 'Email', 'Last Evaluation',
  ];
  applyKUNBranding(wsVendors, headers);
  addReportTitle(wsVendors, 'Vendor Master List', `Generated: ${new Date().toLocaleDateString()} | Filters: ${JSON.stringify(filters)}`, headers.length);

  const dataStartRow = wsVendors.rowCount + 1;
  rows.forEach((r) => {
    wsVendors.addRow([
      r.vendorId, r.companyName, r.vendorType, r.vendorClass, r.status,
      r.qualificationScore?.toFixed(1), r.categories,
      r.validDocuments, r.expiredDocuments, r.requiredDocUploaded,
      r.crNumber, r.city, r.country, r.yearsInBusiness, r.email,
      r.lastEvaluation ? new Date(r.lastEvaluation).toLocaleDateString('en-GB') : '—',
    ]);
  });
  colorDataRows(wsVendors, dataStartRow, wsVendors.rowCount);
  addAccentRow(wsVendors, ['TOTAL', rows.length, '', '', '', '', '', '', '', '', '', '', '', '', '', '']);

  // Sheet 3: Document Compliance Matrix
  const wsCompliance = wb.addWorksheet('Doc Compliance');
  const docHeaders = ['Company Name', 'Status', 'CR', 'Zakat', 'VAT', 'GOSI', 'Bank', 'Insurance', 'ISO', 'HSE', 'Technical', 'Compliance %'];
  applyKUNBranding(wsCompliance, docHeaders);
  addReportTitle(wsCompliance, 'Document Compliance Matrix', '', docHeaders.length);

  rows.forEach((r) => {
    const docRow = [
      r.companyName, r.status,
      r.validDocuments > 0 ? '✓' : '✗',
      '—', '—', '—', '—', '—', '—', '—', '—',
      `${Math.round((r.validDocuments / Math.max(r.validDocuments + r.expiredDocuments, 1)) * 100)}%`,
    ];
    wsCompliance.addRow(docRow);
  });

  return wb;
};

// ─── Procurement Spend Excel ──────────────────────────────────────────────────
export const generateProcurementSpendExcel = async (data, filters = {}) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KUN Real Estate ProcureTrack';
  wb.created = new Date();

  const { rows: projectRows, allPOs, monthlySpend, summary } = data;

  // Sheet 1: Project Summary
  const wsProj = wb.addWorksheet('Project Summary');
  const projHeaders = ['Project Name', 'PO Count', 'Total Committed (SAR)', 'Status Breakdown'];
  applyKUNBranding(wsProj, projHeaders);
  addReportTitle(wsProj, 'Procurement Spend — Project Summary', `Generated: ${new Date().toLocaleDateString()}`, projHeaders.length);

  projectRows.forEach((r) => {
    wsProj.addRow([
      r.projectName, r.poCount,
      r.totalCommitted.toFixed(2),
      Object.entries(r.statusCounts).map(([k, v]) => `${k}:${v}`).join(' | '),
    ]);
  });
  const dataEnd = wsProj.rowCount;
  colorDataRows(wsProj, 3, dataEnd);
  addAccentRow(wsProj, ['TOTAL', summary.totalPOs, summary.totalCommitted.toFixed(2), '']);

  // Sheet 2: Detailed PO List
  const wsPOs = wb.addWorksheet('Purchase Orders');
  const poHeaders = ['PO Number', 'Project', 'Vendor', 'Class', 'Status', 'Total Value', 'Currency', 'Item Count', 'Created'];
  applyKUNBranding(wsPOs, poHeaders);
  addReportTitle(wsPOs, 'Purchase Orders Detail', '', poHeaders.length);

  allPOs.forEach((po) => {
    wsPOs.addRow([
      po.poNumber || po.poNumber, po.projectName,
      po.vendor?.companyLegalName || '—', po.vendor?.vendorClass || '—',
      po.status, (po.totalValue || 0).toFixed(2), po.currency || 'SAR',
      po.items?.length || 0,
      new Date(po.createdAt).toLocaleDateString('en-GB'),
    ]);
  });
  colorDataRows(wsPOs, 3, wsPOs.rowCount);

  // Sheet 3: Monthly Trend
  const wsTrend = wb.addWorksheet('Monthly Trend');
  const trendHeaders = ['Month', 'Total Spend (SAR)'];
  applyKUNBranding(wsTrend, trendHeaders);
  addReportTitle(wsTrend, 'Monthly Spend Trend', '', trendHeaders.length);

  Object.entries(monthlySpend)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([month, value]) => {
      wsTrend.addRow([month, value.toFixed(2)]);
    });

  return wb;
};

// ─── Vendor Performance Excel ─────────────────────────────────────────────────
export const generateVendorPerformanceExcel = async (data) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KUN Real Estate ProcureTrack';
  wb.created = new Date();

  const { rows, summary } = data;

  // Sheet 1: Ranked Performance
  const wsRank = wb.addWorksheet('Performance Ranking');
  const rankHeaders = [
    'Rank', 'Company Name', 'Class', 'Overall Score', 'RFQs Participated',
    'RFQs Won', 'Win Rate %', 'Doc Compliance %', 'Last Evaluation',
  ];
  applyKUNBranding(wsRank, rankHeaders);
  addReportTitle(wsRank, 'Vendor Performance Ranking', `Generated: ${new Date().toLocaleDateString()} | Avg Score: ${summary.avgScore?.toFixed(1)}`, rankHeaders.length);

  rows.forEach((r, idx) => {
    const row = wsRank.addRow([
      r.rank, r.companyName, r.vendorClass, r.overallScore?.toFixed(1),
      r.rfqParticipated, r.rfqWon, `${r.winRate}%`, `${r.docCompliance}%`,
      r.lastEvaluation ? new Date(r.lastEvaluation).toLocaleDateString('en-GB') : '—',
    ]);
    // Gold for top performer
    if (idx === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GOLD } };
        cell.font = { bold: true };
      });
    }
  });
  colorDataRows(wsRank, 3, wsRank.rowCount);

  // Sheet 2: Score Breakdown
  const wsScores = wb.addWorksheet('Score Breakdown');
  const scoreHeaders = ['Company Name', 'Class', 'Document (20%)', 'Technical (25%)', 'Financial (20%)', 'Experience (25%)', 'Responsiveness (10%)', 'Total'];
  applyKUNBranding(wsScores, scoreHeaders);
  addReportTitle(wsScores, 'Vendor Score Breakdown', '', scoreHeaders.length);

  rows.forEach((r) => {
    wsScores.addRow([
      r.companyName, r.vendorClass,
      r.documentScore?.toFixed(1), r.technicalScore?.toFixed(1),
      r.financialScore?.toFixed(1), r.experienceScore?.toFixed(1),
      r.responsivenessScore?.toFixed(1), r.overallScore?.toFixed(1),
    ]);
  });
  colorDataRows(wsScores, 3, wsScores.rowCount);

  return wb;
};

// ─── RFQ Analytics Excel ──────────────────────────────────────────────────────
export const generateRFQAnalyticsExcel = async (data) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KUN Real Estate ProcureTrack';
  wb.created = new Date();

  const { rows, summary } = data;

  // Sheet 1: Summary Stats
  const wsSummary = wb.addWorksheet('RFQ Summary');
  wsSummary.columns = [{ width: 30 }, { width: 20 }];
  [
    ['KUN Real Estate — RFQ Analytics', ''],
    ['Total RFQs', summary.total],
    ['Awarded', summary.awarded],
    ['Avg Response Rate', summary.avgResponseRate?.toFixed(1)],
    ['Avg Days to Award', summary.avgDaysToAward?.toFixed(0)],
    ['Total Awarded Value (SAR)', summary.totalAwardedValue?.toFixed(2)],
  ].forEach((r, idx) => {
    const row = wsSummary.addRow(r);
    if (idx === 0) {
      row.font = { bold: true, size: 13, color: { argb: WHITE } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      row.height = 28;
    }
  });

  // Sheet 2: Detailed RFQ List
  const wsDetail = wb.addWorksheet('RFQ Detail');
  const headers = [
    'RFQ Number', 'Title', 'Project', 'Status',
    'Vendors Invited', 'Quotes Received', 'Response Rate',
    'Days to Award', 'Winning Vendor', 'Awarded Value', 'Created',
  ];
  applyKUNBranding(wsDetail, headers);
  addReportTitle(wsDetail, 'RFQ Analytics Detail', `Generated: ${new Date().toLocaleDateString()}`, headers.length);

  rows.forEach((r) => {
    wsDetail.addRow([
      r.rfqNumber, r.title, r.projectName, r.status,
      r.vendorsInvited, r.quotesReceived, r.responseRate,
      r.daysToAward || '—', r.winningVendor,
      r.awardedValue ? r.awardedValue.toFixed(2) : '—',
      new Date(r.createdAt).toLocaleDateString('en-GB'),
    ]);
  });
  colorDataRows(wsDetail, 3, wsDetail.rowCount);

  return wb;
};

// ─── Document Compliance Excel ────────────────────────────────────────────────
export const generateDocumentComplianceExcel = async (data) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KUN Real Estate ProcureTrack';
  wb.created = new Date();

  const { rows, summary, docTypes } = data;

  // Sheet 1: Summary
  const wsSummary = wb.addWorksheet('Compliance Summary');
  wsSummary.columns = [{ width: 30 }, { width: 20 }];
  [
    ['KUN Real Estate — Document Compliance', ''],
    ['Total Vendors', summary.total],
    ['Fully Compliant', summary.fullCount],
    ['Partially Compliant', summary.partialCount],
    ['Non-Compliant', summary.nonCompliantCount],
    ['Average Compliance', `${summary.avgCompliance}%`],
  ].forEach((r, idx) => {
    const row = wsSummary.addRow(r);
    if (idx === 0) {
      row.font = { bold: true, size: 13, color: { argb: WHITE } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      row.height = 28;
    }
  });

  // Sheet 2: Full Document Matrix
  const wsMatrix = wb.addWorksheet('Document Matrix');
  const matrixHeaders = ['Company Name', 'Class', 'Status', 'Compliance %', ...docTypes];
  applyKUNBranding(wsMatrix, matrixHeaders);
  addReportTitle(wsMatrix, 'Document Compliance Matrix', `Generated: ${new Date().toLocaleDateString()}`, matrixHeaders.length);

  rows.forEach((r) => {
    const docCols = docTypes.map((dt) => {
      const doc = r.documents[dt];
      if (!doc) return 'Missing';
      if (!doc.isValid) return 'Invalid';
      if (doc.daysUntilExpiry !== null && doc.daysUntilExpiry < 0) return 'Expired';
      if (doc.daysUntilExpiry !== null && doc.daysUntilExpiry < 30) return `Exp ${doc.daysUntilExpiry}d`;
      return 'Valid';
    });
    wsMatrix.addRow([r.companyName, r.vendorClass, r.status, `${r.compliancePct}%`, ...docCols]);
  });
  colorDataRows(wsMatrix, 3, wsMatrix.rowCount);

  return wb;
};

// ─── Overdue Tasks Excel ──────────────────────────────────────────────────────
export const generateOverdueTasksExcel = async (data) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KUN Real Estate ProcureTrack';
  wb.created = new Date();

  const { rows, byAssignee, summary } = data;

  // Sheet 1: By Assignee
  const wsAssignee = wb.addWorksheet('By Assignee');
  const assigneeHeaders = ['Assignee', 'Task Count', 'Critical (>7 days)', 'Email'];
  applyKUNBranding(wsAssignee, assigneeHeaders);
  addReportTitle(wsAssignee, 'Overdue Tasks by Assignee', `Generated: ${new Date().toLocaleDateString()} | Total: ${summary.total}`, assigneeHeaders.length);

  byAssignee.forEach((a) => {
    wsAssignee.addRow([
      a.assignee, a.tasks.length,
      a.tasks.filter((t) => t.daysOverdue > 7).length,
      a.email,
    ]);
  });
  colorDataRows(wsAssignee, 3, wsAssignee.rowCount);

  // Sheet 2: Full Task List
  const wsTasks = wb.addWorksheet('All Overdue Tasks');
  const taskHeaders = ['Task ID', 'Title', 'Type', 'Priority', 'Project', 'Assignee', 'Days Overdue', 'Due Date', 'Assigned By'];
  applyKUNBranding(wsTasks, taskHeaders);
  addReportTitle(wsTasks, 'All Overdue Tasks', '', taskHeaders.length);

  rows.forEach((r) => {
    const row = wsTasks.addRow([
      r.taskId, r.title, r.type, r.priority, r.project,
      r.assigneeName, r.daysOverdue,
      new Date(r.dueDate).toLocaleDateString('en-GB'),
      r.assignedById,
    ]);
    // Red fill for critical overdue (> 7 days)
    if (r.daysOverdue > 7) {
      row.getCell(7).font = { bold: true, color: { argb: 'CC0000' } };
    }
  });
  colorDataRows(wsTasks, 3, wsTasks.rowCount);

  return wb;
};
