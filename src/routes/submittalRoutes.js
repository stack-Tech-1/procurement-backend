// backend/src/routes/submittalRoutes.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../config/prismaClient.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import { notificationService } from '../services/notificationService.js';
import { logUserAction } from '../services/auditService.js';
import { cacheForUser, TTL } from '../middleware/cacheMiddleware.js';
import { cache } from '../services/cacheService.js';

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now = () => new Date();

function calcDelayDays(requiredDate, status) {
  if (!requiredDate) return 0;
  const approved = ['APPROVED', 'APPROVED_WITH_COMMENTS', 'CANCELLED'];
  if (approved.includes(status)) return 0;
  const diff = Math.ceil((now() - new Date(requiredDate)) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

async function generateSubmittalNumber() {
  const year = new Date().getFullYear();
  const prefix = `SUB-${year}-`;
  const last = await prisma.materialSubmittal.findFirst({
    where: { submittalNumber: { startsWith: prefix } },
    orderBy: { submittalNumber: 'desc' },
    select: { submittalNumber: true },
  });
  const seq = last ? parseInt(last.submittalNumber.split('-')[2], 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

function nextRevisionLetter(letter) {
  return String.fromCharCode(letter.charCodeAt(0) + 1);
}

const submittalInclude = {
  vendor: { select: { id: true, companyLegalName: true, vendorId: true } },
  contract: { select: { id: true, contractNumber: true } },
  purchaseOrder: { select: { id: true, poNumber: true } },
  submittedBy: { select: { id: true, name: true, email: true } },
  assignedReviewer: { select: { id: true, name: true, email: true } },
  pendingWithPerson: { select: { id: true, name: true } },
  attachments: { include: { uploadedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
  activityLog: { include: { performedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
  parentSubmittal: { select: { id: true, submittalNumber: true, status: true, revisionNumber: true } },
  revisions: { select: { id: true, submittalNumber: true, status: true, revisionNumber: true, createdAt: true } },
};

// ─── Multer setup ─────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = `uploads/submittals/${req.params.id}`;
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.dwg', '.dxf', '.xlsx', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// ─── GET /api/submittals/stats ────────────────────────────────────────────────

router.get('/stats', authenticateToken, authorizeRole([1, 2, 3, 4]), cacheForUser(TTL.MEDIUM), async (req, res) => {
  try {
    const n = now();
    const startOfMonth = new Date(n.getFullYear(), n.getMonth(), 1);

    const [total, submitted, underReview, approved, rejected, resubmitRequired, approvedThisMonth] = await Promise.all([
      prisma.materialSubmittal.count(),
      prisma.materialSubmittal.count({ where: { status: 'SUBMITTED' } }),
      prisma.materialSubmittal.count({ where: { status: 'UNDER_REVIEW' } }),
      prisma.materialSubmittal.count({ where: { status: { in: ['APPROVED', 'APPROVED_WITH_COMMENTS'] } } }),
      prisma.materialSubmittal.count({ where: { status: 'REJECTED' } }),
      prisma.materialSubmittal.count({ where: { status: 'RESUBMIT_REQUIRED' } }),
      prisma.materialSubmittal.count({ where: { status: { in: ['APPROVED', 'APPROVED_WITH_COMMENTS'] }, approvedDate: { gte: startOfMonth } } }),
    ]);

    const overdue = await prisma.materialSubmittal.count({
      where: { requiredDate: { lt: n }, status: { notIn: ['APPROVED', 'APPROVED_WITH_COMMENTS', 'CANCELLED', 'REJECTED'] } },
    });

    res.json({ total, submitted, underReview, approved, rejected, resubmitRequired, overdue, approvedThisMonth });
  } catch (err) {
    console.error('Submittal stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/submittals/dashboard ───────────────────────────────────────────

router.get('/dashboard', authenticateToken, authorizeRole([1, 2, 3, 4]), cacheForUser(TTL.MEDIUM), async (req, res) => {
  try {
    const n = now();

    const [all, byStatusRaw, overdueList] = await Promise.all([
      prisma.materialSubmittal.findMany({
        select: { status: true, projectName: true, vendorId: true, requiredDate: true, approvedDate: true, submittedDate: true },
        include: { vendor: { select: { companyLegalName: true } } },
      }),
      prisma.materialSubmittal.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.materialSubmittal.findMany({
        where: { requiredDate: { lt: n }, status: { notIn: ['APPROVED', 'APPROVED_WITH_COMMENTS', 'CANCELLED', 'REJECTED'] } },
        include: { vendor: { select: { companyLegalName: true } } },
        orderBy: { requiredDate: 'asc' },
        take: 10,
      }),
    ]);

    const byStatus = byStatusRaw.map(s => ({ status: s.status, count: s._count.id }));

    // byProject
    const projectMap = {};
    all.forEach(s => {
      if (!projectMap[s.projectName]) projectMap[s.projectName] = { projectName: s.projectName, count: 0, approved: 0, pending: 0 };
      projectMap[s.projectName].count++;
      if (['APPROVED', 'APPROVED_WITH_COMMENTS'].includes(s.status)) projectMap[s.projectName].approved++;
      else projectMap[s.projectName].pending++;
    });
    const byProject = Object.values(projectMap).sort((a, b) => b.count - a.count).slice(0, 8);

    // byVendor
    const vendorMap = {};
    all.forEach(s => {
      const name = s.vendor?.companyLegalName || `Vendor #${s.vendorId}`;
      if (!vendorMap[name]) vendorMap[name] = { vendorName: name, count: 0, approved: 0, overdue: 0 };
      vendorMap[name].count++;
      if (['APPROVED', 'APPROVED_WITH_COMMENTS'].includes(s.status)) vendorMap[name].approved++;
      if (s.requiredDate && new Date(s.requiredDate) < n && !['APPROVED', 'APPROVED_WITH_COMMENTS', 'CANCELLED', 'REJECTED'].includes(s.status)) vendorMap[name].overdue++;
    });
    const byVendor = Object.values(vendorMap).sort((a, b) => b.count - a.count).slice(0, 8);

    // approvalTrend: last 6 months
    const approvalTrend = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (5 - i));
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const [submitted, approved, approvedWithDates] = await Promise.all([
          prisma.materialSubmittal.count({ where: { submittedDate: { gte: start, lte: end } } }),
          prisma.materialSubmittal.count({ where: { status: { in: ['APPROVED', 'APPROVED_WITH_COMMENTS'] }, approvedDate: { gte: start, lte: end } } }),
          prisma.materialSubmittal.findMany({ where: { status: { in: ['APPROVED', 'APPROVED_WITH_COMMENTS'] }, approvedDate: { gte: start, lte: end } }, select: { submittedDate: true, approvedDate: true } }),
        ]);
        const avgDays = approvedWithDates.length > 0
          ? Math.round(approvedWithDates.reduce((acc, s) => acc + Math.ceil((new Date(s.approvedDate) - new Date(s.submittedDate)) / (1000 * 60 * 60 * 24)), 0) / approvedWithDates.length)
          : 0;
        return { month: monthNames[d.getMonth()], submitted, approved, avgDays };
      })
    );

    const overdueListMapped = overdueList.map(s => ({
      id: s.id, submittalNumber: s.submittalNumber, materialDescription: s.materialDescription,
      vendorName: s.vendor?.companyLegalName, daysOverdue: calcDelayDays(s.requiredDate, s.status), requiredDate: s.requiredDate,
    }));

    const kpis = {
      total: all.length,
      approved: all.filter(s => ['APPROVED', 'APPROVED_WITH_COMMENTS'].includes(s.status)).length,
      underReview: all.filter(s => s.status === 'UNDER_REVIEW').length,
      overdue: overdueList.length,
    };

    res.json({ kpis, byStatus, byProject, byVendor, approvalTrend, overdueList: overdueListMapped });
  } catch (err) {
    console.error('Submittal dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/submittals ──────────────────────────────────────────────────────

router.get('/', authenticateToken, authorizeRole([1, 2, 3, 4]), cacheForUser(TTL.MEDIUM), async (req, res) => {
  try {
    const { status, projectName, vendorId, assignedReviewerId, priority, overdue, page = 1, pageSize = 20, search } = req.query;
    const n = now();
    const where = {};

    if (status) where.status = status;
    if (projectName) where.projectName = { contains: projectName, mode: 'insensitive' };
    if (vendorId) where.vendorId = parseInt(vendorId);
    if (assignedReviewerId) where.assignedReviewerId = parseInt(assignedReviewerId);
    if (priority) where.priority = priority;
    if (overdue === 'true') {
      where.requiredDate = { lt: n };
      where.status = { notIn: ['APPROVED', 'APPROVED_WITH_COMMENTS', 'CANCELLED', 'REJECTED'] };
    }
    if (search) {
      where.OR = [
        { submittalNumber: { contains: search, mode: 'insensitive' } },
        { materialDescription: { contains: search, mode: 'insensitive' } },
        { projectName: { contains: search, mode: 'insensitive' } },
      ];
    }
    // Vendor users only see their own submittals
    if (req.user.roleId === 4) {
      const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id }, select: { id: true } });
      if (vendor) where.vendorId = vendor.id;
    }

    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const [items, total, overdueCount] = await Promise.all([
      prisma.materialSubmittal.findMany({
        where,
        include: {
          vendor: { select: { id: true, companyLegalName: true } },
          submittedBy: { select: { id: true, name: true } },
          assignedReviewer: { select: { id: true, name: true } },
          pendingWithPerson: { select: { id: true, name: true } },
          _count: { select: { revisions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(pageSize),
      }),
      prisma.materialSubmittal.count({ where }),
      prisma.materialSubmittal.count({ where: { requiredDate: { lt: n }, status: { notIn: ['APPROVED', 'APPROVED_WITH_COMMENTS', 'CANCELLED', 'REJECTED'] } } }),
    ]);

    const data = items.map(s => ({
      ...s,
      delayDays: calcDelayDays(s.requiredDate, s.status),
      revisionCount: s._count.revisions,
    }));

    res.json({ data, total, overdueCount });
  } catch (err) {
    console.error('List submittals error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/submittals/:id ──────────────────────────────────────────────────

router.get('/:id', authenticateToken, authorizeRole([1, 2, 3, 4]), cacheForUser(TTL.MEDIUM), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const submittal = await prisma.materialSubmittal.findUnique({ where: { id }, include: submittalInclude });
    if (!submittal) return res.status(404).json({ error: 'Submittal not found' });
    res.json({ ...submittal, delayDays: calcDelayDays(submittal.requiredDate, submittal.status) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/submittals ─────────────────────────────────────────────────────

router.post('/', authenticateToken, authorizeRole([1, 2, 3, 4]), async (req, res) => {
  try {
    const { projectName, vendorId, contractId, poId, materialDescription, csiCode, quantity, unit, requiredDate, priority, assignedReviewerId, notes } = req.body;
    if (!projectName || !vendorId || !materialDescription) return res.status(400).json({ error: 'projectName, vendorId, materialDescription are required' });

    const submittalNumber = await generateSubmittalNumber();
    const submittal = await prisma.materialSubmittal.create({
      data: {
        submittalNumber,
        projectName,
        vendorId: parseInt(vendorId),
        contractId: contractId ? parseInt(contractId) : null,
        poId: poId ? parseInt(poId) : null,
        materialDescription,
        csiCode: csiCode || null,
        quantity: quantity ? parseFloat(quantity) : null,
        unit: unit || null,
        requiredDate: requiredDate ? new Date(requiredDate) : null,
        priority: priority || 'MEDIUM',
        assignedReviewerId: assignedReviewerId ? parseInt(assignedReviewerId) : null,
        submittedById: req.user.id,
        status: 'SUBMITTED',
        activityLog: {
          create: {
            action: 'SUBMITTED',
            performedById: req.user.id,
            notes: notes || 'Submittal created',
          },
        },
      },
      include: submittalInclude,
    });

    // Notify assigned reviewer
    if (assignedReviewerId) {
      await notificationService.createNotification({
        userId: parseInt(assignedReviewerId),
        title: 'New Material Submittal Assigned',
        body: `You have been assigned to review submittal ${submittalNumber} for ${projectName}.`,
        type: 'INFO',
        priority: priority || 'MEDIUM',
        actionUrl: `/dashboard/manager/material-submittals/${submittal.id}`,
        module: 'SUBMITTAL',
        entityId: submittal.id,
        entityType: 'MaterialSubmittal',
      }).catch(() => {});
    }

    await logUserAction(req, 'SUBMITTAL_CREATED', 'SUBMITTAL', submittal.id, 'MaterialSubmittal', null, { submittalNumber }).catch(() => {});
    res.status(201).json(submittal);
  } catch (err) {
    console.error('Create submittal error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/submittals/:id/status ────────────────────────────────────────

router.patch('/:id/status', authenticateToken, authorizeRole([1, 2, 3, 4]), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, rejectionReason, reviewerNotes, pendingWithDept, notes } = req.body;
    const userRole = req.user.roleId;
    const n = now();

    const submittal = await prisma.materialSubmittal.findUnique({ where: { id } });
    if (!submittal) return res.status(404).json({ error: 'Submittal not found' });

    // Role-based transition rules
    const transitions = {
      UNDER_REVIEW: { from: ['SUBMITTED'], roles: [1, 2, 3] },
      APPROVED: { from: ['UNDER_REVIEW'], roles: [1, 2, 3] },
      APPROVED_WITH_COMMENTS: { from: ['APPROVED'], roles: [1, 2, 3] },
      REJECTED: { from: ['UNDER_REVIEW'], roles: [1, 2, 3] },
      RESUBMIT_REQUIRED: { from: ['UNDER_REVIEW'], roles: [1, 2, 3] },
      CANCELLED: { from: ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMIT_REQUIRED', 'REJECTED', 'APPROVED', 'APPROVED_WITH_COMMENTS'], roles: [1, 2] },
    };

    // Resubmission handled separately
    if (status === 'SUBMITTED' && submittal.status === 'RESUBMIT_REQUIRED') {
      const newNumber = await generateSubmittalNumber();
      const newSubmittal = await prisma.materialSubmittal.create({
        data: {
          submittalNumber: newNumber,
          projectName: submittal.projectName,
          vendorId: submittal.vendorId,
          contractId: submittal.contractId,
          poId: submittal.poId,
          materialDescription: submittal.materialDescription,
          csiCode: submittal.csiCode,
          quantity: submittal.quantity,
          unit: submittal.unit,
          requiredDate: submittal.requiredDate,
          priority: submittal.priority,
          assignedReviewerId: submittal.assignedReviewerId,
          submittedById: req.user.id,
          status: 'SUBMITTED',
          revisionNumber: submittal.revisionNumber + 1,
          parentSubmittalId: submittal.parentSubmittalId || submittal.id,
          activityLog: {
            create: { action: 'RESUBMITTED', performedById: req.user.id, notes: notes || `Revision ${submittal.revisionNumber + 1} submitted` },
          },
        },
        include: submittalInclude,
      });
      return res.json({ newSubmittalId: newSubmittal.id, submittal: newSubmittal });
    }

    const rule = transitions[status];
    if (!rule) return res.status(400).json({ error: `Invalid status: ${status}` });
    if (!rule.from.includes(submittal.status)) return res.status(400).json({ error: `Cannot transition from ${submittal.status} to ${status}` });
    if (!rule.roles.includes(userRole)) return res.status(403).json({ error: 'Insufficient permissions for this status transition' });
    if (['REJECTED', 'RESUBMIT_REQUIRED'].includes(status) && !rejectionReason) return res.status(400).json({ error: 'rejectionReason is required' });

    const updateData = {
      status,
      pendingWithDept: pendingWithDept || null,
      pendingWithPersonId: ['APPROVED', 'APPROVED_WITH_COMMENTS', 'REJECTED', 'CANCELLED'].includes(status) ? null : submittal.assignedReviewerId,
    };
    if (status === 'UNDER_REVIEW') updateData.reviewedDate = n;
    if (['APPROVED', 'APPROVED_WITH_COMMENTS'].includes(status)) { updateData.approvedDate = n; updateData.reviewerNotes = reviewerNotes || null; }
    if (['REJECTED', 'RESUBMIT_REQUIRED'].includes(status)) updateData.rejectionReason = rejectionReason;
    if (reviewerNotes) updateData.reviewerNotes = reviewerNotes;

    const updated = await prisma.materialSubmittal.update({
      where: { id },
      data: {
        ...updateData,
        activityLog: {
          create: { action: status, performedById: req.user.id, notes: notes || rejectionReason || reviewerNotes || null },
        },
      },
      include: submittalInclude,
    });

    // Notifications
    const notifyUsers = [submittal.submittedById, submittal.assignedReviewerId].filter(Boolean);
    for (const uid of notifyUsers) {
      if (uid === req.user.id) continue;
      await notificationService.createNotification({
        userId: uid,
        title: `Submittal ${status.replace(/_/g, ' ')}`,
        body: `Submittal ${submittal.submittalNumber} status changed to ${status}.`,
        type: status === 'APPROVED' ? 'SUCCESS' : status === 'REJECTED' ? 'ERROR' : 'INFO',
        priority: 'MEDIUM',
        actionUrl: `/dashboard/manager/material-submittals/${id}`,
        module: 'SUBMITTAL',
        entityId: id,
        entityType: 'MaterialSubmittal',
      }).catch(() => {});
    }

    await logUserAction(req, `SUBMITTAL_${status}`, 'SUBMITTAL', id, 'MaterialSubmittal', { status: submittal.status }, { status }).catch(() => {});
    res.json({ ...updated, delayDays: calcDelayDays(updated.requiredDate, updated.status) });
  } catch (err) {
    console.error('Update submittal status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/submittals/:id/attachments ────────────────────────────────────

router.post('/:id/attachments', authenticateToken, authorizeRole([1, 2, 3, 4]), upload.single('file'), async (req, res) => {
  try {
    const submittalId = parseInt(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const attachment = await prisma.submittalAttachment.create({
      data: {
        submittalId,
        fileName: req.file.originalname,
        fileUrl: `/${req.file.path.replace(/\\/g, '/')}`,
        fileType: path.extname(req.file.originalname).toLowerCase(),
        uploadedById: req.user.id,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    res.status(201).json(attachment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/submittals/:id/attachments/:attachmentId ────────────────────

router.delete('/:id/attachments/:attachmentId', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    await prisma.submittalAttachment.delete({ where: { id: parseInt(req.params.attachmentId) } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;