// backend/src/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import vendorRoutes from "./routes/vendorRoutes.js";
import materialRoutes from "./routes/materialRoutes.js";
import priceEntryRoutes from "./routes/priceEntryRoutes.js";
import rfqRoutes from "./routes/rfqRoutes.js";
import rfqComparisonRoutes from "./routes/rfqComparisonRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import contractRoutes from "./routes/contractRoutes.js";
import ipcRoutes from "./routes/ipcRoutes.js";
import { authenticateToken } from "./middleware/authMiddleware.js";
import adminRoutes from "./routes/adminRoutes.js";
import vendorQualificationRoute from "./routes/vendor/qualification.js";
import adminSubmissionsRouter from './routes/admin/submissions.js';
import adminFilesRouter from './routes/admin/files.js';
import qualificationRoutes from './routes/qualification.routes.js';
import vendorManagementRoute from "./routes/vendor/management.js";
import cron from 'node-cron';
import { startExpiryCheckJob } from "./jobs/expiryCheckJob.js";
import { runTaskEscalationJob } from "./jobs/taskEscalationJob.js";
import { runDailySummaryJob } from "./jobs/dailySummaryJob.js";
import { runDocumentExpiryJob } from "./jobs/documentExpiryJob.js";
import { runWeeklyReportJob } from "./jobs/weeklyReportJob.js";
import categoryRoutes from './routes/categoryRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import submissionRoutes from "./routes/submissionRoutes.js";
import reportRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';
import { schedulerService } from './services/schedulerService.js';
import taskRoutes from './routes/tasks.js';
import healthRoutes from './routes/health.js';
import documentRoutes from './routes/documents.js';
import approvalWorkflowRoutes from './routes/approvalWorkflows.js';
import { initializeDefaultRoles } from './scripts/initializeRoles.js';
import approvalWorkflowService from './services/approvalWorkflowService.js';
import signatureRoutes from './routes/signatureRoutes.js';
import advancedApprovalRoutes from './routes/advancedApprovalRoutes.js';
import analyticsRoutes from './routes/analytics.js';
import budgetRoutes from './routes/budgetRoutes.js';
import informationRequestRoutes from './routes/informationRequestRoutes.js';
import vendorSubmissionsRouter from './routes/vendor/submissions.js';
import brandingAdminRouter, { publicBrandingRouter } from './routes/admin/branding.js';
import managerDashboardRouter from './routes/dashboard/manager.js';
import purchaseOrderRoutes from './routes/purchaseOrderRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import newReportRoutes from './routes/reportRoutes.js';
import {
  generateVendorMasterListReport,
  generateProcurementSpendReport,
  generateVendorPerformanceReport,
  generateRFQAnalyticsReport,
  generateDocumentComplianceReport,
  generateOverdueTasksReport,
  generateWeeklyExecutiveSummary,
} from './services/reportGeneratorService.js';
import { emailService } from './services/emailService.js';
import prisma from './config/prismaClient.js';

dotenv.config();
const app = express();

