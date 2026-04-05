// backend/src/controllers/purchaseOrderController.js
import prisma from '../config/prismaClient.js';
import { logAudit } from '../utils/auditLogger.js';
import { logUserAction } from '../services/auditService.js';
import { emailService } from '../services/emailService.js';
import { notificationService } from '../services/notificationService.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const ROLE = { EXECUTIVE: 1, MANAGER: 2, OFFICER: 3 };

/** Generate next PO number: PO-YYYY-XXXX */
async function generatePONumber() {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const last = await prisma.purchaseOrder.findFirst({
    where: { poNumber: { startsWith: prefix } },
    orderBy: { poNumber: 'desc' },
    select: { poNumber: true },
  });
  let seq = 1;
  if (last) {
    const parts = last.poNumber.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/** Calculate total value from items array */
function calcTotal(items) {
  return items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    return sum + qty * price;
  }, 0);
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/purchase-orders
 */
export const getPurchaseOrders = async (req, res) => {
  try {
    const { status, vendorId, projectName, search, page = 1, pageSize = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const where = {};
    if (status) where.status = status;
    if (vendorId) where.vendorId = parseInt(vendorId);
    if (projectName) where.projectName = { contains: projectName, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { poNumber: { contains: search, mode: 'insensitive' } },
        { vendor: { companyLegalName: { contains: search, mode: 'insensitive' } } },
        { projectName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          vendor: { select: { id: true, companyLegalName: true, vendorClass: true, contactEmail: true } },
          rfq: { select: { id: true, rfqNumber: true, projectName: true } },
          issuedBy: { select: { id: true, name: true, email: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    res.json({ data, total, page: parseInt(page), pageSize: take });
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
};

/**
 * GET /api/purchase-orders/stats/summary
 */
export const getPOStats = async (_req, res) => {
  try {
    const [counts, committedAgg, issuedAgg] = await Promise.all([
      prisma.purchaseOrder.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      prisma.purchaseOrder.aggregate({
        where: { status: { not: 'CANCELLED' } },
        _sum: { totalValue: true },
      }),
      prisma.purchaseOrder.aggregate({
        where: { status: 'ISSUED' },
        _sum: { totalValue: true },
      }),
    ]);

    const byStatus = {};
    counts.forEach(({ status, _count }) => { byStatus[status] = _count.id; });

    const totalPOs = Object.values(byStatus).reduce((a, b) => a + b, 0);

    res.json({
      totalPOs,
      draftCount: byStatus['DRAFT'] || 0,
      pendingCount: byStatus['PENDING_APPROVAL'] || 0,
      approvedCount: byStatus['APPROVED'] || 0,
      issuedCount: byStatus['ISSUED'] || 0,
      partiallyDeliveredCount: byStatus['PARTIALLY_DELIVERED'] || 0,
      deliveredCount: byStatus['DELIVERED'] || 0,
      closedCount: byStatus['CLOSED'] || 0,
      cancelledCount: byStatus['CANCELLED'] || 0,
      totalCommittedValue: committedAgg._sum.totalValue || 0,
      totalIssuedValue: issuedAgg._sum.totalValue || 0,
    });
  } catch (error) {
    console.error('Error fetching PO stats:', error);
    res.status(500).json({ error: 'Failed to fetch PO stats' });
  }
};

/**
 * GET /api/purchase-orders/:id
 */
export const getPurchaseOrderById = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        vendor: true,
        rfq: { select: { id: true, rfqNumber: true, projectName: true, status: true } },
        issuedBy: { select: { id: true, name: true, email: true, department: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        pendingWithPerson: { select: { id: true, name: true, email: true } },
        items: true,
        ipcs: {
          select: {
            id: true,
            ipcNumber: true,
            status: true,
            currentValue: true,
            netPayable: true,
            createdAt: true,
          },
        },
      },
    });

    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    res.json(po);
  } catch (error) {
    console.error('Error fetching PO by id:', error);
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
};

/**
 * POST /api/purchase-orders
 */
export const createPurchaseOrder = async (req, res) => {
  try {
    const {
      projectName,
      vendorId,
      rfqId,
      purchaseRequestId,
      currency = 'SAR',
      deliveryLocation,
      requiredDate,
      paymentTerms,
      warrantyPeriod,
      notes,
      items = [],
    } = req.body;

    if (!projectName) return res.status(400).json({ error: 'projectName is required' });
    if (!vendorId) return res.status(400).json({ error: 'vendorId is required' });
    if (!items.length) return res.status(400).json({ error: 'At least one item is required' });

    const vendor = await prisma.vendor.findUnique({ where: { id: parseInt(vendorId) } });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const totalValue = calcTotal(items);
    const poNumber = await generatePONumber();

    const po = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          poNumber,
          projectName,
          vendorId: parseInt(vendorId),
          rfqId: rfqId ? parseInt(rfqId) : null,
          purchaseRequestId: purchaseRequestId ? parseInt(purchaseRequestId) : null,
          totalValue,
          currency,
          deliveryLocation,
          requiredDate: requiredDate ? new Date(requiredDate) : null,
          paymentTerms,
          warrantyPeriod,
          notes,
          status: 'DRAFT',
          issuedById: req.user.id,
          items: {
            create: items.map((item) => ({
              description: item.description,
              csiCode: item.csiCode || null,
              quantity: parseFloat(item.quantity),
              unit: item.unit,
              unitPrice: parseFloat(item.unitPrice),
              totalPrice: parseFloat(item.quantity) * parseFloat(item.unitPrice),
              costCode: item.costCode || null,
              notes: item.notes || null,
            })),
          },
        },
        include: { items: true, vendor: { select: { companyLegalName: true } } },
      });
      return created;
    });

    await logAudit(req.user.id, 'PO_CREATED', 'PurchaseOrder', po.id, { poNumber, totalValue });
    await logUserAction(req, 'PO_CREATED', 'PURCHASE_ORDERS', po.id, 'PurchaseOrder', null, { poNumber, totalValue, projectName });

    res.status(201).json(po);
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(500).json({ error: 'Failed to create purchase order' });
  }
};

