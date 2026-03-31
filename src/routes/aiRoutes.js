import express from 'express';
import prisma from '../config/prismaClient.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import { logAudit } from '../utils/auditLogger.js';
import {
  evaluateVendorWithAI,
  queryAIAssistant,
  generateDashboardInsights,
  matchVendorsForRFQ,
  analyzeSavings,
} from '../services/aiService.js';

const router = express.Router();

// In-memory caches and rate limiter
const insightsCache = { data: null, expiresAt: 0 };
const vendorMatchCache = new Map(); // rfqId -> { data, expiresAt }
const rateLimiter = new Map();      // userId -> { count, resetAt }

const REQUIRED_DOC_TYPES = [
  'COMMERCIAL_REGISTRATION',
  'ZAKAT_CERTIFICATE',
  'VAT_CERTIFICATE',
  'GOSI_CERTIFICATE',
  'BANK_LETTER',
  'INSURANCE_CERTIFICATE',
];

// ─── POST /api/ai/evaluate-vendor/:vendorId ───────────────────────────────────
router.post(
  '/evaluate-vendor/:vendorId',
  authenticateToken,
  authorizeRole([1, 2, 3]),
  async (req, res) => {
    const vendorId = parseInt(req.params.vendorId);
    if (isNaN(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    try {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        include: {
          documents: true,
          projectExperience: true,
          vendorQualifications: { orderBy: { updatedAt: 'desc' }, take: 1 },
          user: { select: { email: true, name: true } },
          categories: { include: { category: true } },
        },
      });

      if (!vendor) {
        return res.status(404).json({ error: 'Vendor not found' });
      }

      const now = new Date();
      const validDocs = vendor.documents.filter(
        (d) => d.isValid && (!d.expiryDate || new Date(d.expiryDate) > now)
      );
      const expiredDocs = vendor.documents.filter(
        (d) => d.expiryDate && new Date(d.expiryDate) <= now
      );
      const totalProjectValue = vendor.projectExperience.reduce(
        (sum, p) => sum + (p.contractValue || 0),
        0
      );
      const previousQual = vendor.vendorQualifications[0];

      const vendorData = {
        companyName: vendor.companyLegalName || vendor.user?.name || 'Unknown',
        vendorType: vendor.vendorType,
        yearsInBusiness: vendor.yearsInBusiness || 0,
        gosiCount: vendor.gosiEmployeeCount || 0,
        categories: vendor.categories.map((vc) => vc.category?.name).filter(Boolean),
        documentsUploaded: validDocs.length,
        totalDocuments: REQUIRED_DOC_TYPES.length,
        expiredDocuments: expiredDocs.length,
        projectCount: vendor.projectExperience.length,
        totalProjectValue,
        avgResponseTime: 24, // default — no direct field on model
        previousScore: previousQual?.totalScore || null,
        rfqCount: 0,   // fetched below
        rfqWon: 0,
      };

      // Get RFQ submission stats
      const rfqStats = await prisma.rFQSubmission.groupBy({
        by: ['vendorId'],
        where: { vendorId },
        _count: { id: true },
      });
      const wonCount = await prisma.rFQSubmission.count({
        where: { vendorId, status: 'AWARDED' },
      });
      vendorData.rfqCount = rfqStats[0]?._count?.id || 0;
      vendorData.rfqWon = wonCount;

      // Call AI
      const aiResult = await evaluateVendorWithAI(vendorData);

      // Upsert VendorQualification
      let qualification;
      if (previousQual) {
        qualification = await prisma.vendorQualification.update({
          where: { id: previousQual.id },
          data: {
            documentScore: aiResult.documentScore,
            technicalScore: aiResult.technicalScore,
            financialScore: aiResult.financialScore,
            experienceScore: aiResult.experienceScore,
            responsivenessScore: aiResult.responsivenessScore,
            totalScore: aiResult.totalScore,
            isAIGenerated: true,
            aiEvaluationNotes: aiResult.evaluationNotes,
            recommendation: aiResult.recommendation,
            updatedAt: new Date(),
          },
        });
      } else {
        qualification = await prisma.vendorQualification.create({
          data: {
            vendorId,
            documentScore: aiResult.documentScore,
            technicalScore: aiResult.technicalScore,
            financialScore: aiResult.financialScore,
            experienceScore: aiResult.experienceScore,
            responsivenessScore: aiResult.responsivenessScore,
            totalScore: aiResult.totalScore,
            isAIGenerated: true,
            aiEvaluationNotes: aiResult.evaluationNotes,
            recommendation: aiResult.recommendation,
            status: 'UNDER_REVIEW',
          },
        });
      }

      // Update vendor scores
      await prisma.vendor.update({
        where: { id: vendorId },
        data: {
          qualificationScore: aiResult.totalScore,
          vendorClass: aiResult.vendorClass,
          lastEvaluatedAt: new Date(),
        },
      });

      await logAudit(req.user.id, 'AI_EVALUATION', 'Vendor', vendorId, {
        totalScore: aiResult.totalScore,
        vendorClass: aiResult.vendorClass,
        recommendation: aiResult.recommendation,
        riskLevel: aiResult.riskLevel,
      });

      res.json({ success: true, evaluation: aiResult, qualification });
    } catch (error) {
      console.error('AI evaluation error:', error);
      res.status(500).json({ error: error.message || 'AI evaluation failed' });
    }
  }
);

