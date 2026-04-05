import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();

const MANAGER_PLUS = [1, 2];

// ─── In-memory cache ────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) return entry.data;
  cache.delete(key);
  return null;
}
function setCached(key, data) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// ─── Score & risk helpers ────────────────────────────────────────────────────
function calcOverallScore({ onTimeDeliveryRate = 0, qcRejectionRate = 0, documentComplianceRate = 0, responseRate = 0, qualificationScore = 0 }) {
  const delivery = onTimeDeliveryRate * 0.25;
  const qc      = ((1 - qcRejectionRate / 100) * 100) * 0.20;
  const docs    = documentComplianceRate * 0.20;
  const rfq     = responseRate * 0.15;
  const qual    = (qualificationScore / 100 * 100) * 0.20;
  return Math.min(100, Math.round((delivery + qc + docs + rfq + qual) * 10) / 10);
}

function getRiskLevel(overallScore, qcRejectionRate = 0) {
  if (overallScore < 50 || qcRejectionRate > 20) return 'HIGH';
  if (overallScore < 70) return 'MEDIUM';
  return 'LOW';
}

// ─── Per-vendor aggregation ──────────────────────────────────────────────────
async function buildVendorPerf(vendor, { projectName } = {}) {
  const vendorId = vendor.id;
  const deliveryWhere = { vendorId, ...(projectName ? { projectName } : {}) };

  const [
    deliveries,
    rfqSubmissions,
    vendorDocs,
    qualifications,
    purchaseOrders,
  ] = await Promise.all([
    prisma.delivery.findMany({ where: deliveryWhere, select: { status: true, qcStatus: true, delayDays: true } }),
    prisma.rFQSubmission.findMany({ where: { vendorId }, include: { rfq: { select: { id: true, projectName: true } } } }),
    prisma.vendorDocument.findMany({ where: { vendorId }, select: { isValid: true, expiryDate: true } }),
    prisma.vendorQualification.findMany({ where: { vendorId }, orderBy: { createdAt: 'asc' }, select: { totalScore: true, createdAt: true } }),
    prisma.purchaseOrder.findMany({ where: { vendorId }, select: { id: true, totalValue: true, projectName: true } }),
  ]);

  // Delivery metrics
  const completedStatuses = ['DELIVERED', 'PARTIALLY_DELIVERED', 'QC_IN_PROGRESS', 'QC_ACCEPTED', 'QC_REJECTED', 'COMPLETED'];
  const totalDeliveries = deliveries.length;
  const completedDeliveries = deliveries.filter(d => completedStatuses.includes(d.status));
  const onTimeDeliveries = completedDeliveries.filter(d => d.delayDays === 0).length;
  const lateDeliveries = completedDeliveries.filter(d => d.delayDays > 0).length;
  const onTimeDeliveryRate = totalDeliveries > 0 ? Math.round((onTimeDeliveries / Math.max(completedDeliveries.length, 1)) * 1000) / 10 : 0;
  const avgDelayArr = completedDeliveries.filter(d => d.delayDays > 0).map(d => d.delayDays);
  const averageDelayDays = avgDelayArr.length > 0 ? Math.round(avgDelayArr.reduce((a, b) => a + b, 0) / avgDelayArr.length * 10) / 10 : 0;
  const qcRejectionCount = deliveries.filter(d => d.qcStatus === 'QC_REJECTED').length;
  const qcRejectionRate = totalDeliveries > 0 ? Math.round((qcRejectionCount / totalDeliveries) * 1000) / 10 : 0;

  // RFQ metrics
  const distinctRFQIds = [...new Set(rfqSubmissions.map(s => s.rfqId))];
  const totalRFQsInvited = distinctRFQIds.length;
  const totalRFQsResponded = rfqSubmissions.filter(s => s.submittedAt != null).length;
  const responseRate = totalRFQsInvited > 0 ? Math.round((totalRFQsResponded / totalRFQsInvited) * 1000) / 10 : 0;
  const awardedSubmissions = rfqSubmissions.filter(s => s.status === 'AWARDED' || s.status === 'SELECTED');
  const totalRFQsAwarded = awardedSubmissions.length;
  const winRate = totalRFQsResponded > 0 ? Math.round((totalRFQsAwarded / totalRFQsResponded) * 1000) / 10 : 0;
  const totalAwardedValue = awardedSubmissions.reduce((sum, s) => sum + (s.totalAmount || s.totalValue || 0), 0);

  // IPC metrics — fetch IPCs linked to this vendor's POs
  const poIds = purchaseOrders.map(p => p.id);
  let totalIPCs = 0, totalInvoicedValue = 0, averageIPCProcessingDays = 0;
  if (poIds.length > 0) {
    const ipcs = await prisma.iPC.findMany({ where: { purchaseOrderId: { in: poIds } }, select: { netPayable: true, currentValue: true, createdAt: true } });
    totalIPCs = ipcs.length;
    totalInvoicedValue = ipcs.reduce((sum, i) => sum + (i.netPayable || i.currentValue || 0), 0);
  }

  // Document compliance
  const now = new Date();
  const totalRequiredDocs = vendorDocs.length;
  const validDocs = vendorDocs.filter(d => d.isValid && (!d.expiryDate || d.expiryDate > now)).length;
  const expiredDocs = vendorDocs.filter(d => d.expiryDate && d.expiryDate <= now).length;
  const missingDocs = 0; // Can't determine missing without a required docs list
  const documentComplianceRate = totalRequiredDocs > 0 ? Math.round((validDocs / totalRequiredDocs) * 1000) / 10 : 100;

  // Qualification history
  const scoreHistory = qualifications.slice(-5).map(q => ({ date: q.createdAt, score: q.totalScore || 0 }));
  const lastQual = qualifications[qualifications.length - 1];
  const prevQual = qualifications.length > 1 ? qualifications[qualifications.length - 2] : null;
  const lastEvaluationDate = lastQual?.createdAt || null;
  const lastEvaluationScore = lastQual?.totalScore || 0;
  const evaluationCount = qualifications.length;

  // Trend
  let performanceTrend = 'STABLE';
  if (prevQual && lastQual) {
    if ((lastQual.totalScore || 0) > (prevQual.totalScore || 0) + 2) performanceTrend = 'IMPROVING';
    else if ((lastQual.totalScore || 0) < (prevQual.totalScore || 0) - 2) performanceTrend = 'DECLINING';
  }

  const qualificationScore = vendor.qualificationScore || lastEvaluationScore || 0;
  const overallScore = calcOverallScore({ onTimeDeliveryRate, qcRejectionRate, documentComplianceRate, responseRate, qualificationScore });
  const riskLevel = getRiskLevel(overallScore, qcRejectionRate);

  return {
    vendorId,
    vendorName: vendor.companyLegalName,
    vendorClass: vendor.vendorClass,
    qualificationScore,
    totalDeliveries,
    onTimeDeliveries,
    lateDeliveries,
    onTimeDeliveryRate,
    averageDelayDays,
    qcRejectionCount,
    qcRejectionRate,
    totalRFQsInvited,
    totalRFQsResponded,
    responseRate,
    totalRFQsAwarded,
    winRate,
    totalAwardedValue,
    totalIPCs,
    totalInvoicedValue,
    averageIPCProcessingDays,
    totalRequiredDocs,
    validDocs,
    expiredDocs,
    missingDocs,
    documentComplianceRate,
    lastEvaluationDate,
    lastEvaluationScore,
    evaluationCount,
    scoreHistory,
    overallScore,
    performanceTrend,
    riskLevel,
  };
}

