import express from 'express';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import {
  getTechnicalComparisons,
  upsertTechnicalComparison,
  getFinancialComparisons,
  upsertFinancialComparison,
  markLowestCommercial,
  getEvaluationSummary,
  upsertEvaluationSummary,
  approveEvaluationSummary,
  rejectEvaluationSummary,
} from '../controllers/rfqComparisonController.js';

const router = express.Router();
const prisma = new PrismaClient();
const AUTH = authenticateToken;
const OFFICER_PLUS = authorizeRole([1, 2, 3]);
const MANAGER_PLUS = authorizeRole([1, 2]);

// Technical Comparison
router.get('/:rfqId/technical-comparison', AUTH, getTechnicalComparisons);
router.post('/:rfqId/technical-comparison', AUTH, OFFICER_PLUS, upsertTechnicalComparison);

// Financial Comparison — specific routes before generic
router.patch('/:rfqId/financial-comparison/mark-lowest', AUTH, MANAGER_PLUS, markLowestCommercial);
router.get('/:rfqId/financial-comparison', AUTH, getFinancialComparisons);
router.post('/:rfqId/financial-comparison', AUTH, OFFICER_PLUS, upsertFinancialComparison);

// Evaluation Summary — specific routes before generic
router.patch('/:rfqId/evaluation-summary/approve', AUTH, MANAGER_PLUS, approveEvaluationSummary);
router.patch('/:rfqId/evaluation-summary/reject', AUTH, MANAGER_PLUS, rejectEvaluationSummary);
router.get('/:rfqId/evaluation-summary', AUTH, getEvaluationSummary);
router.post('/:rfqId/evaluation-summary', AUTH, OFFICER_PLUS, upsertEvaluationSummary);

// ─── POST /:rfqId/price-comparison-sheet ─────────────────────────────────────
// Combines FinancialComparison data with CSI material pricing into a matrix
router.post('/:rfqId/price-comparison-sheet', AUTH, OFFICER_PLUS, async (req, res) => {
  try {
    const rfqId = parseInt(req.params.rfqId);
    const { materialIds } = req.body;

    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      select: { id: true, rfqNumber: true, projectName: true, title: true },
    });
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

    // Get all financial comparisons for this RFQ
    const financialComps = await prisma.financialComparison.findMany({
      where: { rfqId },
      include: { vendor: { select: { id: true, companyLegalName: true, vendorClass: true } } },
    });

    // Get distinct vendors from financial comparisons
    const vendorMap = {};
    financialComps.forEach(fc => {
      vendorMap[fc.vendorId] = { id: fc.vendor.id, name: fc.vendor.companyLegalName, class: fc.vendor.vendorClass };
    });
    const vendors = Object.values(vendorMap);

    // Get materials — either from materialIds param or link to RFQ
    let materials = [];
    if (materialIds && materialIds.length > 0) {
      materials = await prisma.cSI_Material.findMany({
        where: { id: { in: materialIds.map(Number) }, isActive: true },
        include: {
          priceEntries: {
            where: { isActive: true, OR: [{ validityDate: null }, { validityDate: { gt: new Date() } }] },
            include: { vendor: { select: { id: true } } },
          },
        },
      });
    }

    // Build matrix: rows = materials, cols = vendors
    const matrix = materials.map(mat => {
      const row = {
        materialId: mat.id,
        materialCode: mat.materialCode,
        materialName: mat.materialName || mat.name,
        unit: mat.unit,
        prices: {},
      };
      mat.priceEntries.forEach(pe => {
        row.prices[pe.vendorId] = { unitPrice: pe.unitPrice, currency: pe.currency, vatPercent: pe.vatPercent };
      });
      // Also fill from financial comparisons if linked
      financialComps.filter(fc => fc.unitPrice).forEach(fc => {
        if (!row.prices[fc.vendorId]) row.prices[fc.vendorId] = { unitPrice: fc.unitPrice, currency: fc.currency || 'SAR', vatPercent: 15 };
      });
      // Flag lowest per row
      const priceVals = Object.values(row.prices).map(p => p.unitPrice).filter(Boolean);
      const lowestInRow = priceVals.length > 0 ? Math.min(...priceVals) : null;
      Object.keys(row.prices).forEach(vid => {
        row.prices[vid].isLowest = lowestInRow !== null && row.prices[vid].unitPrice === lowestInRow;
      });
      return row;
    });

    // Summary: sum of lowest prices
    const totalLowest = matrix.reduce((sum, row) => {
      const vals = Object.values(row.prices).map(p => p.unitPrice).filter(Boolean);
      return sum + (vals.length > 0 ? Math.min(...vals) : 0);
    }, 0);

    res.json({ rfqNumber: rfq.rfqNumber, projectName: rfq.projectName, title: rfq.title, vendors, materials: matrix, summary: { totalLowest, vendorCount: vendors.length, materialCount: matrix.length } });
  } catch (err) {
    console.error('price-comparison-sheet:', err);
    res.status(500).json({ error: 'Failed to generate price comparison sheet' });
  }
});