/**
 * PUT /api/purchase-orders/:id
 */
export const updatePurchaseOrder = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only DRAFT purchase orders can be edited' });
    }

    const {
      projectName,
      vendorId,
      rfqId,
      purchaseRequestId,
      currency,
      deliveryLocation,
      requiredDate,
      paymentTerms,
      warrantyPeriod,
      notes,
      items,
    } = req.body;

    const totalValue = items ? calcTotal(items) : existing.totalValue;

    const po = await prisma.$transaction(async (tx) => {
      if (items) {
        await tx.pOItem.deleteMany({ where: { purchaseOrderId: id } });
      }
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(projectName && { projectName }),
          ...(vendorId && { vendorId: parseInt(vendorId) }),
          rfqId: rfqId !== undefined ? (rfqId ? parseInt(rfqId) : null) : undefined,
          purchaseRequestId: purchaseRequestId !== undefined ? (purchaseRequestId ? parseInt(purchaseRequestId) : null) : undefined,
          ...(currency && { currency }),
          ...(deliveryLocation !== undefined && { deliveryLocation }),
          ...(requiredDate !== undefined && { requiredDate: requiredDate ? new Date(requiredDate) : null }),
          ...(paymentTerms !== undefined && { paymentTerms }),
          ...(warrantyPeriod !== undefined && { warrantyPeriod }),
          ...(notes !== undefined && { notes }),
          totalValue,
          ...(items && {
            items: {
              create: items.map((item) => ({
                description: item.description,
                csiCode: item.csiCode || null,
                quantity: parseFloat(item.quantity),
                unit: item.unit,
                unitPrice: parseFloat(item.unitPrice),
                totalPrice: parseFloat(item.quantity) * parseFloat(item.unitPrice),
                costCode: item.costCode || null,
                notes: item.notes || null,
              })),
            },
          }),
        },
        include: { items: true, vendor: { select: { companyLegalName: true } } },
      });
    });

    res.json(po);
  } catch (error) {
    console.error('Error updating purchase order:', error);
    res.status(500).json({ error: 'Failed to update purchase order' });
  }
};

