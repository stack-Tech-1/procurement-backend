import express from 'express';
import prisma from '../config/prismaClient.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import { emailService } from '../services/emailService.js';
import { weeklyManagerSummaryTemplate } from '../services/emailTemplates.js';
import {
  generateVendorMasterListReport,
  generateProcurementSpendReport,
  generateVendorPerformanceReport,
  generateRFQAnalyticsReport,
  generateDocumentComplianceReport,
  generateOverdueTasksReport,
  generateWeeklyExecutiveSummary,
} from '../services/reportGeneratorService.js';
import {
  generateVendorMasterListExcel,
  generateProcurementSpendExcel,
  generateVendorPerformanceExcel,
  generateRFQAnalyticsExcel,
  generateDocumentComplianceExcel,
  generateOverdueTasksExcel,
} from '../services/excelExportService.js';
import {
  generateVendorProfilePDF,
  generateProcurementSpendPDF,
  generateWeeklyExecutivePDF,
} from '../services/pdfExportService.js';

const router = express.Router();

const dateStr = () => new Date().toISOString().slice(0, 10);

// Helper: stream Excel workbook to response
const streamExcel = async (res, wb, filename) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-cache');
  await wb.xlsx.write(res);
  res.end();
};

// Helper: stream PDF buffer to response
const streamPDF = (res, buffer, filename) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-cache');
  res.end(buffer);
};

// ─── Vendor Master List ───────────────────────────────────────────────────────
router.get('/vendor-master-list', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    const data = await generateVendorMasterListReport(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Vendor master list error:', err);
    res.status(500).json({ error: 'Failed to generate vendor master list' });
  }
});

router.get('/vendor-master-list/export/excel', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    const data = await generateVendorMasterListReport(req.query);
    const wb = await generateVendorMasterListExcel(data, req.query);
    await streamExcel(res, wb, `vendor-master-list-${dateStr()}.xlsx`);
  } catch (err) {
    console.error('Vendor master list Excel error:', err);
    res.status(500).json({ error: 'Failed to export vendor master list' });
  }
});

router.get('/vendor-master-list/export/pdf', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    const data = await generateVendorMasterListReport(req.query);
    // For list PDF, use spend PDF as a placeholder (generic summary)
    const buf = await generateProcurementSpendPDF(
      { rows: [], summary: data.summary, allPOs: [], monthlySpend: {} },
      req.query
    );
    streamPDF(res, buf, `vendor-master-list-${dateStr()}.pdf`);
  } catch (err) {
    console.error('Vendor master list PDF error:', err);
    res.status(500).json({ error: 'Failed to export PDF' });
  }
});

// ─── Procurement Spend ────────────────────────────────────────────────────────
router.get('/procurement-spend', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    const data = await generateProcurementSpendReport(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Procurement spend error:', err);
    res.status(500).json({ error: 'Failed to generate procurement spend report' });
  }
});

router.get('/procurement-spend/export/excel', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    const data = await generateProcurementSpendReport(req.query);
    const wb = await generateProcurementSpendExcel(data, req.query);
    await streamExcel(res, wb, `procurement-spend-${dateStr()}.xlsx`);
  } catch (err) {
    console.error('Procurement spend Excel error:', err);
    res.status(500).json({ error: 'Failed to export procurement spend' });
  }
});

router.get('/procurement-spend/export/pdf', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    const data = await generateProcurementSpendReport(req.query);
    const buf = await generateProcurementSpendPDF(data, req.query);
    streamPDF(res, buf, `procurement-spend-${dateStr()}.pdf`);
  } catch (err) {
    console.error('Procurement spend PDF error:', err);
    res.status(500).json({ error: 'Failed to export PDF' });
  }
});

// ─── Vendor Performance ───────────────────────────────────────────────────────
router.get('/vendor-performance', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    const data = await generateVendorPerformanceReport(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Vendor performance error:', err);
    res.status(500).json({ error: 'Failed to generate vendor performance report' });
  }
});

