import prisma from '../config/prismaClient.js';
import { logAudit } from '../utils/auditLogger.js';

// ─── PO number generator (mirrors purchaseOrderController) ───────────────────

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

// ─── Technical Comparison ────────────────────────────────────────────────────

/**
 * GET /api/rfqs/:rfqId/technical-comparison
 */
export const getTechnicalComparisons = async (req, res) => {
  try {
    const rfqId = parseInt(req.params.rfqId);
    const rows = await prisma.technicalComparison.findMany({
      where: { rfqId },
      include: {
        vendor: { select: { id: true, companyLegalName: true, vendorClass: true } },
      },
      orderBy: { technicalScore: 'desc' },
    });
    res.json(rows);
  } catch (error) {
    console.error('Error fetching technical comparisons:', error);
    res.status(500).json({ error: 'Failed to fetch technical comparisons' });
  }
};

/**
 * POST /api/rfqs/:rfqId/technical-comparison  (upsert by rfqId + vendorId)
 */
export const upsertTechnicalComparison = async (req, res) => {
  try {
    const rfqId = parseInt(req.params.rfqId);
    const { vendorId, technicalCompliance, technicalScore, technicalNotes, attachmentPath } = req.body;

    if (!vendorId) return res.status(400).json({ error: 'vendorId is required' });

    const existing = await prisma.technicalComparison.findFirst({
      where: { rfqId, vendorId: parseInt(vendorId) },
    });

    let row;
    if (existing) {
      row = await prisma.technicalComparison.update({
        where: { id: existing.id },
        data: {
          technicalCompliance: technicalCompliance ?? existing.technicalCompliance,
          technicalScore: technicalScore !== undefined ? parseInt(technicalScore) : existing.technicalScore,
          technicalNotes: technicalNotes !== undefined ? technicalNotes : existing.technicalNotes,
          attachmentPath: attachmentPath !== undefined ? attachmentPath : existing.attachmentPath,
        },
        include: { vendor: { select: { id: true, companyLegalName: true, vendorClass: true } } },
      });
    } else {
      row = await prisma.technicalComparison.create({
        data: {
          rfqId,
          vendorId: parseInt(vendorId),
          technicalCompliance: technicalCompliance ?? 'PARTIAL',
          technicalScore: technicalScore !== undefined ? parseInt(technicalScore) : null,
          technicalNotes: technicalNotes ?? null,
          attachmentPath: attachmentPath ?? null,
          createdById: req.user.id,
        },
        include: { vendor: { select: { id: true, companyLegalName: true, vendorClass: true } } },
      });
    }

    await logAudit(req.user.id, 'TECH_COMPARISON_UPSERT', 'TechnicalComparison', row.id, { rfqId, vendorId });
    res.json(row);
  } catch (error) {
    console.error('Error upserting technical comparison:', error);
    res.status(500).json({ error: 'Failed to save technical comparison' });
  }
};

// ─── Financial Comparison ────────────────────────────────────────────────────

/**
 * GET /api/rfqs/:rfqId/financial-comparison
 */
export const getFinancialComparisons = async (req, res) => {
  try {
    const rfqId = parseInt(req.params.rfqId);
    const rows = await prisma.financialComparison.findMany({
      where: { rfqId },
      include: {
        vendor: { select: { id: true, companyLegalName: true, vendorClass: true } },
      },
      orderBy: { totalPrice: 'asc' },
    });
    res.json(rows);
  } catch (error) {
    console.error('Error fetching financial comparisons:', error);
    res.status(500).json({ error: 'Failed to fetch financial comparisons' });
  }
};

/**
 * POST /api/rfqs/:rfqId/financial-comparison  (upsert by rfqId + vendorId)
 */