// ─── POST /api/ai/assistant ───────────────────────────────────────────────────
router.post('/assistant', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const now = Date.now();

  // Rate limiting: 20 requests per minute per user
  const userRate = rateLimiter.get(userId);
  if (userRate) {
    if (now < userRate.resetAt) {
      if (userRate.count >= 20) {
        return res.status(429).json({
          error: "You've sent too many messages. Please wait a moment.",
        });
      }
      userRate.count += 1;
    } else {
      rateLimiter.set(userId, { count: 1, resetAt: now + 60000 });
    }
  } else {
    rateLimiter.set(userId, { count: 1, resetAt: now + 60000 });
  }

  const { question, context = ['vendors', 'rfqs', 'tasks', 'kpis'] } = req.body;
  if (!question?.trim()) {
    return res.status(400).json({ error: 'Question is required' });
  }

  const language = req.headers['accept-language']?.startsWith('ar') ? 'ar' : 'en';

  try {
    const contextData = {};

    if (context.includes('vendors')) {
      contextData.topVendors = await prisma.vendor.findMany({
        take: 20,
        orderBy: { qualificationScore: 'desc' },
        where: { status: 'APPROVED' },
        select: {
          id: true,
          companyLegalName: true,
          vendorClass: true,
          qualificationScore: true,
          vendorType: true,
          status: true,
          mainCategory: true,
        },
      });
    }

    if (context.includes('rfqs')) {
      contextData.recentRFQs = await prisma.rFQ.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          rfqNumber: true,
          projectName: true,
          status: true,
          title: true,
          createdAt: true,
        },
      });
    }

    if (context.includes('tasks')) {
      contextData.myTasks = await prisma.task.findMany({
        where: { assignedToId: userId },
        take: 20,
        orderBy: { dueDate: 'asc' },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
        },
      });
    }

    if (context.includes('kpis')) {
      const [vendorCount, pendingVendors, openPOs, overdueTasks] = await Promise.all([
        prisma.vendor.count({ where: { status: 'APPROVED' } }),
        prisma.vendor.count({ where: { status: 'UNDER_REVIEW' } }),
        prisma.purchaseOrder.count({ where: { status: { notIn: ['CLOSED', 'CANCELLED'] } } }),
        prisma.task.count({
          where: {
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            dueDate: { lt: new Date() },
          },
        }),
      ]);
      contextData.kpis = { vendorCount, pendingVendors, openPOs, overdueTasks };
    }

    const result = await queryAIAssistant(question, contextData);

    if (!result.success) {
      return res.status(500).json({ error: "I'm having trouble connecting right now. Please try again." });
    }

    res.json({ success: true, answer: result.content, language });
  } catch (error) {
    console.error('AI assistant error:', error);
    res.status(500).json({ error: "I'm having trouble connecting right now. Please try again." });
  }
});