router.get('/vendor-performance/export/excel', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    const data = await generateVendorPerformanceReport(req.query);
    const wb = await generateVendorPerformanceExcel(data);
    await streamExcel(res, wb, `vendor-performance-${dateStr()}.xlsx`);
  } catch (err) {
    console.error('Vendor performance Excel error:', err);
    res.status(500).json({ error: 'Failed to export vendor performance' });
  }
});

// ─── RFQ Analytics ────────────────────────────────────────────────────────────
router.get('/rfq-analytics', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    const data = await generateRFQAnalyticsReport(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('RFQ analytics error:', err);
    res.status(500).json({ error: 'Failed to generate RFQ analytics report' });
  }
});

router.get('/rfq-analytics/export/excel', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    const data = await generateRFQAnalyticsReport(req.query);
    const wb = await generateRFQAnalyticsExcel(data);
    await streamExcel(res, wb, `rfq-analytics-${dateStr()}.xlsx`);
  } catch (err) {
    console.error('RFQ analytics Excel error:', err);
    res.status(500).json({ error: 'Failed to export RFQ analytics' });
  }
});

// ─── Document Compliance ──────────────────────────────────────────────────────
router.get('/document-compliance', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    const data = await generateDocumentComplianceReport();
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Document compliance error:', err);
    res.status(500).json({ error: 'Failed to generate document compliance report' });
  }
});

router.get('/document-compliance/export/excel', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    const data = await generateDocumentComplianceReport();
    const wb = await generateDocumentComplianceExcel(data);
    await streamExcel(res, wb, `document-compliance-${dateStr()}.xlsx`);
  } catch (err) {
    console.error('Document compliance Excel error:', err);
    res.status(500).json({ error: 'Failed to export document compliance' });
  }
});

// ─── Overdue Tasks ────────────────────────────────────────────────────────────
router.get('/overdue-tasks', authenticateToken, authorizeRole([1, 2]), async (req, res) => {
  try {
    const data = await generateOverdueTasksReport(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Overdue tasks error:', err);
    res.status(500).json({ error: 'Failed to generate overdue tasks report' });
  }
});

router.get('/overdue-tasks/export/excel', authenticateToken, authorizeRole([1, 2]), async (req, res) => {
  try {
    const data = await generateOverdueTasksReport(req.query);
    const wb = await generateOverdueTasksExcel(data);
    await streamExcel(res, wb, `overdue-tasks-${dateStr()}.xlsx`);
  } catch (err) {
    console.error('Overdue tasks Excel error:', err);
    res.status(500).json({ error: 'Failed to export overdue tasks' });
  }
});

// ─── Weekly Summary ───────────────────────────────────────────────────────────
router.get('/weekly-summary', authenticateToken, authorizeRole([1, 2]), async (req, res) => {
  try {
    const data = await generateWeeklyExecutiveSummary(req.query.weekStart);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Weekly summary error:', err);
    res.status(500).json({ error: 'Failed to generate weekly summary' });
  }
});

router.get('/weekly-summary/export/pdf', authenticateToken, authorizeRole([1, 2]), async (req, res) => {
  try {
    const data = await generateWeeklyExecutiveSummary(req.query.weekStart);
    const buf = await generateWeeklyExecutivePDF(data);
    streamPDF(res, buf, `weekly-summary-${dateStr()}.pdf`);
  } catch (err) {
    console.error('Weekly summary PDF error:', err);
    res.status(500).json({ error: 'Failed to export weekly summary PDF' });
  }
});

router.get('/weekly-summary/preview-html', authenticateToken, authorizeRole([1, 2]), async (req, res) => {
  try {
    const data = await generateWeeklyExecutiveSummary(req.query.weekStart);
    const html = weeklyManagerSummaryTemplate({
      managerName: req.user?.name || 'Manager',
      pendingApprovals: data.pendingApprovals,
      overdueTasks: data.overdueTasks,
      expiringDocuments: data.documentAlerts,
      newVendors: data.newVendors,
      weeklyStats: { tasksCompleted: data.tasksCompleted, poIssued: data.posIssued },
    });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).send('<p>Failed to render preview</p>');
  }
});