/**
 * PATCH /api/purchase-orders/:id/status
 */
export const updatePOStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status: newStatus } = req.body;
    const roleId = req.user.roleId;
    const userId = req.user.id;

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { vendor: { select: { companyLegalName: true, contactEmail: true } } },
    });
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });

    const currentStatus = po.status;

    // Workflow validation
    const allowed = isTransitionAllowed(currentStatus, newStatus, roleId);
    if (!allowed) {
      return res.status(403).json({
        error: `Transition from ${currentStatus} to ${newStatus} is not allowed for your role`,
      });
    }

    const updateData = { status: newStatus };

    if (newStatus === 'APPROVED') {
      updateData.approvedById = userId;
      updateData.approvedAt = new Date();
    }

    if (newStatus === 'CANCELLED') {
      // allow any non-closed status
      if (['CLOSED'].includes(currentStatus)) {
        return res.status(400).json({ error: 'Cannot cancel a closed purchase order' });
      }
    }

    const updated = await prisma.purchaseOrder.update({ where: { id }, data: updateData });

    // Auto-create cost transactions for budget tracking
    if (newStatus === 'ISSUED') {
      try {
        const poWithItems = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
        for (const item of (poWithItems?.items || [])) {
          if (!item.costCode || !po.projectName) continue;
          const budgetLine = await prisma.projectBudget.findUnique({
            where: { projectName_costCode: { projectName: po.projectName, costCode: item.costCode } },
          });
          if (!budgetLine) continue;
          await prisma.costTransaction.create({
            data: {
              projectBudgetId: budgetLine.id, projectName: po.projectName, costCode: item.costCode,
              transactionType: 'PO_COMMITMENT', referenceId: id, referenceType: 'PO',
              referenceNumber: po.poNumber, amount: item.totalPrice || 0,
              description: `PO commitment: ${item.description}`, transactionDate: new Date(),
              createdById: userId,
            },
          });
        }
      } catch (txErr) {
        console.error('CostTransaction (ISSUED) error:', txErr.message); // non-fatal
      }
    }

    if (newStatus === 'CANCELLED') {
      try {
        const existing = await prisma.costTransaction.findMany({
          where: { referenceId: id, referenceType: 'PO', transactionType: 'PO_COMMITMENT' },
        });
        for (const tx of existing) {
          const { id: _id, createdAt: _ca, ...rest } = tx;
          await prisma.costTransaction.create({
            data: { ...rest, amount: -tx.amount, transactionType: 'ADJUSTMENT',
              description: `Reversal: PO ${po.poNumber} cancelled`, transactionDate: new Date(), createdById: userId },
          });
        }
      } catch (txErr) {
        console.error('CostTransaction (CANCELLED) error:', txErr.message); // non-fatal
      }
    }

    // Audit log for key transitions
    if (['APPROVED', 'ISSUED', 'CANCELLED', 'CLOSED'].includes(newStatus)) {
      await logAudit(userId, `PO_${newStatus}`, 'PurchaseOrder', id, {
        from: currentStatus,
        to: newStatus,
        poNumber: po.poNumber,
      });
      await logUserAction(req, `PO_${newStatus}`, 'PURCHASE_ORDERS', id, 'PurchaseOrder',
        { status: currentStatus }, { status: newStatus, poNumber: po.poNumber });
    }

    // Email vendor when ISSUED
    if (newStatus === 'ISSUED' && po.vendor?.contactEmail) {
      try {
        await emailService.sendEmail({
          to: po.vendor.contactEmail,
          subject: `Purchase Order ${po.poNumber} Issued`,
          html: `
            <h2>Purchase Order Issued</h2>
            <p>Dear ${po.vendor.companyLegalName},</p>
            <p>Purchase Order <strong>${po.poNumber}</strong> has been officially issued to you.</p>
            <p><strong>Project:</strong> ${po.projectName}</p>
            <p><strong>Total Value:</strong> ${po.totalValue.toLocaleString()} ${po.currency}</p>
            <p>Please confirm receipt and proceed with delivery as per the agreed terms.</p>
            <p>Best regards,<br/>Procurement Team</p>
          `,
          text: `Purchase Order ${po.poNumber} has been issued. Project: ${po.projectName}. Total: ${po.totalValue} ${po.currency}.`,
        });
      } catch (emailError) {
        console.error('Failed to send PO issue email:', emailError);
        // Non-fatal — status already updated
      }
    }

    // In-app notifications
    try {
      if (newStatus === 'PENDING_APPROVAL') {
        // Notify all managers
        const managers = await prisma.user.findMany({ where: { roleId: 2, isActive: true }, select: { id: true } });
        for (const m of managers) {
          await notificationService.createNotification({
            userId: m.id,
            title: `PO Pending Approval: ${po.poNumber}`,
            body: `${po.projectName || po.poNumber} — ${(po.totalValue || 0).toLocaleString()} ${po.currency || 'SAR'}`,
            type: 'INFO',
            priority: 'HIGH',
            actionUrl: '/dashboard/manager/approvals',
            module: 'PURCHASE_ORDER',
            entityId: po.id,
            entityType: 'PurchaseOrder'
          });
        }
      }

      if (newStatus === 'ISSUED') {
        // Look up vendor user id
        const vendorRecord = await prisma.vendor.findFirst({
          where: { companyLegalName: po.vendor?.companyLegalName },
          select: { id: true, userId: true }
        });
        if (vendorRecord?.userId) {
          await notificationService.createNotification({
            userId: vendorRecord.userId,
            title: `Purchase Order Issued: ${po.poNumber}`,
            body: `PO for ${po.projectName || po.poNumber} has been issued to your company.`,
            type: 'INFO',
            priority: 'HIGH',
            actionUrl: '/dashboard/vendor/purchase-orders',
            module: 'PURCHASE_ORDER',
            entityId: po.id,
            entityType: 'PurchaseOrder'
          });
        }
      }
    } catch (notifErr) {
      console.error('Failed to send PO notification:', notifErr.message);
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating PO status:', error);
    res.status(500).json({ error: 'Failed to update purchase order status' });
  }
};

