import express from "express";
import prisma from "../../config/prismaClient.js";

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function monthRange(monthsAgo) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0, 23, 59, 59);
  return { start, end };
}

function calcTrend(current, previous) {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Count records where pendingWithPersonId = userId AND status = 'WAITING_FOR_APPROVAL'
// across tables that support a plain-string status field, for a given date range (optional).
// NOTE: RFQ.status is an enum (RFQStatus: DRAFT/ISSUED/OPEN/CLOSED/AWARDED/CANCELED) —
// it does NOT include WAITING_FOR_APPROVAL, so RFQ is excluded to avoid a Prisma enum error.
async function countPendingApprovals(userId, dateFilter = {}) {
  const where = { pendingWithPersonId: userId, status: "WAITING_FOR_APPROVAL", ...dateFilter };
  const [pr, po, contract, vq, invoice] = await Promise.all([
    prisma.purchaseRequest.count({ where }),
    prisma.purchaseOrder.count({ where }),
    prisma.contract.count({ where }),
    prisma.vendorQualification.count({ where }),
    prisma.invoice.count({ where }),
  ]);
  return pr + po + contract + vq + invoice;
}

// ─── GET /api/dashboard/manager/kpis ─────────────────────────────────────────

router.get("/kpis", async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const { start: lastMonthStart, end: lastMonthEnd } = monthRange(1);

    // openPRs — PurchaseRequest.status is a plain String field
    const [openPRs, openPRsLastMonth] = await Promise.all([
      prisma.purchaseRequest.count({
        where: { status: { in: ["SUBMITTED", "UNDER_TECHNICAL_REVIEW", "UNDER_PROCUREMENT_REVIEW"] } },
      }),
      prisma.purchaseRequest.count({
        where: {
          status: { in: ["SUBMITTED", "UNDER_TECHNICAL_REVIEW", "UNDER_PROCUREMENT_REVIEW"] },
          createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
        },
      }),
    ]);

    // overdueTasks — Task.status is the TaskStatus enum; pass enum member names as strings
    const [overdueTasks, overdueTasksLastMonth] = await Promise.all([
      prisma.task.count({
        where: {
          dueDate: { lt: now },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
      prisma.task.count({
        where: {
          dueDate: { lt: lastMonthEnd },
          createdAt: { lte: lastMonthEnd },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
    ]);

    // vendorsUnderReview — Vendor.status is the VendorStatus enum
    const [vendorsUnderReview, vendorsUnderReviewLastMonth] = await Promise.all([
      prisma.vendor.count({ where: { status: "UNDER_REVIEW" } }),
      prisma.vendor.count({ where: { status: "UNDER_REVIEW", updatedAt: { lte: lastMonthEnd } } }),
    ]);

    // pendingApprovals — across PR, PO, Contract, VendorQualification, Invoice (all have String status)
    const [pendingApprovals, pendingApprovalsLastMonth] = await Promise.all([
      countPendingApprovals(userId),
      countPendingApprovals(userId, { updatedAt: { gte: lastMonthStart, lte: lastMonthEnd } }),
    ]);

    res.json({
      openPRs,
      trendOpenPRs: calcTrend(openPRs, openPRsLastMonth),
      pendingApprovals,
      trendPendingApprovals: calcTrend(pendingApprovals, pendingApprovalsLastMonth),
      overdueTasks,
      trendOverdueTasks: calcTrend(overdueTasks, overdueTasksLastMonth),
      vendorsUnderReview,
      trendVendorsUnderReview: calcTrend(vendorsUnderReview, vendorsUnderReviewLastMonth),
    });
  } catch (error) {
    console.error("❌ FULL KPI ERROR:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// ─── GET /api/dashboard/manager/charts ───────────────────────────────────────

router.get("/charts", async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // teamTrends: last 6 months
    const teamTrends = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const monthsAgo = 5 - i; // 5 months ago → current month
        const { start, end } = monthRange(monthsAgo);
        const monthIndex = ((now.getMonth() - monthsAgo) + 12) % 12;
        const [total, completed] = await Promise.all([
          prisma.task.count({ where: { createdAt: { gte: start, lte: end } } }),
          prisma.task.count({ where: { status: "COMPLETED", updatedAt: { gte: start, lte: end } } }),
        ]);
        return { month: MONTH_NAMES[monthIndex], completed, total };
      })
    );

    // priorityDistribution: count open items across PR, RFQ, PO, Invoice by priority
    const openStatuses = {
      purchaseRequest: { status: { in: ["SUBMITTED", "UNDER_TECHNICAL_REVIEW", "UNDER_PROCUREMENT_REVIEW", "WAITING_FOR_APPROVAL"] } },
      purchaseOrder: { status: { notIn: ["APPROVED", "REJECTED", "CANCELLED"] } },
      invoice: { status: { notIn: ["PAID", "REJECTED", "CANCELLED"] } },
    };

    const priorities = ["HIGH", "MEDIUM", "LOW"];
    const priorityCounts = await Promise.all(
      priorities.map(async (priority) => {
        const [pr, po, invoice] = await Promise.all([
          prisma.purchaseRequest.count({ where: { ...openStatuses.purchaseRequest, priority } }),
          prisma.purchaseOrder.count({ where: { ...openStatuses.purchaseOrder, priority } }),
          prisma.invoice.count({ where: { ...openStatuses.invoice, priority } }),
          // NOTE: RFQ has no priority field — excluded from priority distribution
        ]);
        return { priority, count: pr + po + invoice };
      })
    );

    const totalPriority = priorityCounts.reduce((sum, p) => sum + p.count, 0);
    const priorityDistribution = priorityCounts.map((p) => ({
      priority: p.priority,
      count: p.count,
      percent: totalPriority > 0 ? Math.round((p.count / totalPriority) * 100) : 0,
    }));

    // teamPerformance: procurement staff (roleId 2 = manager, 3 = officer)
    const procurementUsers = await prisma.user.findMany({
      where: { roleId: { in: [2, 3] }, isActive: true },
      select: { id: true, name: true },
    });

    const teamPerformance = await Promise.all(
      procurementUsers.map(async (user) => {
        const [completedLast30Days, overdueCount] = await Promise.all([
          prisma.task.count({
            where: {
              assignedTo: user.id,
              status: "COMPLETED",
              updatedAt: { gte: thirtyDaysAgo },
            },
          }),
          prisma.task.count({
            where: {
              assignedTo: user.id,
              dueDate: { lt: now },
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
          }),
        ]);
        const total = completedLast30Days + overdueCount;
        const successRate = total > 0 ? `${Math.round((completedLast30Days / total) * 100)}%` : "N/A";
        return { name: user.name ?? "Unknown", completedLast30Days, overdueCount, successRate };
      })
    );

    res.json({ teamTrends, priorityDistribution, teamPerformance });
  } catch (error) {
    console.error("❌ Error fetching manager charts:", error);
    res.status(500).json({ error: "Failed to fetch charts." });
  }
});

// ─── GET /api/dashboard/manager/approval-queue ───────────────────────────────

router.get("/approval-queue", async (req, res) => {
  try {
    const userId = req.user.id;

    const actions = await prisma.approvalAction.findMany({
      where: { approverId: userId, status: "PENDING" },
      include: { instance: true },
      orderBy: { createdAt: "desc" },
    });

    const queue = await Promise.all(
      actions.map(async (action) => {
        const { entityType, entityId } = action.instance;
        let entity = null;

        try {
          switch (entityType.toUpperCase()) {
            case "RFQ":
              entity = await prisma.rFQ.findUnique({
                where: { id: entityId },
                select: { title: true, projectName: true, createdAt: true, status: true, dueDate: true },
              });
              break;
            case "CONTRACT":
              entity = await prisma.contract.findUnique({
                where: { id: entityId },
                select: { contractNumber: true, createdAt: true, status: true },
              });
              break;
            case "PURCHASE_REQUEST":
              entity = await prisma.purchaseRequest.findUnique({
                where: { id: entityId },
                select: { title: true, project: true, createdAt: true, status: true, priority: true },
              });
              break;
            case "PURCHASE_ORDER":
              entity = await prisma.purchaseOrder.findUnique({
                where: { id: entityId },
                select: { title: true, project: true, createdAt: true, status: true, priority: true },
              });
              break;
            case "VENDOR_QUALIFICATION":
              entity = await prisma.vendorQualification.findUnique({
                where: { id: entityId },
                select: { vendorId: true, createdAt: true, status: true, priority: true },
              });
              break;
            case "INVOICE":
              entity = await prisma.invoice.findUnique({
                where: { id: entityId },
                select: { title: true, project: true, createdAt: true, status: true, priority: true, dueDate: true },
              });
              break;
          }
        } catch (_) {
          // Entity not found — skip silently
        }

        return {
          id: action.id,
          type: entityType,
          details: entity?.title ?? entity?.contractNumber ?? `${entityType} #${entityId}`,
          project: entity?.projectName ?? entity?.project ?? null,
          requestedDate: entity?.createdAt ?? action.createdAt,
          priority: entity?.priority ?? "MEDIUM",
          status: action.status,
        };
      })
    );

    res.json(queue);
  } catch (error) {
    console.error("❌ Error fetching approval queue:", error);
    res.status(500).json({ error: "Failed to fetch approval queue." });
  }
});

// ─── GET /api/dashboard/manager/critical-deadlines ───────────────────────────

router.get("/critical-deadlines", async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const deadlineFilter = { lte: sevenDaysFromNow };

    const [tasks, prs, pos, rfqs, invoices] = await Promise.all([
      prisma.task.findMany({
        where: { dueDate: deadlineFilter, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        include: { assignedUser: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.purchaseRequest.findMany({
        where: { dueDate: deadlineFilter, status: { notIn: ["APPROVED", "REJECTED", "CANCELLED"] } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.purchaseOrder.findMany({
        where: { dueDate: deadlineFilter, status: { notIn: ["APPROVED", "REJECTED", "CANCELLED"] } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.rFQ.findMany({
        where: { dueDate: deadlineFilter, status: { in: ["DRAFT", "ISSUED", "OPEN"] } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.invoice.findMany({
        where: { dueDate: deadlineFilter, status: { notIn: ["PAID", "REJECTED", "CANCELLED"] } },
        orderBy: { dueDate: "asc" },
      }),
    ]);

    const daysUntilDue = (date) => Math.ceil((new Date(date) - now) / (1000 * 60 * 60 * 24));

    const items = [
      ...tasks.map((t) => ({
        id: t.id,
        task: t.title,
        module: "Task",
        project: null,
        assignedTo: t.assignedUser?.name ?? null,
        dueDate: t.dueDate,
        daysUntilDue: daysUntilDue(t.dueDate),
        priority: t.priority,
        status: t.status,
      })),
      ...prs.map((p) => ({
        id: p.id,
        task: p.title,
        module: "Purchase Request",
        project: p.project,
        assignedTo: null,
        dueDate: p.dueDate,
        daysUntilDue: daysUntilDue(p.dueDate),
        priority: p.priority,
        status: p.status,
      })),
      ...pos.map((p) => ({
        id: p.id,
        task: p.title,
        module: "Purchase Order",
        project: p.project,
        assignedTo: null,
        dueDate: p.dueDate,
        daysUntilDue: daysUntilDue(p.dueDate),
        priority: p.priority,
        status: p.status,
      })),
      ...rfqs.map((r) => ({
        id: r.id,
        task: r.title,
        module: "RFQ",
        project: r.projectName,
        assignedTo: null,
        dueDate: r.dueDate,
        daysUntilDue: r.dueDate ? daysUntilDue(r.dueDate) : null,
        priority: "MEDIUM",
        status: r.status,
      })),
      ...invoices.map((inv) => ({
        id: inv.id,
        task: inv.title ?? `Invoice #${inv.id}`,
        module: "Invoice",
        project: inv.project,
        assignedTo: null,
        dueDate: inv.dueDate,
        daysUntilDue: daysUntilDue(inv.dueDate),
        priority: inv.priority,
        status: inv.status,
      })),
    ];

    // Sort by dueDate ascending (nulls last)
    items.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });

    res.json(items);
  } catch (error) {
    console.error("❌ Error fetching critical deadlines:", error);
    res.status(500).json({ error: "Failed to fetch critical deadlines." });
  }
});

export default router;
