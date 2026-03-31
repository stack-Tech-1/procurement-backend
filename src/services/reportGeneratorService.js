import prisma from '../config/prismaClient.js';

const REQUIRED_DOC_TYPES = [
  'COMMERCIAL_REGISTRATION', 'ZAKAT_CERTIFICATE', 'VAT_CERTIFICATE',
  'GOSI_CERTIFICATE', 'BANK_LETTER', 'INSURANCE_CERTIFICATE',
  'ISO_CERTIFICATE', 'HSE_PLAN', 'TECHNICAL_FILE',
];

// ─── Vendor Master List ───────────────────────────────────────────────────────
export const generateVendorMasterListReport = async (filters = {}) => {
  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.vendorClass) where.vendorClass = filters.vendorClass;
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const vendors = await prisma.vendor.findMany({
    where,
    include: {
      documents: { select: { docType: true, isValid: true, expiryDate: true, isVerified: true } },
      categories: { include: { category: { select: { name: true } } } },
      user: { select: { email: true, name: true } },
      vendorQualifications: { orderBy: { updatedAt: 'desc' }, take: 1 },
    },
    orderBy: { qualificationScore: 'desc' },
  });

  const now = new Date();
  const rows = vendors.map((v) => {
    const validDocs = v.documents.filter(
      (d) => d.isValid && (!d.expiryDate || new Date(d.expiryDate) > now)
    );
    const expiredDocs = v.documents.filter(
      (d) => d.expiryDate && new Date(d.expiryDate) <= now
    );
    const requiredUploaded = REQUIRED_DOC_TYPES.filter((t) =>
      v.documents.some((d) => d.docType === t && d.isValid)
    ).length;

    return {
      vendorId: v.vendorId || v.id,
      companyName: v.companyLegalName || v.user?.name || '—',
      email: v.contactEmail || v.user?.email || '—',
      phone: v.contactPhone || '—',
      vendorType: v.vendorType || '—',
      vendorClass: v.vendorClass || 'D',
      status: v.status,
      qualificationScore: v.qualificationScore || 0,
      categories: v.categories.map((c) => c.category?.name).filter(Boolean).join(', '),
      validDocuments: validDocs.length,
      expiredDocuments: expiredDocs.length,
      requiredDocUploaded: `${requiredUploaded}/${REQUIRED_DOC_TYPES.length}`,
      lastEvaluation: v.lastEvaluatedAt,
      city: v.addressCity || '—',
      country: v.addressCountry || '—',
      crNumber: v.crNumber || '—',
      yearsInBusiness: v.yearsInBusiness || 0,
    };
  });

  const summary = {
    total: rows.length,
    approved: rows.filter((r) => r.status === 'APPROVED').length,
    underReview: rows.filter((r) => r.status === 'UNDER_REVIEW').length,
    rejected: rows.filter((r) => r.status === 'REJECTED').length,
    blacklisted: rows.filter((r) => r.status === 'BLACKLISTED').length,
    classA: rows.filter((r) => r.vendorClass === 'A').length,
    classB: rows.filter((r) => r.vendorClass === 'B').length,
    classC: rows.filter((r) => r.vendorClass === 'C').length,
    classD: rows.filter((r) => r.vendorClass === 'D').length,
  };

  return { rows, summary };
};