export const upsertFinancialComparison = async (req, res) => {
  try {
    const rfqId = parseInt(req.params.rfqId);
    const {
      vendorId, currency, unitPrice, quantity,
      deliveryTimeDays, paymentTerms, discount, warrantyPeriod, commercialNotes,
    } = req.body;

    if (!vendorId) return res.status(400).json({ error: 'vendorId is required' });
    if (unitPrice === undefined || quantity === undefined) {
      return res.status(400).json({ error: 'unitPrice and quantity are required' });
    }

    const up = parseFloat(unitPrice);
    const qty = parseFloat(quantity);
    const disc = discount ? parseFloat(discount) : 0;
    const totalPrice = up * qty - disc;

    const existing = await prisma.financialComparison.findFirst({
      where: { rfqId, vendorId: parseInt(vendorId) },
    });

    let row;
    if (existing) {
      row = await prisma.financialComparison.update({
        where: { id: existing.id },
        data: {
          currency: currency ?? existing.currency,
          unitPrice: up,
          quantity: qty,
          totalPrice,
          deliveryTimeDays: deliveryTimeDays !== undefined ? parseInt(deliveryTimeDays) : existing.deliveryTimeDays,
          paymentTerms: paymentTerms !== undefined ? paymentTerms : existing.paymentTerms,
          discount: disc,
          warrantyPeriod: warrantyPeriod !== undefined ? warrantyPeriod : existing.warrantyPeriod,
          commercialNotes: commercialNotes !== undefined ? commercialNotes : existing.commercialNotes,
        },
        include: { vendor: { select: { id: true, companyLegalName: true, vendorClass: true } } },
      });
    } else {
      row = await prisma.financialComparison.create({
        data: {
          rfqId,
          vendorId: parseInt(vendorId),
          currency: currency ?? 'SAR',
          unitPrice: up,
          quantity: qty,
          totalPrice,
          deliveryTimeDays: deliveryTimeDays ? parseInt(deliveryTimeDays) : null,
          paymentTerms: paymentTerms ?? null,
          discount: disc,
          warrantyPeriod: warrantyPeriod ?? null,
          commercialNotes: commercialNotes ?? null,
          createdById: req.user.id,
        },
        include: { vendor: { select: { id: true, companyLegalName: true, vendorClass: true } } },
      });
    }

    await logAudit(req.user.id, 'FIN_COMPARISON_UPSERT', 'FinancialComparison', row.id, { rfqId, vendorId });
    res.json(row);
  } catch (error) {
    console.error('Error upserting financial comparison:', error);
    res.status(500).json({ error: 'Failed to save financial comparison' });
  }
};

/**
 * PATCH /api/rfqs/:rfqId/financial-comparison/mark-lowest
 */
export const markLowestCommercial = async (req, res) => {
  try {
    const rfqId = parseInt(req.params.rfqId);
    const { vendorId } = req.body;
    if (!vendorId) return res.status(400).json({ error: 'vendorId is required' });

    await prisma.$transaction([
      prisma.financialComparison.updateMany({
        where: { rfqId },
        data: { isLowestCommercial: false },
      }),
      prisma.financialComparison.updateMany({
        where: { rfqId, vendorId: parseInt(vendorId) },
        data: { isLowestCommercial: true },
      }),
    ]);

    const rows = await prisma.financialComparison.findMany({
      where: { rfqId },
      include: { vendor: { select: { id: true, companyLegalName: true, vendorClass: true } } },
      orderBy: { totalPrice: 'asc' },
    });
    res.json(rows);
  } catch (error) {
    console.error('Error marking lowest commercial:', error);
    res.status(500).json({ error: 'Failed to mark lowest commercial' });
  }
};

// ─── Evaluation Summary ──────────────────────────────────────────────────────

/**
 * GET /api/rfqs/:rfqId/evaluation-summary
 */