// ─── POST /api/ai/match-vendors/:rfqId ────────────────────────────────────────
router.post(
  '/match-vendors/:rfqId',
  authenticateToken,
  authorizeRole([1, 2, 3]),
  async (req, res) => {
    const rfqId = parseInt(req.params.rfqId);
    if (isNaN(rfqId)) return res.status(400).json({ error: 'Invalid RFQ ID' });

    // Check cache
    const cached = vendorMatchCache.get(rfqId);
    if (cached && Date.now() < cached.expiresAt) {
      return res.json({ success: true, ...cached.data, fromCache: true });
    }

    try {
      const rfq = await prisma.rFQ.findUnique({
        where: { id: rfqId },
        select: {
          id: true,
          projectName: true,
          packageScope: true,
          csiCode: true,
          estimatedUnitPrice: true,
          requiredDate: true,
        },
      });
      if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

      const vendors = await prisma.vendor.findMany({
        where: {
          status: 'APPROVED',
          vendorClass: { in: ['A', 'B'] },
        },
        select: {
          id: true,
          companyLegalName: true,
          vendorClass: true,
          qualificationScore: true,
          mainCategory: true,
        },
      });

      const vendorList = vendors.map((v) => ({
        id: v.id,
        companyName: v.companyLegalName,
        vendorClass: v.vendorClass,
        qualificationScore: v.qualificationScore,
        categories: v.mainCategory || [],
        rfqsWon: 0,
      }));

      const rfqData = {
        projectName: rfq.projectName,
        scope: rfq.packageScope || '',
        categories: rfq.csiCode ? [rfq.csiCode] : [],
        estimatedValue: rfq.estimatedUnitPrice || 0,
        requiredDate: rfq.requiredDate,
      };

      const result = await matchVendorsForRFQ(rfqData, vendorList);

      vendorMatchCache.set(rfqId, {
        data: result,
        expiresAt: Date.now() + 3600000, // 1 hour
      });

      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Vendor match error:', error);
      res.status(500).json({ error: 'Vendor matching failed' });
    }
  }
);

// ─── POST /api/ai/match-vendors-preview ──────────────────────────────────────
router.post(
  '/match-vendors-preview',
  authenticateToken,
  authorizeRole([1, 2, 3]),
  async (req, res) => {
    const { scope, categories, projectName, estimatedValue, requiredDate } = req.body;
    if (!scope && !categories?.length) {
      return res.status(400).json({ error: 'scope or categories required' });
    }

    try {
      const vendors = await prisma.vendor.findMany({
        where: {
          status: 'APPROVED',
          vendorClass: { in: ['A', 'B'] },
        },
        select: {
          id: true,
          companyLegalName: true,
          vendorClass: true,
          qualificationScore: true,
          mainCategory: true,
        },
      });

      const vendorList = vendors.map((v) => ({
        id: v.id,
        companyName: v.companyLegalName,
        vendorClass: v.vendorClass,
        qualificationScore: v.qualificationScore,
        categories: v.mainCategory || [],
        rfqsWon: 0,
      }));

      const rfqData = {
        projectName: projectName || 'New Project',
        scope: scope || '',
        categories: Array.isArray(categories) ? categories : [categories].filter(Boolean),
        estimatedValue: estimatedValue || 0,
        requiredDate: requiredDate || null,
      };

      const result = await matchVendorsForRFQ(rfqData, vendorList);
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Vendor match preview error:', error);
      res.status(500).json({ error: 'Vendor matching failed' });
    }
  }
);