// ─── Procurement Spend ────────────────────────────────────────────────────────
export const generateProcurementSpendReport = async (filters = {}) => {
  const where = {};
  if (filters.projectName) where.projectName = { contains: filters.projectName, mode: 'insensitive' };
  if (filters.vendorId) where.vendorId = parseInt(filters.vendorId);
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const pos = await prisma.purchaseOrder.findMany({
    where,
    include: {
      vendor: { select: { companyLegalName: true, vendorClass: true } },
      items: { select: { totalPrice: true, description: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Group by project
  const byProject = {};
  for (const po of pos) {
    const proj = po.projectName || 'Unknown';
    if (!byProject[proj]) byProject[proj] = { projectName: proj, pos: [] };
    byProject[proj].pos.push(po);
  }

  const projectRows = Object.values(byProject).map((proj) => {
    const totalCommitted = proj.pos.reduce((s, p) => s + (p.totalValue || 0), 0);
    const poCount = proj.pos.length;
    const statusCounts = {};
    proj.pos.forEach((p) => { statusCounts[p.status] = (statusCounts[p.status] || 0) + 1; });
    return {
      projectName: proj.projectName,
      poCount,
      totalCommitted,
      statusCounts,
      pos: proj.pos.map((p) => ({
        poNumber: p.poNumber,
        vendor: p.vendor?.companyLegalName || '—',
        vendorClass: p.vendor?.vendorClass || '—',
        status: p.status,
        totalValue: p.totalValue || 0,
        currency: p.currency || 'SAR',
        createdAt: p.createdAt,
        itemCount: p.items.length,
      })),
    };
  });

  // Monthly spend trend
  const monthlySpend = {};
  for (const po of pos) {
    const m = po.createdAt.toISOString().slice(0, 7);
    monthlySpend[m] = (monthlySpend[m] || 0) + (po.totalValue || 0);
  }

  const summary = {
    totalPOs: pos.length,
    totalCommitted: pos.reduce((s, p) => s + (p.totalValue || 0), 0),
    avgPOValue: pos.length ? pos.reduce((s, p) => s + (p.totalValue || 0), 0) / pos.length : 0,
    projectCount: projectRows.length,
  };

  return { rows: projectRows, allPOs: pos, monthlySpend, summary };
};

// ─── Vendor Performance ───────────────────────────────────────────────────────
export const generateVendorPerformanceReport = async (filters = {}) => {
  const vendors = await prisma.vendor.findMany({
    where: { status: 'APPROVED' },
    include: {
      vendorQualifications: { orderBy: { updatedAt: 'desc' }, take: 1 },
      documents: { select: { isValid: true, expiryDate: true } },
    },
    orderBy: { qualificationScore: 'desc' },
  });

  const now = new Date();
  const rows = await Promise.all(
    vendors.map(async (v, idx) => {
      const rfqTotal = await prisma.rFQSubmission.count({ where: { vendorId: v.id } });
      const rfqWon = await prisma.rFQSubmission.count({ where: { vendorId: v.id, status: 'AWARDED' } });
      const validDocs = v.documents.filter(
        (d) => d.isValid && (!d.expiryDate || new Date(d.expiryDate) > now)
      ).length;
      const docCompliance = v.documents.length
        ? Math.round((validDocs / Math.max(v.documents.length, 1)) * 100)
        : 0;
      const q = v.vendorQualifications[0];

      return {
        rank: idx + 1,
        vendorId: v.id,
        companyName: v.companyLegalName || '—',
        vendorClass: v.vendorClass || 'D',
        overallScore: v.qualificationScore || 0,
        rfqParticipated: rfqTotal,
        rfqWon,
        winRate: rfqTotal ? Math.round((rfqWon / rfqTotal) * 100) : 0,
        docCompliance,
        lastEvaluation: v.lastEvaluatedAt,
        documentScore: q?.documentScore || 0,
        technicalScore: q?.technicalScore || 0,
        financialScore: q?.financialScore || 0,
        experienceScore: q?.experienceScore || 0,
        responsivenessScore: q?.responsivenessScore || 0,
      };
    })
  );

  return {
    rows,
    summary: {
      avgScore: rows.length ? rows.reduce((s, r) => s + r.overallScore, 0) / rows.length : 0,
      topPerformer: rows[0]?.companyName || '—',
      avgWinRate: rows.length ? rows.reduce((s, r) => s + r.winRate, 0) / rows.length : 0,
      avgDocCompliance: rows.length ? rows.reduce((s, r) => s + r.docCompliance, 0) / rows.length : 0,
    },
  };
};

// ─── RFQ Analytics ────────────────────────────────────────────────────────────
export const generateRFQAnalyticsReport = async (filters = {}) => {
  const where = {};
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const rfqs = await prisma.rFQ.findMany({
    where,
    include: {
      submissions: {
        include: { vendor: { select: { companyLegalName: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const rows = rfqs.map((rfq) => {
    const awarded = rfq.submissions.find((s) => s.status === 'AWARDED');
    const dueMs = rfq.dueDate ? new Date(rfq.dueDate) - new Date(rfq.createdAt) : null;
    const daysToAward = dueMs ? Math.round(dueMs / (1000 * 60 * 60 * 24)) : null;
    const responseRate = rfq.submissions.length;

    return {
      rfqNumber: rfq.rfqNumber,
      title: rfq.title || '—',
      projectName: rfq.projectName,
      status: rfq.status,
      vendorsInvited: rfq.submissions.length,
      quotesReceived: rfq.submissions.filter((s) => s.totalValue).length,
      responseRate: rfq.submissions.length,
      daysToAward,
      winningVendor: awarded?.vendor?.companyLegalName || '—',
      awardedValue: awarded?.totalValue || 0,
      currency: awarded?.currency || 'SAR',
      createdAt: rfq.createdAt,
      dueDate: rfq.dueDate,
    };
  });

  const awarded = rows.filter((r) => r.status === 'AWARDED' || r.winningVendor !== '—');
  const summary = {
    total: rows.length,
    awarded: awarded.length,
    avgResponseRate: rows.length ? rows.reduce((s, r) => s + r.responseRate, 0) / rows.length : 0,
    avgDaysToAward: awarded.filter((r) => r.daysToAward).length
      ? awarded.filter((r) => r.daysToAward).reduce((s, r) => s + r.daysToAward, 0) /
        awarded.filter((r) => r.daysToAward).length
      : 0,
    totalAwardedValue: awarded.reduce((s, r) => s + r.awardedValue, 0),
  };

  return { rows, summary };
};

// ─── Document Compliance ──────────────────────────────────────────────────────
export const generateDocumentComplianceReport = async () => {
  const vendors = await prisma.vendor.findMany({
    include: {
      documents: {
        select: { docType: true, isValid: true, expiryDate: true, isVerified: true, uploadedAt: true },
      },
      user: { select: { name: true, email: true } },
    },
    orderBy: { companyLegalName: 'asc' },
  });

  const now = new Date();
  const rows = vendors.map((v) => {
    const docMap = {};
    v.documents.forEach((d) => {
      docMap[d.docType] = {
        uploaded: true,
        isValid: d.isValid,
        isVerified: d.isVerified,
        expiryDate: d.expiryDate,
        daysUntilExpiry: d.expiryDate
          ? Math.round((new Date(d.expiryDate) - now) / (1000 * 60 * 60 * 24))
          : null,
      };
    });

    const requiredUploaded = REQUIRED_DOC_TYPES.filter((t) =>
      docMap[t]?.uploaded && docMap[t]?.isValid
    ).length;
    const compliancePct = Math.round((requiredUploaded / REQUIRED_DOC_TYPES.length) * 100);
    const complianceLevel =
      compliancePct === 100 ? 'FULL' : compliancePct >= 60 ? 'PARTIAL' : 'NON_COMPLIANT';

    return {
      vendorId: v.id,
      companyName: v.companyLegalName || v.user?.name || '—',
      vendorClass: v.vendorClass || 'D',
      status: v.status,
      compliancePct,
      complianceLevel,
      requiredUploaded,
      requiredTotal: REQUIRED_DOC_TYPES.length,
      documents: docMap,
    };
  });

  const full = rows.filter((r) => r.complianceLevel === 'FULL');
  const partial = rows.filter((r) => r.complianceLevel === 'PARTIAL');
  const nonCompliant = rows.filter((r) => r.complianceLevel === 'NON_COMPLIANT');

  return {
    rows,
    fullCompliant: full,
    partialCompliant: partial,
    nonCompliant,
    docTypes: REQUIRED_DOC_TYPES,
    summary: {
      total: rows.length,
      fullCount: full.length,
      partialCount: partial.length,
      nonCompliantCount: nonCompliant.length,
      avgCompliance: rows.length
        ? Math.round(rows.reduce((s, r) => s + r.compliancePct, 0) / rows.length)
        : 0,
    },
  };
};

// ─── Overdue Tasks ────────────────────────────────────────────────────────────
export const generateOverdueTasksReport = async (filters = {}) => {
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: {
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      dueDate: { lt: now },
    },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  const rows = tasks.map((t) => ({
    taskId: t.id,
    title: t.title,
    type: t.taskType || t.module || '—',
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    daysOverdue: Math.round((now - new Date(t.dueDate)) / (1000 * 60 * 60 * 24)),
    assigneeName: t.assignedTo?.name || '—',
    assigneeEmail: t.assignedTo?.email || '—',
    assignedById: t.createdBy?.name || '—',
    project: t.projectName || '—',
    module: t.module || '—',
  }));

  // Group by assignee
  const byAssignee = {};
  rows.forEach((r) => {
    const key = r.assigneeName;
    if (!byAssignee[key]) byAssignee[key] = { assignee: key, email: r.assigneeEmail, tasks: [] };
    byAssignee[key].tasks.push(r);
  });

  return {
    rows,
    byAssignee: Object.values(byAssignee),
    summary: {
      total: rows.length,
      critical: rows.filter((r) => r.daysOverdue > 7).length,
      assigneeCount: Object.keys(byAssignee).length,
    },
  };
};

// ─── Weekly Executive Summary ─────────────────────────────────────────────────
export const generateWeeklyExecutiveSummary = async (weekStartDate) => {
  const weekStart = weekStartDate ? new Date(weekStartDate) : (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  })();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const now = new Date();

  const [
    newVendors, posIssued, rfqsOpened, rfqsClosed,
    tasksCompleted, overdueTasks, pendingApprovals, docAlerts,
  ] = await Promise.all([
    prisma.vendor.count({ where: { createdAt: { gte: weekStart, lt: weekEnd } } }),
    prisma.purchaseOrder.findMany({
      where: { createdAt: { gte: weekStart, lt: weekEnd } },
      select: { totalValue: true, currency: true },
    }),
    prisma.rFQ.count({ where: { createdAt: { gte: weekStart, lt: weekEnd } } }),
    prisma.rFQ.count({ where: { updatedAt: { gte: weekStart, lt: weekEnd }, status: 'AWARDED' } }),
    prisma.task.count({ where: { updatedAt: { gte: weekStart, lt: weekEnd }, status: 'COMPLETED' } }),
    prisma.task.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueDate: { lt: now } } }),
    prisma.vendorQualification.count({ where: { status: 'SUBMITTED' } }),
    prisma.vendor.count({
      where: {
        documents: {
          some: {
            expiryDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
            isValid: true,
          },
        },
      },
    }),
  ]);

  const topVendors = await prisma.vendor.findMany({
    take: 5,
    where: { status: 'APPROVED' },
    orderBy: { qualificationScore: 'desc' },
    select: { companyLegalName: true, vendorClass: true, qualificationScore: true },
  });

  return {
    weekStart,
    weekEnd,
    newVendors,
    posIssued: posIssued.length,
    posTotalValue: posIssued.reduce((s, p) => s + (p.totalValue || 0), 0),
    rfqsOpened,
    rfqsClosed,
    tasksCompleted,
    overdueTasks,
    pendingApprovals,
    documentAlerts: docAlerts,
    topVendors,
  };
};