export const getEvaluationSummary = async (req, res) => {
  try {
    const rfqId = parseInt(req.params.rfqId);
    const evaluation = await prisma.evaluationSummary.findUnique({
      where: { rfqId },
      include: {
        recommendedVendor: { select: { id: true, companyLegalName: true, vendorClass: true } },
        approvedBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    // Return null if not found (not 404) — frontend needs to distinguish "not yet created"
    res.json(evaluation);
  } catch (error) {
    console.error('Error fetching evaluation summary:', error);
    res.status(500).json({ error: 'Failed to fetch evaluation summary' });
  }
};

/**
 * POST /api/rfqs/:rfqId/evaluation-summary  (upsert)
 */
export const upsertEvaluationSummary = async (req, res) => {
  try {
    const rfqId = parseInt(req.params.rfqId);
    const { recommendedVendorId, technicalScore, commercialRank, awardJustification } = req.body;

    if (!recommendedVendorId) return res.status(400).json({ error: 'recommendedVendorId is required' });
    if (!awardJustification) return res.status(400).json({ error: 'awardJustification is required' });

    const existing = await prisma.evaluationSummary.findUnique({ where: { rfqId } });

    let evaluation;
    if (existing) {
      evaluation = await prisma.evaluationSummary.update({
        where: { rfqId },
        data: {
          recommendedVendorId: parseInt(recommendedVendorId),
          technicalScore: technicalScore !== undefined ? parseInt(technicalScore) : null,
          commercialRank: commercialRank ?? null,
          awardJustification,
          approvalStatus: 'PENDING',
          approvedById: null,
          approvedAt: null,
          createdPOId: null,
        },
        include: {
          recommendedVendor: { select: { id: true, companyLegalName: true, vendorClass: true } },
        },
      });
    } else {
      evaluation = await prisma.evaluationSummary.create({
        data: {
          rfqId,
          recommendedVendorId: parseInt(recommendedVendorId),
          technicalScore: technicalScore !== undefined ? parseInt(technicalScore) : null,
          commercialRank: commercialRank ?? null,
          awardJustification,
          approvalStatus: 'PENDING',
          createdById: req.user.id,
        },
        include: {
          recommendedVendor: { select: { id: true, companyLegalName: true, vendorClass: true } },
        },
      });
    }

    res.json(evaluation);
  } catch (error) {
    console.error('Error upserting evaluation summary:', error);
    res.status(500).json({ error: 'Failed to save evaluation summary' });
  }
};

/**
 * PATCH /api/rfqs/:rfqId/evaluation-summary/approve
 */
export const approveEvaluationSummary = async (req, res) => {
  try {
    const rfqId = parseInt(req.params.rfqId);

    const evaluation = await prisma.evaluationSummary.findUnique({ where: { rfqId } });
    if (!evaluation) return res.status(404).json({ error: 'Evaluation summary not found' });
    if (evaluation.approvalStatus !== 'PENDING') {
      return res.status(400).json({ error: 'Only PENDING evaluations can be approved' });
    }

    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      select: { projectName: true, title: true },
    });
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

    const fc = await prisma.financialComparison.findFirst({
      where: { rfqId, vendorId: evaluation.recommendedVendorId },
    });

    const poNumber = await generatePONumber();

    const result = await prisma.$transaction(async (tx) => {
      // Create PO
      const po = await tx.purchaseOrder.create({
        data: {
          poNumber,
          projectName: rfq.projectName,
          vendorId: evaluation.recommendedVendorId,
          rfqId,
          totalValue: fc?.totalPrice ?? 0,
          currency: fc?.currency ?? 'SAR',
          status: 'DRAFT',
          issuedById: req.user.id,
          ...(fc && {
            items: {
              create: [{
                description: rfq.title || rfq.projectName,
                quantity: fc.quantity,
                unit: 'Set',
                unitPrice: fc.unitPrice,
                totalPrice: fc.totalPrice,
              }],
            },
          }),
        },
      });

      // Update evaluation
      const updatedEval = await tx.evaluationSummary.update({
        where: { rfqId },
        data: {
          approvalStatus: 'APPROVED',
          approvedById: req.user.id,
          approvedAt: new Date(),
          createdPOId: po.id,
        },
        include: {
          recommendedVendor: { select: { id: true, companyLegalName: true, vendorClass: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      });

      return { evaluation: updatedEval, poId: po.id };
    });

    await logAudit(req.user.id, 'EVALUATION_APPROVED', 'EvaluationSummary', evaluation.id, {
      rfqId,
      poId: result.poId,
    });

    res.json(result);
  } catch (error) {
    console.error('Error approving evaluation summary:', error);
    res.status(500).json({ error: 'Failed to approve evaluation summary' });
  }
};

/**
 * PATCH /api/rfqs/:rfqId/evaluation-summary/reject
 */
export const rejectEvaluationSummary = async (req, res) => {
  try {
    const rfqId = parseInt(req.params.rfqId);
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ error: 'rejectionReason is required' });

    const evaluation = await prisma.evaluationSummary.findUnique({ where: { rfqId } });
    if (!evaluation) return res.status(404).json({ error: 'Evaluation summary not found' });

    const updated = await prisma.evaluationSummary.update({
      where: { rfqId },
      data: {
        approvalStatus: 'REJECTED',
        awardJustification: rejectionReason,
      },
      include: {
        recommendedVendor: { select: { id: true, companyLegalName: true, vendorClass: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error rejecting evaluation summary:', error);
    res.status(500).json({ error: 'Failed to reject evaluation summary' });
  }
};