router.post('/weekly-summary/send-test', authenticateToken, authorizeRole([1, 2]), async (req, res) => {
  try {
    const data = await generateWeeklyExecutiveSummary();
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, name: true } });
    const html = weeklyManagerSummaryTemplate({
      managerName: user?.name || 'Manager',
      pendingApprovals: data.pendingApprovals,
      overdueTasks: data.overdueTasks,
      expiringDocuments: data.documentAlerts,
      newVendors: data.newVendors,
      weeklyStats: { tasksCompleted: data.tasksCompleted, poIssued: data.posIssued },
    });
    await emailService.sendEmail({
      to: user.email,
      subject: 'KUN ProcureTrack — Weekly Summary (Test)',
      html,
    });
    res.json({ success: true, message: `Test email sent to ${user.email}` });
  } catch (err) {
    console.error('Send test email error:', err);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// ─── Vendor Profile PDF ───────────────────────────────────────────────────────
router.get('/vendor-profile/:vendorId/pdf', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  const vendorId = parseInt(req.params.vendorId);
  if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendor ID' });
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      include: {
        documents: true,
        projectExperience: true,
        vendorQualifications: { orderBy: { updatedAt: 'desc' }, take: 1 },
        user: { select: { name: true, email: true } },
        categories: { include: { category: { select: { name: true } } } },
      },
    });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    const buf = await generateVendorProfilePDF(vendor);
    streamPDF(res, buf, `vendor-profile-${vendorId}-${dateStr()}.pdf`);
  } catch (err) {
    console.error('Vendor profile PDF error:', err);
    res.status(500).json({ error: 'Failed to generate vendor PDF' });
  }
});

// ─── Scheduled Reports ────────────────────────────────────────────────────────
router.post('/schedule', authenticateToken, authorizeRole([1, 2]), async (req, res) => {
  const { reportType, frequency, dayOfWeek, dayOfMonth, recipientEmails, filters } = req.body;
  if (!reportType || !frequency || !recipientEmails?.length) {
    return res.status(400).json({ error: 'reportType, frequency, and recipientEmails are required' });
  }

  // Calculate nextRunAt
  const now = new Date();
  let nextRunAt = new Date(now);
  if (frequency === 'DAILY') {
    nextRunAt.setDate(nextRunAt.getDate() + 1);
    nextRunAt.setHours(8, 0, 0, 0);
  } else if (frequency === 'WEEKLY') {
    const targetDay = dayOfWeek ?? 1; // Monday default
    nextRunAt.setDate(nextRunAt.getDate() + ((7 - nextRunAt.getDay() + targetDay) % 7 || 7));
    nextRunAt.setHours(8, 0, 0, 0);
  } else if (frequency === 'MONTHLY') {
    const targetDay = dayOfMonth ?? 1;
    nextRunAt = new Date(now.getFullYear(), now.getMonth() + 1, targetDay, 8, 0, 0, 0);
  }

  try {
    const scheduled = await prisma.scheduledReport.create({
      data: {
        reportType,
        frequency,
        dayOfWeek: dayOfWeek ?? null,
        dayOfMonth: dayOfMonth ?? null,
        recipientEmails: Array.isArray(recipientEmails) ? recipientEmails : [recipientEmails],
        filters: filters || {},
        nextRunAt,
        createdById: req.user.id,
      },
    });
    res.json({ success: true, scheduled });
  } catch (err) {
    console.error('Schedule report error:', err);
    res.status(500).json({ error: 'Failed to schedule report' });
  }
});

router.get('/scheduled', authenticateToken, authorizeRole([1, 2]), async (req, res) => {
  try {
    const scheduled = await prisma.scheduledReport.findMany({
      where: { isActive: true },
      include: { createdBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, scheduled });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scheduled reports' });
  }
});

router.delete('/scheduled/:id', authenticateToken, authorizeRole([1, 2]), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    await prisma.scheduledReport.update({ where: { id }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete scheduled report' });
  }
});

export default router;
