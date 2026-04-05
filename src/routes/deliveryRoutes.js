import express from 'express';
import prisma from '../config/prismaClient.js';
import multer from 'multer';
import fs from 'fs';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import { notificationService } from '../services/notificationService.js';
import { logUserAction } from '../services/auditService.js';

const router = express.Router();
const OFFICER_PLUS = [1, 2, 3];
const MANAGER_PLUS = [1, 2];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generateDeliveryNumber() {
  const year = new Date().getFullYear();
  const prefix = `DEL-${year}-`;
  const last = await prisma.delivery.findFirst({
    where: { deliveryNumber: { startsWith: prefix } },
    orderBy: { deliveryNumber: 'desc' },
  });
  const seq = last ? parseInt(last.deliveryNumber.slice(-4)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

function calcDelay(requiredDate, deliveryDate, status) {
  const DONE = ['DELIVERED', 'PARTIALLY_DELIVERED', 'QC_IN_PROGRESS', 'QC_ACCEPTED', 'COMPLETED'];
  const ref = DONE.includes(status) && deliveryDate ? new Date(deliveryDate) : new Date();
  const req = new Date(requiredDate);
  return Math.max(0, Math.ceil((ref - req) / 86400000));
}

function monthRange(monthsAgo) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0, 23, 59, 59);
  return { start, end };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = `uploads/deliveries/${req.params.id}/`;
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Standard includes
const deliveryInclude = {
  vendor: { select: { id: true, companyName: true, companyLegalName: true } },
  purchaseOrder: { select: { id: true, poNumber: true, projectName: true } },
  receivedBy: { select: { id: true, name: true } },
  qcInspectedBy: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

const deliveryDetailInclude = {
  ...deliveryInclude,
  items: true,
  attachments: { include: { uploadedBy: { select: { id: true, name: true } } } },
  activityLog: {
    include: { performedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  },
};

// ─── GET /stats ───────────────────────────────────────────────────────────────

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const TERMINAL = ['DELIVERED', 'PARTIALLY_DELIVERED', 'QC_IN_PROGRESS', 'QC_ACCEPTED', 'COMPLETED'];
    const [
      total, pending, inTransit, delivered, partiallyDelivered,
      qcRejections, overdue, lateDeliveries,
    ] = await Promise.all([
      prisma.delivery.count(),
      prisma.delivery.count({ where: { status: 'PENDING' } }),
      prisma.delivery.count({ where: { status: 'IN_TRANSIT' } }),
      prisma.delivery.count({ where: { status: { in: ['DELIVERED', 'QC_ACCEPTED', 'COMPLETED'] } } }),
      prisma.delivery.count({ where: { status: 'PARTIALLY_DELIVERED' } }),
      prisma.delivery.count({ where: { qcStatus: 'REJECTED' } }),
      prisma.delivery.count({ where: { requiredDate: { lt: now }, status: { notIn: [...TERMINAL, 'CANCELLED'] } } }),
      prisma.delivery.count({ where: { delayDays: { gt: 0 }, status: { in: TERMINAL } } }),
    ]);

    const onTimeDeliveries = delivered - lateDeliveries;
    const onTimeRate = delivered > 0 ? Math.round((onTimeDeliveries / delivered) * 100) : 100;

    res.json({ total, pending, inTransit, delivered, partiallyDelivered, qcRejections, overdue, lateDeliveries, onTimeRate });
  } catch (error) {
    console.error('Delivery stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /dashboard ───────────────────────────────────────────────────────────

router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const TERMINAL = ['DELIVERED', 'PARTIALLY_DELIVERED', 'QC_IN_PROGRESS', 'QC_ACCEPTED', 'COMPLETED'];

    const [total, delivered, lateDeliveries, qcRejections, byStatusRaw, byProjectRaw, vendorDeliveries] =
      await Promise.all([
        prisma.delivery.count(),
        prisma.delivery.count({ where: { status: { in: TERMINAL } } }),
        prisma.delivery.count({ where: { delayDays: { gt: 0 }, status: { in: TERMINAL } } }),
        prisma.delivery.count({ where: { qcStatus: 'REJECTED' } }),
        prisma.delivery.groupBy({ by: ['status'], _count: { id: true } }),
        prisma.delivery.groupBy({ by: ['projectName', 'status'], _count: { id: true } }),
        prisma.delivery.findMany({
          include: { vendor: { select: { id: true, companyName: true, companyLegalName: true } } },
          where: { status: { in: TERMINAL } },
        }),
      ]);

    const onTimeRate = delivered > 0 ? Math.round(((delivered - lateDeliveries) / delivered) * 100) : 100;
    const byStatus = byStatusRaw.map((r) => ({ status: r.status, count: r._count.id }));

    // byProject
    const projectMap = {};
    for (const row of byProjectRaw) {
      if (!projectMap[row.projectName]) projectMap[row.projectName] = { projectName: row.projectName, total: 0, delivered: 0, late: 0 };
      projectMap[row.projectName].total += row._count.id;
      if (TERMINAL.includes(row.status)) projectMap[row.projectName].delivered += row._count.id;
    }
    const byProject = Object.values(projectMap).slice(0, 10);

    // vendorOnTime
    const vendorMap = {};
    for (const d of vendorDeliveries) {
      const name = d.vendor?.companyName || d.vendor?.companyLegalName || `Vendor ${d.vendorId}`;
      if (!vendorMap[name]) vendorMap[name] = { vendorName: name, onTime: 0, late: 0 };
      if (d.delayDays > 0) vendorMap[name].late++;
      else vendorMap[name].onTime++;
    }
    const vendorOnTime = Object.values(vendorMap)
      .map((v) => ({ ...v, onTimeRate: v.onTime + v.late > 0 ? Math.round((v.onTime / (v.onTime + v.late)) * 100) : 100 }))
      .sort((a, b) => b.onTimeRate - a.onTimeRate)
      .slice(0, 10);

    // deliveryTrend — last 6 months
    const deliveryTrend = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const monthsAgo = 5 - i;
        const { start, end } = monthRange(monthsAgo);
        const monthIndex = ((now.getMonth() - monthsAgo) + 12) % 12;
        const [deliveredM, lateM] = await Promise.all([
          prisma.delivery.count({ where: { deliveryDate: { gte: start, lte: end }, status: { in: TERMINAL } } }),
          prisma.delivery.count({ where: { deliveryDate: { gte: start, lte: end }, delayDays: { gt: 0 } } }),
        ]);
        return { month: MONTH_NAMES[monthIndex], delivered: deliveredM, late: lateM };
      })
    );

    // PO delivery status — top 10 active POs
    const activePOs = await prisma.purchaseOrder.findMany({
      where: { status: { in: ['ISSUED', 'PARTIALLY_DELIVERED'] } },
      include: { vendor: { select: { companyName: true, companyLegalName: true } }, items: true, deliveries: { include: { items: true } } },
      take: 10,
    });

    const poDeliveryStatus = activePOs.map((po) => {
      const totalItems = po.items.reduce((s, i) => s + i.quantity, 0);
      const deliveredItems = po.deliveries
        .filter((d) => ['DELIVERED', 'QC_ACCEPTED', 'COMPLETED'].includes(d.status))
        .flatMap((d) => d.items)
        .reduce((s, i) => s + i.quantityDelivered, 0);
      const pct = totalItems > 0 ? Math.round((deliveredItems / totalItems) * 100) : 0;
      return {
        poNumber: po.poNumber,
        vendorName: po.vendor?.companyName || po.vendor?.companyLegalName || '—',
        projectName: po.projectName,
        ordered: totalItems,
        delivered: deliveredItems,
        percentage: pct,
        poId: po.id,
      };
    });

    res.json({ kpis: { total, delivered, lateDeliveries, qcRejections, onTimeRate }, byStatus, byProject, vendorOnTime, deliveryTrend, poDeliveryStatus });
  } catch (error) {
    console.error('Delivery dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /vendor/:vendorId ────────────────────────────────────────────────────

router.get('/vendor/:vendorId', authenticateToken, async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const TERMINAL = ['DELIVERED', 'PARTIALLY_DELIVERED', 'QC_IN_PROGRESS', 'QC_ACCEPTED', 'COMPLETED'];

    const deliveries = await prisma.delivery.findMany({
      where: { vendorId, status: { in: TERMINAL } },
      select: { id: true, delayDays: true, qcStatus: true, status: true },
    });

    const total = deliveries.length;
    if (total === 0) {
      return res.json({ totalDeliveries: 0, onTime: 0, late: 0, qcRejections: 0, onTimeRate: 100, averageDelayDays: 0 });
    }

    const late = deliveries.filter((d) => d.delayDays > 0).length;
    const onTime = total - late;
    const qcRejections = deliveries.filter((d) => d.qcStatus === 'REJECTED').length;
    const onTimeRate = Math.round((onTime / total) * 100);
    const averageDelayDays = Math.round(deliveries.reduce((s, d) => s + d.delayDays, 0) / total);

    res.json({ totalDeliveries: total, onTime, late, qcRejections, onTimeRate, averageDelayDays, qcRejectionRate: Math.round((qcRejections / total) * 100) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, qcStatus, vendorId, poId, projectName, overdue, page = 1, pageSize = 20 } = req.query;
    const now = new Date();
    const roleId = req.user.roleId;
    const userId = req.user.id;

    const where = {};
    if (status) where.status = status;
    if (qcStatus) where.qcStatus = qcStatus;
    if (vendorId) where.vendorId = parseInt(vendorId);
    if (poId) where.poId = parseInt(poId);
    if (projectName) where.projectName = { contains: projectName, mode: 'insensitive' };
    if (overdue === 'true') {
      where.requiredDate = { lt: now };
      where.status = { notIn: ['DELIVERED', 'PARTIALLY_DELIVERED', 'QC_IN_PROGRESS', 'QC_ACCEPTED', 'COMPLETED', 'CANCELLED'] };
    }

    // Vendor role: scope to own vendor's deliveries
    if (roleId === 4) {
      const vendor = await prisma.vendor.findFirst({ where: { userId }, select: { id: true } });
      if (vendor) where.vendorId = vendor.id;
    }

    const [deliveries, total] = await Promise.all([
      prisma.delivery.findMany({
        where,
        include: deliveryInclude,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(pageSize),
        take: parseInt(pageSize),
      }),
      prisma.delivery.count({ where }),
    ]);

    const items = deliveries.map((d) => ({
      ...d,
      delayDays: calcDelay(d.requiredDate, d.deliveryDate, d.status),
    }));

    res.json({ deliveries: items, total, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch (error) {
    console.error('Delivery list error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const delivery = await prisma.delivery.findUnique({ where: { id }, include: deliveryDetailInclude });
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    res.json({ ...delivery, delayDays: calcDelay(delivery.requiredDate, delivery.deliveryDate, delivery.status) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

router.post('/', authenticateToken, authorizeRole(OFFICER_PLUS), async (req, res) => {
  try {
    const { projectName, vendorId, poId, requiredDate, deliveryLocation, notes, items = [], isPartial = false, qcInspectedById } = req.body;

    if (!vendorId || !poId || !requiredDate) {
      return res.status(400).json({ error: 'vendorId, poId, and requiredDate are required' });
    }

    const deliveryNumber = await generateDeliveryNumber();

    const delivery = await prisma.delivery.create({
      data: {
        deliveryNumber,
        projectName: projectName || '',
        vendorId: parseInt(vendorId),
        poId: parseInt(poId),
        requiredDate: new Date(requiredDate),
        deliveryLocation,
        notes,
        isPartial,
        createdById: req.user.id,
        ...(qcInspectedById && { qcInspectedById: parseInt(qcInspectedById) }),
        items: {
          create: items.map((item) => ({
            poItemId: item.poItemId ? parseInt(item.poItemId) : null,
            description: item.description,
            quantityOrdered: parseFloat(item.quantityOrdered),
            quantityDelivered: 0,
            unit: item.unit || 'unit',
          })),
        },
        activityLog: {
          create: {
            action: 'CREATED',
            performedById: req.user.id,
            notes: `Delivery record created`,
          },
        },
      },
      include: deliveryDetailInclude,
    });

    // Notify QC inspector if assigned
    if (qcInspectedById) {
      try {
        await notificationService.createNotification({
          userId: parseInt(qcInspectedById),
          title: `New Delivery Assigned: ${deliveryNumber}`,
          body: `You have been assigned as QC inspector for delivery ${deliveryNumber} (${projectName}).`,
          type: 'INFO',
          priority: 'MEDIUM',
          actionUrl: `/dashboard/manager/deliveries/${delivery.id}`,
          module: 'DELIVERY',
          entityId: delivery.id,
          entityType: 'Delivery',
        });
      } catch { /* non-fatal */ }
    }

    await logUserAction(req, 'DELIVERY_CREATED', 'DELIVERIES', delivery.id, 'Delivery', null, { deliveryNumber });

    res.status(201).json(delivery);
  } catch (error) {
    console.error('Create delivery error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── PATCH /:id/status ────────────────────────────────────────────────────────

router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status: newStatus, qcNotes, rejectionReason, notes, deliveryDate } = req.body;
    const roleId = req.user.roleId;
    const userId = req.user.id;

    const delivery = await prisma.delivery.findUnique({ where: { id }, include: deliveryInclude });
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

    const { status: current, qcStatus: currentQC } = delivery;

    // Role-based transition checks
    const officerPlus = OFFICER_PLUS.includes(roleId);
    const managerPlus = MANAGER_PLUS.includes(roleId);

    const allowed =
      (newStatus === 'IN_TRANSIT'          && current === 'PENDING'                                    && officerPlus) ||
      (newStatus === 'DELIVERED'           && current === 'IN_TRANSIT'                                 && officerPlus) ||
      (newStatus === 'PARTIALLY_DELIVERED' && current === 'IN_TRANSIT'                                 && officerPlus) ||
      (newStatus === 'QC_IN_PROGRESS'      && ['DELIVERED', 'PARTIALLY_DELIVERED'].includes(current)   && officerPlus) ||
      (newStatus === 'QC_ACCEPTED'         && currentQC === 'IN_PROGRESS'                              && officerPlus) ||
      (newStatus === 'QC_REJECTED'         && currentQC === 'IN_PROGRESS'                              && officerPlus) ||
      (newStatus === 'COMPLETED'           && currentQC === 'ACCEPTED'                                 && managerPlus) ||
      (newStatus === 'CANCELLED'           && !['COMPLETED', 'CANCELLED'].includes(current)            && managerPlus);

    if (!allowed) {
      return res.status(403).json({ error: `Transition ${current}→${newStatus} not permitted for your role` });
    }

    if (newStatus === 'QC_REJECTED' && !rejectionReason) {
      return res.status(400).json({ error: 'rejectionReason is required for QC rejection' });
    }

    const updateData = { status: newStatus };

    if (newStatus === 'DELIVERED' || newStatus === 'PARTIALLY_DELIVERED') {
      const actualDate = deliveryDate ? new Date(deliveryDate) : new Date();
      updateData.deliveryDate = actualDate;
      updateData.receivedById = userId;
      updateData.receivedAt = new Date();
      updateData.isPartial = newStatus === 'PARTIALLY_DELIVERED';
      updateData.delayDays = calcDelay(delivery.requiredDate, actualDate, newStatus);
    }

    if (newStatus === 'QC_IN_PROGRESS') {
      updateData.qcStatus = 'IN_PROGRESS';
      updateData.qcInspectedById = userId;
    }

    if (newStatus === 'QC_ACCEPTED') {
      updateData.qcStatus = 'ACCEPTED';
      updateData.qcInspectedAt = new Date();
      if (qcNotes) updateData.qcNotes = qcNotes;
    }

    if (newStatus === 'QC_REJECTED') {
      updateData.qcStatus = 'REJECTED';
      updateData.rejectionReason = rejectionReason;
      if (qcNotes) updateData.qcNotes = qcNotes;
    }

    const updated = await prisma.delivery.update({
      where: { id },
      data: updateData,
      include: deliveryDetailInclude,
    });

    // Activity log
    await prisma.deliveryActivity.create({
      data: {
        deliveryId: id,
        action: newStatus,
        performedById: userId,
        notes: notes || qcNotes || rejectionReason || null,
      },
    });

    // Notifications
    try {
      if (newStatus === 'QC_ACCEPTED') {
        const managers = await prisma.user.findMany({ where: { roleId: 2, isActive: true }, select: { id: true } });
        for (const m of managers) {
          await notificationService.createNotification({
            userId: m.id,
            title: `Delivery QC Accepted: ${delivery.deliveryNumber}`,
            body: `Delivery ${delivery.deliveryNumber} has passed QC inspection.`,
            type: 'INFO', priority: 'MEDIUM',
            actionUrl: `/dashboard/manager/deliveries/${id}`,
            module: 'DELIVERY', entityId: id, entityType: 'Delivery',
          });
        }
      }

      if (newStatus === 'QC_REJECTED') {
        // Notify vendor user
        const vendor = await prisma.vendor.findUnique({ where: { id: delivery.vendorId }, select: { userId: true } });
        if (vendor?.userId) {
          await notificationService.createNotification({
            userId: vendor.userId,
            title: `Delivery Rejected: ${delivery.deliveryNumber}`,
            body: `Your delivery ${delivery.deliveryNumber} has been rejected. Reason: ${rejectionReason}`,
            type: 'WARNING', priority: 'HIGH',
            actionUrl: `/vendor-dashboard/deliveries`,
            module: 'DELIVERY', entityId: id, entityType: 'Delivery',
          });
        }
        // Notify procurement managers
        const managers = await prisma.user.findMany({ where: { roleId: 2, isActive: true }, select: { id: true } });
        for (const m of managers) {
          await notificationService.createNotification({
            userId: m.id,
            title: `Delivery QC Rejected: ${delivery.deliveryNumber}`,
            body: `Delivery ${delivery.deliveryNumber} was rejected. Reason: ${rejectionReason}`,
            type: 'WARNING', priority: 'HIGH',
            actionUrl: `/dashboard/manager/deliveries/${id}`,
            module: 'DELIVERY', entityId: id, entityType: 'Delivery',
          });
        }
      }
    } catch { /* non-fatal */ }

    await logUserAction(req, `DELIVERY_${newStatus}`, 'DELIVERIES', id, 'Delivery', { status: current }, { status: newStatus });

    res.json(updated);
  } catch (error) {
    console.error('Delivery status update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /:id/items/:itemId/qc ───────────────────────────────────────────────

router.post('/:id/items/:itemId/qc', authenticateToken, authorizeRole(OFFICER_PLUS), async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const { qcStatus, qcNotes, quantityAccepted } = req.body;

    const updateData = { qcStatus };
    if (qcNotes) updateData.qcNotes = qcNotes;
    if (quantityAccepted !== undefined) updateData.quantityDelivered = parseFloat(quantityAccepted);

    const updated = await prisma.deliveryItem.update({ where: { id: itemId }, data: updateData });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /:id/attachments ────────────────────────────────────────────────────

router.post('/:id/attachments', authenticateToken, authorizeRole(OFFICER_PLUS), upload.single('file'), async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const attachment = await prisma.deliveryAttachment.create({
      data: {
        deliveryId,
        fileName: req.file.originalname,
        fileUrl: req.file.path.replace(/\\/g, '/'),
        fileType: req.file.mimetype,
        uploadedById: req.user.id,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    res.status(201).json(attachment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