/**
 * DELETE /api/purchase-orders/:id  (Admin only, DRAFT only)
 */
export const deletePurchaseOrder = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const po = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    if (po.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only DRAFT purchase orders can be deleted' });
    }

    await prisma.$transaction([
      prisma.pOItem.deleteMany({ where: { purchaseOrderId: id } }),
      prisma.purchaseOrder.delete({ where: { id } }),
    ]);

    await logAudit(req.user.id, 'PO_DELETED', 'PurchaseOrder', id, { poNumber: po.poNumber });
    res.json({ message: 'Purchase order deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    res.status(500).json({ error: 'Failed to delete purchase order' });
  }
};

// ─── Workflow helper ──────────────────────────────────────────────────────────

function isTransitionAllowed(from, to, roleId) {
  if (to === 'CANCELLED') {
    return roleId === ROLE.MANAGER || roleId === ROLE.EXECUTIVE;
  }

  const transitions = {
    DRAFT: {
      PENDING_APPROVAL: [ROLE.EXECUTIVE, ROLE.MANAGER, ROLE.OFFICER],
    },
    PENDING_APPROVAL: {
      APPROVED: [ROLE.EXECUTIVE, ROLE.MANAGER],
      DRAFT: [ROLE.EXECUTIVE, ROLE.MANAGER], // reject = back to draft
    },
    APPROVED: {
      ISSUED: [ROLE.EXECUTIVE, ROLE.MANAGER],
    },
    ISSUED: {
      PARTIALLY_DELIVERED: [ROLE.EXECUTIVE, ROLE.MANAGER, ROLE.OFFICER],
    },
    PARTIALLY_DELIVERED: {
      DELIVERED: [ROLE.EXECUTIVE, ROLE.MANAGER, ROLE.OFFICER],
    },
    DELIVERED: {
      CLOSED: [ROLE.EXECUTIVE, ROLE.MANAGER],
    },
  };

  const allowed = transitions[from]?.[to];
  return allowed ? allowed.includes(roleId) : false;
}