// ─── POST /api/ai/analyze-savings ────────────────────────────────────────────
router.post(
  '/analyze-savings',
  authenticateToken,
  authorizeRole([1, 2]),
  async (req, res) => {
    const { projectName } = req.body;
    if (!projectName?.trim()) {
      return res.status(400).json({ error: 'projectName is required' });
    }

    try {
      const pos = await prisma.purchaseOrder.findMany({
        where: { projectName: { contains: projectName, mode: 'insensitive' } },
        include: { items: true, vendor: { select: { companyLegalName: true, vendorClass: true } } },
        take: 20,
        orderBy: { createdAt: 'desc' },
      });

      const rfqs = await prisma.rFQ.findMany({
        where: { projectName: { contains: projectName, mode: 'insensitive' } },
        include: { submissions: { select: { totalValue: true, currency: true, status: true } } },
        take: 10,
        orderBy: { createdAt: 'desc' },
      });

      const poData = pos.map((po) => ({
        poNumber: po.poNumber,
        totalValue: po.totalValue,
        currency: po.currency,
        status: po.status,
        vendor: po.vendor?.companyLegalName,
        vendorClass: po.vendor?.vendorClass,
        itemCount: po.items.length,
      }));

      const rfqData = rfqs.map((rfq) => ({
        rfqNumber: rfq.rfqNumber,
        submissionCount: rfq.submissions.length,
        lowestBid: Math.min(...rfq.submissions.map((s) => s.totalValue || 0).filter((v) => v > 0)),
        highestBid: Math.max(...rfq.submissions.map((s) => s.totalValue || 0).filter((v) => v > 0)),
      }));

      const result = await analyzeSavings(projectName, poData, rfqData);
      if (!result) {
        return res.status(500).json({ error: 'Savings analysis failed' });
      }

      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Savings analysis error:', error);
      res.status(500).json({ error: 'Savings analysis failed' });
    }
  }
);

// ─── POST /api/ai/dashboard-insights ─────────────────────────────────────────
router.post(
  '/dashboard-insights',
  authenticateToken,
  authorizeRole([1, 2]),
  async (req, res) => {
    // Check 30-min cache
    if (insightsCache.data && Date.now() < insightsCache.expiresAt) {
      return res.json({ success: true, insights: insightsCache.data, fromCache: true });
    }

    try {
      const [
        approvedVendors,
        pendingVendors,
        blacklistedVendors,
        openPOs,
        overdueTasks,
        pendingApprovals,
        recentPOs,
      ] = await Promise.all([
        prisma.vendor.count({ where: { status: 'APPROVED' } }),
        prisma.vendor.count({ where: { status: 'UNDER_REVIEW' } }),
        prisma.vendor.count({ where: { status: 'BLACKLISTED' } }),
        prisma.purchaseOrder.count({ where: { status: { notIn: ['CLOSED', 'CANCELLED'] } } }),
        prisma.task.count({
          where: {
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            dueDate: { lt: new Date() },
          },
        }),
        prisma.vendorQualification.count({ where: { status: 'SUBMITTED' } }),
        prisma.purchaseOrder.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: { totalValue: true, status: true, projectName: true, currency: true },
        }),
      ]);

      const dashboardData = {
        vendors: { approved: approvedVendors, pending: pendingVendors, blacklisted: blacklistedVendors },
        tasks: { overdue: overdueTasks },
        approvals: { pending: pendingApprovals },
        purchaseOrders: { open: openPOs },
        recentPOs: recentPOs.map((po) => ({
          value: po.totalValue,
          status: po.status,
          project: po.projectName,
        })),
      };

      const result = await generateDashboardInsights(dashboardData);

      insightsCache.data = result.insights || [];
      insightsCache.expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes

      res.json({ success: true, insights: insightsCache.data });
    } catch (error) {
      console.error('Dashboard insights error:', error);
      res.status(500).json({ error: 'Failed to generate insights' });
    }
  }
);

export default router;