// ─── GET /api/supplier-performance/summary ───────────────────────────────────
router.get('/summary', authenticateToken, authorizeRole(MANAGER_PLUS), async (req, res) => {
  try {
    const cacheKey = 'summary';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const vendors = await prisma.vendor.findMany({
      where: { status: 'APPROVED' },
      select: { id: true, companyLegalName: true, vendorClass: true, qualificationScore: true, mainCategory: true },
    });

    const perfList = await Promise.all(vendors.map(v => buildVendorPerf(v)));

    const totalVendors = perfList.length;
    const averageOverallScore = totalVendors > 0
      ? Math.round(perfList.reduce((s, v) => s + v.overallScore, 0) / totalVendors * 10) / 10
      : 0;

    const sorted = [...perfList].sort((a, b) => b.overallScore - a.overallScore);
    const topPerformer = sorted[0] ? { vendorId: sorted[0].vendorId, vendorName: sorted[0].vendorName, overallScore: sorted[0].overallScore } : null;
    const lowestPerformer = sorted[sorted.length - 1] ? { vendorId: sorted[sorted.length - 1].vendorId, vendorName: sorted[sorted.length - 1].vendorName, overallScore: sorted[sorted.length - 1].overallScore } : null;

    const improvingCount = perfList.filter(v => v.performanceTrend === 'IMPROVING').length;
    const decliningCount = perfList.filter(v => v.performanceTrend === 'DECLINING').length;
    const highRiskCount  = perfList.filter(v => v.riskLevel === 'HIGH').length;

    const classDistribution = perfList.reduce((acc, v) => {
      const cls = v.vendorClass || 'D';
      acc[cls] = (acc[cls] || 0) + 1;
      return acc;
    }, {});

    // Category leaders
    const catMap = {};
    vendors.forEach(v => {
      const perf = perfList.find(p => p.vendorId === v.id);
      if (!perf) return;
      (v.mainCategory || []).forEach(cat => {
        if (!catMap[cat] || perf.overallScore > catMap[cat].score) {
          catMap[cat] = { category: cat, vendorName: v.companyLegalName, vendorClass: v.vendorClass, onTimeRate: perf.onTimeDeliveryRate, score: perf.overallScore };
        }
      });
    });
    const categoryLeaders = Object.values(catMap).sort((a, b) => b.score - a.score).slice(0, 10);

    const industryBenchmarks = {
      avgOnTimeRate: averageOverallScore > 0 ? Math.round(perfList.reduce((s, v) => s + v.onTimeDeliveryRate, 0) / totalVendors * 10) / 10 : 0,
      avgDocCompliance: averageOverallScore > 0 ? Math.round(perfList.reduce((s, v) => s + v.documentComplianceRate, 0) / totalVendors * 10) / 10 : 0,
      avgResponseRate: averageOverallScore > 0 ? Math.round(perfList.reduce((s, v) => s + v.responseRate, 0) / totalVendors * 10) / 10 : 0,
    };

    const result = { totalVendors, averageOverallScore, topPerformer, lowestPerformer, improvingCount, decliningCount, highRiskCount, classDistribution, categoryLeaders, industryBenchmarks };
    setCached(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('supplier-performance summary:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ─── GET /api/supplier-performance/comparison?vendorIds=1,2,3 ────────────────
router.get('/comparison', authenticateToken, authorizeRole(MANAGER_PLUS), async (req, res) => {
  try {
    const ids = (req.query.vendorIds || '').split(',').map(id => parseInt(id)).filter(Boolean).slice(0, 5);
    if (ids.length === 0) return res.status(400).json({ error: 'vendorIds required (comma-separated, max 5)' });

    const vendors = await prisma.vendor.findMany({
      where: { id: { in: ids } },
      select: { id: true, companyLegalName: true, vendorClass: true, qualificationScore: true, mainCategory: true },
    });
    const result = await Promise.all(vendors.map(v => buildVendorPerf(v)));
    res.json(result);
  } catch (err) {
    console.error('supplier-performance comparison:', err);
    res.status(500).json({ error: 'Failed to fetch comparison' });
  }
});

// ─── GET /api/supplier-performance ───────────────────────────────────────────
router.get('/', authenticateToken, authorizeRole(MANAGER_PLUS), async (req, res) => {
  try {
    const { class: vendorClass, minScore, projectName, category, sortBy = 'overallScore', page = 1, limit = 50 } = req.query;
    const cacheKey = `list:${vendorClass}:${minScore}:${projectName}:${category}:${sortBy}`;
    const cached = getCached(cacheKey);
    if (cached) {
      const start = (parseInt(page) - 1) * parseInt(limit);
      return res.json({ data: cached.slice(start, start + parseInt(limit)), total: cached.length, page: parseInt(page) });
    }

    const whereVendor = { status: 'APPROVED' };
    if (vendorClass) whereVendor.vendorClass = vendorClass;
    if (category) whereVendor.mainCategory = { has: category };

    const vendors = await prisma.vendor.findMany({
      where: whereVendor,
      select: { id: true, companyLegalName: true, vendorClass: true, qualificationScore: true, mainCategory: true },
    });

    let perfList = await Promise.all(vendors.map(v => buildVendorPerf(v, { projectName })));

    if (minScore) perfList = perfList.filter(v => v.overallScore >= parseFloat(minScore));

    const sortFns = {
      overallScore: (a, b) => b.overallScore - a.overallScore,
      deliveryRate: (a, b) => b.onTimeDeliveryRate - a.onTimeDeliveryRate,
      winRate: (a, b) => b.winRate - a.winRate,
      awardedValue: (a, b) => b.totalAwardedValue - a.totalAwardedValue,
    };
    perfList.sort(sortFns[sortBy] || sortFns.overallScore);

    setCached(cacheKey, perfList);
    const start = (parseInt(page) - 1) * parseInt(limit);
    res.json({ data: perfList.slice(start, start + parseInt(limit)), total: perfList.length, page: parseInt(page) });
  } catch (err) {
    console.error('supplier-performance list:', err);
    res.status(500).json({ error: 'Failed to fetch vendor performance list' });
  }
});

// ─── GET /api/supplier-performance/:vendorId ──────────────────────────────────
router.get('/:vendorId', authenticateToken, authorizeRole(MANAGER_PLUS), async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, companyLegalName: true, vendorClass: true, qualificationScore: true, mainCategory: true },
    });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const base = await buildVendorPerf(vendor);

    // Monthly delivery trend (last 12 months)
    const monthlyDeliveryTrend = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const from = new Date(d.getFullYear(), d.getMonth(), 1);
      const to   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const deliveries = await prisma.delivery.findMany({
        where: { vendorId, createdAt: { gte: from, lte: to } },
        select: { delayDays: true, status: true },
      });
      const completed = deliveries.filter(d => ['DELIVERED', 'COMPLETED', 'QC_ACCEPTED'].includes(d.status));
      monthlyDeliveryTrend.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        onTime: completed.filter(d => d.delayDays === 0).length,
        late: completed.filter(d => d.delayDays > 0).length,
        total: deliveries.length,
      });
    }

    // Monthly spend trend (last 12 months via POs)
    const monthlySpendTrend = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const from = new Date(d.getFullYear(), d.getMonth(), 1);
      const to   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const agg = await prisma.purchaseOrder.aggregate({
        where: { vendorId, status: { in: ['ISSUED', 'COMPLETED'] }, createdAt: { gte: from, lte: to } },
        _sum: { totalValue: true },
      });
      monthlySpendTrend.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        amount: agg._sum.totalValue || 0,
      });
    }

    // Projects breakdown
    const posByProject = await prisma.purchaseOrder.groupBy({
      by: ['projectName'],
      where: { vendorId },
      _count: { id: true },
      _sum: { totalValue: true },
    });
    const deliveriesByProject = await prisma.delivery.groupBy({
      by: ['projectName'],
      where: { vendorId },
      _count: { id: true },
    });
    const onTimeByProject = await prisma.delivery.groupBy({
      by: ['projectName'],
      where: { vendorId, delayDays: 0, status: { in: ['DELIVERED', 'COMPLETED', 'QC_ACCEPTED'] } },
      _count: { id: true },
    });
    const projectsInvolved = posByProject.map(p => {
      const delCount = deliveriesByProject.find(d => d.projectName === p.projectName)?._count.id || 0;
      const onTime   = onTimeByProject.find(d => d.projectName === p.projectName)?._count.id || 0;
      return {
        projectName: p.projectName,
        posCount: p._count.id,
        totalValue: p._sum.totalValue || 0,
        deliveries: delCount,
        deliveryRate: delCount > 0 ? Math.round((onTime / delCount) * 1000) / 10 : 0,
      };
    }).sort((a, b) => b.totalValue - a.totalValue);

    // Recent activity
    const [recentDeliveries, recentRFQs, recentPOs] = await Promise.all([
      prisma.delivery.findMany({ where: { vendorId }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, deliveryNumber: true, status: true, deliveryDate: true, delayDays: true } }),
      prisma.rFQSubmission.findMany({ where: { vendorId }, orderBy: { submittedAt: 'desc' }, take: 5, include: { rfq: { select: { rfqNumber: true, projectName: true, status: true } } } }),
      prisma.iPC.findMany({ where: { purchaseOrder: { vendorId } }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, ipcNumber: true, netPayable: true, currentValue: true, status: true } }),
    ]);

    const recentIPCs = recentPOs.map(i => ({ id: i.id, ipcNumber: i.ipcNumber, amount: i.netPayable || i.currentValue, status: i.status }));

    // Class averages
    const sameClass = await prisma.vendor.findMany({
      where: { status: 'APPROVED', vendorClass: vendor.vendorClass, id: { not: vendorId } },
      select: { id: true, companyLegalName: true, vendorClass: true, qualificationScore: true },
    });
    let classAverages = { averageScore: 0, averageOnTimeRate: 0, averageDocCompliance: 0, averageResponseRate: 0, averageWinRate: 0 };
    if (sameClass.length > 0) {
      const classPerfs = await Promise.all(sameClass.slice(0, 20).map(v => buildVendorPerf(v)));
      classAverages = {
        averageScore:        Math.round(classPerfs.reduce((s, v) => s + v.overallScore, 0) / classPerfs.length * 10) / 10,
        averageOnTimeRate:   Math.round(classPerfs.reduce((s, v) => s + v.onTimeDeliveryRate, 0) / classPerfs.length * 10) / 10,
        averageDocCompliance:Math.round(classPerfs.reduce((s, v) => s + v.documentComplianceRate, 0) / classPerfs.length * 10) / 10,
        averageResponseRate: Math.round(classPerfs.reduce((s, v) => s + v.responseRate, 0) / classPerfs.length * 10) / 10,
        averageWinRate:      Math.round(classPerfs.reduce((s, v) => s + v.winRate, 0) / classPerfs.length * 10) / 10,
      };
    }

    res.json({ ...base, monthlyDeliveryTrend, monthlySpendTrend, projectsInvolved, recentDeliveries, recentRFQs, recentIPCs, classAverages });
  } catch (err) {
    console.error('supplier-performance detail:', err);
    res.status(500).json({ error: 'Failed to fetch vendor performance detail' });
  }
});

export default router;