app.use(cors({
  origin: ["https://main.dwotf13xzdq3t.amplifyapp.com", "https://main.d3bob118rkl74z.amplifyapp.com", "http://localhost:3000"], // your frontend's dev URL
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));


app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/price-entries", priceEntryRoutes);
app.use("/api/rfqs", rfqRoutes);
app.use("/api/rfqs", rfqComparisonRoutes);
app.use("/api/users", userRoutes);
app.use("/api/contracts", contractRoutes);
app.use("/api/ipcs", ipcRoutes);
app.use("/api/vendor/qualification", vendorQualificationRoute);
app.use('/api/admin/files', adminFilesRouter);
app.use('/api/admin/submissions', qualificationRoutes);
app.use("/api/vendor", vendorManagementRoute);
app.use('/api/categories', categoryRoutes);
app.use('/api/audit', auditRoutes);
app.use("/api/submissions", submissionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/approvals', approvalWorkflowRoutes);
app.use('/api/signatures', signatureRoutes);
app.use('/api/advanced-approvals', advancedApprovalRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/information-requests', informationRequestRoutes);
app.use('/api/vendor/submissions', vendorSubmissionsRouter);
app.use('/api/admin/branding', brandingAdminRouter);
app.use('/api/branding', publicBrandingRouter);
app.use('/api/dashboard/manager', authenticateToken, managerDashboardRouter);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/new-reports', newReportRoutes);



app.get("/", (req, res) => {
  res.send("Procurement ERP backend is running 🚀");
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Backend is alive 🚀" });
});


const PORT = process.env.PORT || 8080;

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  try {
    // Initialize default roles and workflows
    console.log('🔄 Initializing default data...');
    
    try {
      await initializeDefaultRoles();
      console.log('✅ Default roles initialized');
    } catch (roleError) {
      console.warn('⚠️ Role initialization had issues, but continuing:', roleError.message);
    }
    
    try {
      await approvalWorkflowService.createDefaultWorkflowTemplates();
      console.log('✅ Default workflow templates initialized');
    } catch (workflowError) {
      console.warn('⚠️ Workflow template initialization had issues, but continuing:', workflowError.message);
    }
    
    console.log('✅ Default data initialization completed');
    
    // Start background jobs after server is running
    startExpiryCheckJob();
    schedulerService.startScheduledJobs();

    // Task escalation: run once on startup, then every 60 minutes
    runTaskEscalationJob();
    setInterval(runTaskEscalationJob, 60 * 60 * 1000);

    // Daily summary: scheduler cron handles timing; also check every 30 min
    setInterval(runDailySummaryJob, 30 * 60 * 1000);

    // Document expiry job: daily at 8 AM (also runs on startup for immediate alerts)
    cron.schedule(process.env.CRON_DOCUMENT_EXPIRY || '0 8 * * *', () => {
      console.log('[Cron] Running document expiry job...');
      runDocumentExpiryJob();
    });

    // Weekly report: every Monday at 8 AM
    cron.schedule(process.env.CRON_WEEKLY_REPORT || '0 8 * * 1', () => {
      console.log('[Cron] Running weekly report job...');
      runWeeklyReportJob();
    });

    // Scheduled reports: every hour, check for due reports
    cron.schedule('0 * * * *', async () => {
      console.log('[Cron] Checking scheduled reports...');
      try {
        const due = await prisma.scheduledReport.findMany({
          where: { isActive: true, nextRunAt: { lte: new Date() } },
        });
        for (const sr of due) {
          try {
            let reportData, subject;
            if (sr.reportType === 'VENDOR_MASTER_LIST') {
              reportData = await generateVendorMasterListReport(sr.filters || {});
              subject = 'KUN ProcureTrack — Vendor Master List Report';
            } else if (sr.reportType === 'PROCUREMENT_SPEND') {
              reportData = await generateProcurementSpendReport(sr.filters || {});
              subject = 'KUN ProcureTrack — Procurement Spend Report';
            } else if (sr.reportType === 'VENDOR_PERFORMANCE') {
              reportData = await generateVendorPerformanceReport(sr.filters || {});
              subject = 'KUN ProcureTrack — Vendor Performance Report';
            } else if (sr.reportType === 'RFQ_ANALYTICS') {
              reportData = await generateRFQAnalyticsReport(sr.filters || {});
              subject = 'KUN ProcureTrack — RFQ Analytics Report';
            } else if (sr.reportType === 'DOCUMENT_COMPLIANCE') {
              reportData = await generateDocumentComplianceReport();
              subject = 'KUN ProcureTrack — Document Compliance Report';
            } else if (sr.reportType === 'OVERDUE_TASKS') {
              reportData = await generateOverdueTasksReport(sr.filters || {});
              subject = 'KUN ProcureTrack — Overdue Tasks Report';
            } else if (sr.reportType === 'WEEKLY_SUMMARY') {
              reportData = await generateWeeklyExecutiveSummary();
              subject = 'KUN ProcureTrack — Weekly Executive Summary';
            } else {
              continue;
            }

            for (const email of sr.recipientEmails) {
              await emailService.sendEmail({
                to: email,
                subject,
                html: `<p style="font-family:sans-serif">Your scheduled <strong>${sr.reportType.replace(/_/g, ' ')}</strong> report is ready.<br>Total records: <strong>${reportData?.summary?.total ?? 'N/A'}</strong></p>`,
              });
            }

            const now = new Date();
            let nextRunAt = new Date(now);
            if (sr.frequency === 'DAILY') {
              nextRunAt.setDate(nextRunAt.getDate() + 1);
              nextRunAt.setHours(8, 0, 0, 0);
            } else if (sr.frequency === 'WEEKLY') {
              const targetDay = sr.dayOfWeek ?? 1;
              nextRunAt.setDate(nextRunAt.getDate() + ((7 - nextRunAt.getDay() + targetDay) % 7 || 7));
              nextRunAt.setHours(8, 0, 0, 0);
            } else if (sr.frequency === 'MONTHLY') {
              const targetDay = sr.dayOfMonth ?? 1;
              nextRunAt = new Date(now.getFullYear(), now.getMonth() + 1, targetDay, 8, 0, 0, 0);
            }

            await prisma.scheduledReport.update({
              where: { id: sr.id },
              data: { lastRunAt: now, nextRunAt },
            });
            console.log(`[Cron] Sent scheduled report ${sr.id} (${sr.reportType}) to ${sr.recipientEmails.join(', ')}`);
          } catch (srErr) {
            console.error(`[Cron] Failed to process scheduled report ${sr.id}:`, srErr.message);
          }
        }
      } catch (cronErr) {
        console.error('[Cron] Scheduled reports check failed:', cronErr.message);
      }
    });

    console.log('✅ Background jobs started');
    
  } catch (error) {
    console.error('❌ Failed during startup initialization:', error.message);
    console.log('🔄 Continuing server startup despite initialization issues...');
  }
});