// ─── GET /:rfqId/price-comparison-sheet/export ────────────────────────────────
router.get('/:rfqId/price-comparison-sheet/export', AUTH, OFFICER_PLUS, async (req, res) => {
  try {
    const rfqId = parseInt(req.params.rfqId);
    const rfq = await prisma.rFQ.findUnique({ where: { id: rfqId }, select: { rfqNumber: true, projectName: true, title: true } });
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

    const financialComps = await prisma.financialComparison.findMany({
      where: { rfqId },
      include: { vendor: { select: { id: true, companyLegalName: true } } },
      orderBy: { unitPrice: 'asc' },
    });

    const vendorMap = {};
    financialComps.forEach(fc => { vendorMap[fc.vendorId] = fc.vendor.companyLegalName; });
    const vendorIds = Object.keys(vendorMap).map(Number);
    const vendorNames = vendorIds.map(id => vendorMap[id]);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Price Comparison');

    // Branding header row
    ws.mergeCells(1, 1, 1, vendorIds.length + 3);
    ws.getCell('A1').value = `KUN REAL ESTATE — Price Comparison Sheet | RFQ: ${rfq.rfqNumber} | ${rfq.projectName}`;
    ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1628' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    // Column header row
    const headerRow = ws.addRow(['#', 'Item Description', 'Unit', ...vendorNames, 'Best Price']);
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1628' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center', wrapText: true };
    });

    // Group by some item grouping — use financialComps directly
    // Group by item description (rfq itemDesc or financialComps)
    const itemGroups = {};
    financialComps.forEach(fc => {
      const key = `${fc.unitPrice}-${fc.vendorId}`;
      if (!itemGroups[fc.vendorId]) itemGroups[fc.vendorId] = {};
      itemGroups[fc.vendorId].unitPrice = fc.unitPrice;
      itemGroups[fc.vendorId].currency  = fc.currency;
    });

    // Single summary row per RFQ item (simplified since no multi-item RFQ structure)
    const allPrices = vendorIds.map(vid => financialComps.find(fc => fc.vendorId === vid)?.unitPrice ?? null);
    const validPrices = allPrices.filter(p => p !== null);
    const lowestPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;

    const dataRow = ws.addRow([1, rfq.title || 'Item 1', '-', ...allPrices.map(p => p ?? 'N/A'), lowestPrice ?? 'N/A']);

    // Highlight lowest price cells in gold
    allPrices.forEach((price, i) => {
      if (price !== null && price === lowestPrice) {
        const cell = dataRow.getCell(4 + i);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8960A' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      }
    });

    // Auto-width columns
    ws.columns.forEach((col, i) => {
      col.width = i === 1 ? 35 : i === 0 ? 6 : 18;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=price-comparison-${rfq.rfqNumber}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('price-comparison-sheet export:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

export default router;
