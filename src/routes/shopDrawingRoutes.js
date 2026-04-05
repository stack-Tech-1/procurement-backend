// backend/src/routes/shopDrawingRoutes.js
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

async function generateDrawingNumber() {
  const year = new Date().getFullYear();
  const prefix = `SD-${year}-`;
  const last = await prisma.shopDrawing.findFirst({
    where: { drawingNumber: { startsWith: prefix } },
    orderBy: { drawingNumber: 'desc' },
    select: { drawingNumber: true },
  });
  const seq = last ? parseInt(last.drawingNumber.split('-')[2], 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

function nextRevisionLetter(letter) {
  if (!letter) return 'A';
  return String.fromCharCode(letter.charCodeAt(0) + 1);
}

const drawingInclude = {
  vendor: { select: { id: true, companyLegalName: true, vendorId: true } },
  contract: { select: { id: true, contractNumber: true } },
  submittedBy: { select: { id: true, name: true, email: true } },
  assignedReviewer: { select: { id: true, name: true, email: true } },
  pendingWithPerson: { select: { id: true, name: true } },
  attachments: { include: { uploadedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
  activityLog: { include: { performedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
  parentDrawing: { select: { id: true, drawingNumber: true, status: true, revisionNumber: true, revisionLetter: true } },
  revisions: { select: { id: true, drawingNumber: true, status: true, revisionNumber: true, revisionLetter: true, createdAt: true } },
};

// ─── Multer setup ─────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = `uploads/drawings/${req.params.id}`;
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

// ─── GET /api/shop-drawings/stats ────────────────────────────────────────────

router.get('/stats', authenticateToken, authorizeRole([1, 2, 3, 4]), cacheForUser(TTL.MEDIUM), async (req, res) => {
  try {
    const n = now();
    const startOfMonth = new Date(n.getFullYear(), n.getMonth(), 1);

    const [total, submitted, underReview, approved, rejected, resubmitRequired, approvedThisMonth] = await Promise.all([
      prisma.shopDrawing.count(),
      prisma.shopDrawing.count({ where: { status: 'SUBMITTED' } }),
      prisma.shopDrawing.count({ where: { status: 'UNDER_REVIEW' } }),
      prisma.shopDrawing.count({ where: { status: { in: ['APPROVED', 'APPROVED_WITH_COMMENTS'] } } }),
      prisma.shopDrawing.count({ where: { status: 'REJECTED' } }),
      prisma.shopDrawing.count({ where: { status: 'RESUBMIT_REQUIRED' } }),
      prisma.shopDrawing.count({ where: { status: { in: ['APPROVED', 'APPROVED_WITH_COMMENTS'] }, approvedDate: { gte: startOfMonth } } }),
    ]);

    const overdue = await prisma.shopDrawing.count({
      where: { requiredDate: { lt: n }, status: { notIn: ['APPROVED', 'APPROVED_WITH_COMMENTS', 'CANCELLED', 'REJECTED'] } },
    });

    res.json({ total, submitted, underReview, approved, rejected, resubmitRequired, overdue, approvedThisMonth });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shop-drawings/dashboard ────────────────────────────────────────

router.get('/dashboard', authenticateToken, authorizeRole([1, 2, 3, 4]), cacheForUser(TTL.MEDIUM), async (req, res) => {
  try {
    const n = now();

    const [all, byStatusRaw, overdueList] = await Promise.all([
      prisma.shopDrawing.findMany({
        select: { status: true, projectName: true, vendorId: true, discipline: true, requiredDate: true, approvedDate: true, submittedDate: true },
        include: { vendor: { select: { companyLegalName: true } } },
      }),
      prisma.shopDrawing.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.shopDrawing.findMany({
        where: { requiredDate: { lt: n }, status: { notIn: ['APPROVED', 'APPROVED_WITH_COMMENTS', 'CANCELLED', 'REJECTED'] } },
        include: { vendor: { select: { companyLegalName: true } } },
        orderBy: { requiredDate: 'asc' },
        take: 10,
      }),
    ]);

    const byStatus = byStatusRaw.map(s => ({ status: s.status, count: s._count.id }));

    // byProject
    const projectMap = {};
    all.forEach(d => {
      if (!projectMap[d.projectName]) projectMap[d.projectName] = { projectName: d.projectName, count: 0, approved: 0, pending: 0 };
      projectMap[d.projectName].count++;
      if (['APPROVED', 'APPROVED_WITH_COMMENTS'].includes(d.status)) projectMap[d.projectName].approved++;
      else projectMap[d.projectName].pending++;
    });
    const byProject = Object.values(projectMap).sort((a, b) => b.count - a.count).slice(0, 8);

    // byDiscipline
    const disciplineMap = {};
    all.forEach(d => {
      const disc = d.discipline || 'OTHER';
      if (!disciplineMap[disc]) disciplineMap[disc] = { discipline: disc, count: 0, approved: 0, pending: 0 };
      disciplineMap[disc].count++;
      if (['APPROVED', 'APPROVED_WITH_COMMENTS'].includes(d.status)) disciplineMap[disc].approved++;
      else disciplineMap[disc].pending++;
    });
    const byDiscipline = Object.values(disciplineMap).sort((a, b) => b.count - a.count);

    // byVendor
    const vendorMap = {};
    all.forEach(d => {
      const name = d.vendor?.companyLegalName || `Vendor #${d.vendorId}`;
      if (!vendorMap[name]) vendorMap[name] = { vendorName: name, count: 0, approved: 0, overdue: 0 };
      vendorMap[name].count++;
      if (['APPROVED', 'APPROVED_WITH_COMMENTS'].includes(d.status)) vendorMap[name].approved++;
      if (d.requiredDate && new Date(d.requiredDate) < n && !['APPROVED', 'APPROVED_WITH_COMMENTS', 'CANCELLED', 'REJECTED'].includes(d.status)) vendorMap[name].overdue++;
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
          prisma.shopDrawing.count({ where: { submittedDate: { gte: start, lte: end } } }),
          prisma.shopDrawing.count({ where: { status: { in: ['APPROVED', 'APPROVED_WITH_COMMENTS'] }, approvedDate: { gte: start, lte: end } } }),
          prisma.shopDrawing.findMany({ where: { status: { in: ['APPROVED', 'APPROVED_WITH_COMMENTS'] }, approvedDate: { gte: start, lte: end } }, select: { submittedDate: true, approvedDate: true } }),
        ]);
        const avgDays = approvedWithDates.length > 0
          ? Math.round(approvedWithDates.reduce((acc, s) => acc + Math.ceil((new Date(s.approvedDate) - new Date(s.submittedDate)) / (1000 * 60 * 60 * 24)), 0) / approvedWithDates.length)
          : 0;
        return { month: monthNames[d.getMonth()], submitted, approved, avgDays };
      })
    );

    const overdueListMapped = overdueList.map(d => ({
      id: d.id, drawingNumber: d.drawingNumber, title: d.title,
      vendorName: d.vendor?.companyLegalName, daysOverdue: calcDelayDays(d.requiredDate, d.status),
      discipline: d.discipline, requiredDate: d.requiredDate,
    }));

    const kpis = {
      total: all.length,
      approved: all.filter(d => ['APPROVED', 'APPROVED_WITH_COMMENTS'].includes(d.status)).length,
      underReview: all.filter(d => d.status === 'UNDER_REVIEW').length,
      overdue: overdueList.length,
    };

    res.json({ kpis, byStatus, byProject, byDiscipline, byVendor, approvalTrend, overdueList: overdueListMapped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shop-drawings ───────────────────────────────────────────────────

router.get('/', authenticateToken, authorizeRole([1, 2, 3, 4]), cacheForUser(TTL.MEDIUM), async (req, res) => {
  try {
    const { status, projectName, vendorId, discipline, assignedReviewerId, priority, overdue, page = 1, pageSize = 20, search } = req.query;
    const n = now();
    const where = {};

    if (status) where.status = status;
    if (projectName) where.projectName = { contains: projectName, mode: 'insensitive' };
    if (vendorId) where.vendorId = parseInt(vendorId);
    if (discipline) where.discipline = discipline;
    if (assignedReviewerId) where.assignedReviewerId = parseInt(assignedReviewerId);
    if (priority) where.priority = priority;
    if (overdue === 'true') {
      where.requiredDate = { lt: n };
      where.status = { notIn: ['APPROVED', 'APPROVED_WITH_COMMENTS', 'CANCELLED', 'REJECTED'] };
    }
    if (search) {
      where.OR = [
        { drawingNumber: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { projectName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (req.user.roleId === 4) {
      const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id }, select: { id: true } });
      if (vendor) where.vendorId = vendor.id;
    }

    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const [items, total, overdueCount] = await Promise.all([
      prisma.shopDrawing.findMany({
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
      prisma.shopDrawing.count({ where }),
      prisma.shopDrawing.count({ where: { requiredDate: { lt: n }, status: { notIn: ['APPROVED', 'APPROVED_WITH_COMMENTS', 'CANCELLED', 'REJECTED'] } } }),
    ]);

    const data = items.map(d => ({
      ...d,
      delayDays: calcDelayDays(d.requiredDate, d.status),
      revisionCount: d._count.revisions,
    }));

    res.json({ data, total, overdueCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shop-drawings/:id ───────────────────────────────────────────────

router.get('/:id', authenticateToken, authorizeRole([1, 2, 3, 4]), cacheForUser(TTL.MEDIUM), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const drawing = await prisma.shopDrawing.findUnique({ where: { id }, include: drawingInclude });
    if (!drawing) return res.status(404).json({ error: 'Drawing not found' });
    res.json({ ...drawing, delayDays: calcDelayDays(drawing.requiredDate, drawing.status) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/shop-drawings ──────────────────────────────────────────────────

router.post('/', authenticateToken, authorizeRole([1, 2, 3, 4]), async (req, res) => {
  try {
    const { projectName, vendorId, contractId, title, discipline, description, requiredDate, priority, assignedReviewerId, notes } = req.body;
    if (!projectName || !vendorId || !title || !discipline) return res.status(400).json({ error: 'projectName, vendorId, title, discipline are required' });

    const drawingNumber = await generateDrawingNumber();
    const drawing = await prisma.shopDrawing.create({
      data: {
        drawingNumber,
        projectName,
        vendorId: parseInt(vendorId),
        contractId: contractId ? parseInt(contractId) : null,
        title,
        discipline,
        description: description || null,
        requiredDate: requiredDate ? new Date(requiredDate) : null,
        priority: priority || 'MEDIUM',
        assignedReviewerId: assignedReviewerId ? parseInt(assignedReviewerId) : null,
        submittedById: req.user.id,
        status: 'SUBMITTED',
        revisionNumber: 1,
        revisionLetter: 'A',
        activityLog: {
          create: { action: 'SUBMITTED', performedById: req.user.id, notes: notes || 'Drawing submitted' },
        },
      },
      include: drawingInclude,
    });

    if (assignedReviewerId) {
      await notificationService.createNotification({
        userId: parseInt(assignedReviewerId),
        title: 'New Shop Drawing Assigned',
        body: `You have been assigned to review drawing ${drawingNumber}: ${title}.`,
        type: 'INFO',
        priority: priority || 'MEDIUM',
        actionUrl: `/dashboard/manager/shop-drawings/${drawing.id}`,
        module: 'SHOP_DRAWING',
        entityId: drawing.id,
        entityType: 'ShopDrawing',
      }).catch(() => {});
    }

    await logUserAction(req, 'DRAWING_CREATED', 'SHOP_DRAWING', drawing.id, 'ShopDrawing', null, { drawingNumber }).catch(() => {});
    res.status(201).json(drawing);
  } catch (err) {
    console.error('Create drawing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/shop-drawings/:id/status ─────────────────────────────────────

router.patch('/:id/status', authenticateToken, authorizeRole([1, 2, 3, 4]), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, rejectionReason, reviewerNotes, pendingWithDept, notes } = req.body;
    const userRole = req.user.roleId;
    const n = now();

    const drawing = await prisma.shopDrawing.findUnique({ where: { id } });
    if (!drawing) return res.status(404).json({ error: 'Drawing not found' });

    const transitions = {
      UNDER_REVIEW: { from: ['SUBMITTED'], roles: [1, 2, 3] },
      APPROVED: { from: ['UNDER_REVIEW'], roles: [1, 2, 3] },
      APPROVED_WITH_COMMENTS: { from: ['APPROVED'], roles: [1, 2, 3] },
      REJECTED: { from: ['UNDER_REVIEW'], roles: [1, 2, 3] },
      RESUBMIT_REQUIRED: { from: ['UNDER_REVIEW'], roles: [1, 2, 3] },
      CANCELLED: { from: ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMIT_REQUIRED', 'REJECTED', 'APPROVED', 'APPROVED_WITH_COMMENTS'], roles: [1, 2] },
    };

    // Resubmission: creates a new drawing record with incremented rev number and letter
    if (status === 'SUBMITTED' && drawing.status === 'RESUBMIT_REQUIRED') {
      const newNumber = await generateDrawingNumber();
      const newLetter = nextRevisionLetter(drawing.revisionLetter || 'A');
      const newDrawing = await prisma.shopDrawing.create({
        data: {
          drawingNumber: newNumber,
          projectName: drawing.projectName,
          vendorId: drawing.vendorId,
          contractId: drawing.contractId,
          title: drawing.title,
          discipline: drawing.discipline,
          description: drawing.description,
          requiredDate: drawing.requiredDate,
          priority: drawing.priority,
          assignedReviewerId: drawing.assignedReviewerId,
          submittedById: req.user.id,
          status: 'SUBMITTED',
          revisionNumber: drawing.revisionNumber + 1,
          revisionLetter: newLetter,
          parentDrawingId: drawing.parentDrawingId || drawing.id,
          activityLog: {
            create: {
              action: 'RESUBMITTED',
              performedById: req.user.id,
              notes: notes || `Rev ${drawing.revisionNumber + 1}/${newLetter} submitted`,
            },
          },
        },
        include: drawingInclude,
      });
      return res.json({ newDrawingId: newDrawing.id, drawing: newDrawing });
    }

    const rule = transitions[status];
    if (!rule) return res.status(400).json({ error: `Invalid status: ${status}` });
    if (!rule.from.includes(drawing.status)) return res.status(400).json({ error: `Cannot transition from ${drawing.status} to ${status}` });
    if (!rule.roles.includes(userRole)) return res.status(403).json({ error: 'Insufficient permissions for this status transition' });
    if (['REJECTED', 'RESUBMIT_REQUIRED'].includes(status) && !rejectionReason) return res.status(400).json({ error: 'rejectionReason is required' });

    const updateData = {
      status,
      pendingWithDept: pendingWithDept || null,
      pendingWithPersonId: ['APPROVED', 'APPROVED_WITH_COMMENTS', 'REJECTED', 'CANCELLED'].includes(status) ? null : drawing.assignedReviewerId,
    };
    if (status === 'UNDER_REVIEW') updateData.reviewedDate = n;
    if (['APPROVED', 'APPROVED_WITH_COMMENTS'].includes(status)) { updateData.approvedDate = n; updateData.reviewerComments = reviewerNotes || null; }
    if (['REJECTED', 'RESUBMIT_REQUIRED'].includes(status)) updateData.rejectionReason = rejectionReason;
    if (reviewerNotes) updateData.reviewerComments = reviewerNotes;

    const updated = await prisma.shopDrawing.update({
      where: { id },
      data: {
        ...updateData,
        activityLog: {
          create: { action: status, performedById: req.user.id, notes: notes || rejectionReason || reviewerNotes || null },
        },
      },
      include: drawingInclude,
    });

    const notifyUsers = [drawing.submittedById, drawing.assignedReviewerId].filter(Boolean);
    for (const uid of notifyUsers) {
      if (uid === req.user.id) continue;
      await notificationService.createNotification({
        userId: uid,
        title: `Drawing ${status.replace(/_/g, ' ')}`,
        body: `Drawing ${drawing.drawingNumber} (${drawing.title}) status changed to ${status}.`,
        type: status === 'APPROVED' ? 'SUCCESS' : status === 'REJECTED' ? 'ERROR' : 'INFO',
        priority: 'MEDIUM',
        actionUrl: `/dashboard/manager/shop-drawings/${id}`,
        module: 'SHOP_DRAWING',
        entityId: id,
        entityType: 'ShopDrawing',
      }).catch(() => {});
    }

    await logUserAction(req, `DRAWING_${status}`, 'SHOP_DRAWING', id, 'ShopDrawing', { status: drawing.status }, { status }).catch(() => {});
    res.json({ ...updated, delayDays: calcDelayDays(updated.requiredDate, updated.status) });
  } catch (err) {
    console.error('Update drawing status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/shop-drawings/:id/attachments ──────────────────────────────────

router.post('/:id/attachments', authenticateToken, authorizeRole([1, 2, 3, 4]), upload.single('file'), async (req, res) => {
  try {
    const drawingId = parseInt(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const attachment = await prisma.drawingAttachment.create({
      data: {
        drawingId,
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

// ─── DELETE /api/shop-drawings/:id/attachments/:attachmentId ─────────────────

router.delete('/:id/attachments/:attachmentId', authenticateToken, authorizeRole([1, 2, 3]), async (req, res) => {
  try {
    await prisma.drawingAttachment.delete({ where: { id: parseInt(req.params.attachmentId) } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;