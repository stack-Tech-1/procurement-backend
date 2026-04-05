import express from 'express';
import prisma from '../config/prismaClient.js';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';

const router = express.Router();
const MANAGER_PLUS = [1, 2];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthRange(monthsAgo) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0, 23, 59, 59);
  return { start, end };
}

async function calcProjectTotals(projectName) {
  const txs = await prisma.costTransaction.groupBy({
    by: ['transactionType'],
    where: { projectName },
    _sum: { amount: true },
  });
  const result = { committed: 0, invoiced: 0, paid: 0 };
  for (const tx of txs) {
    if (tx.transactionType === 'PO_COMMITMENT') result.committed += tx._sum.amount || 0;
    if (tx.transactionType === 'INVOICE')       result.invoiced  += tx._sum.amount || 0;
    if (tx.transactionType === 'PAYMENT')       result.paid      += tx._sum.amount || 0;
  }
  return result;
}

// ─── GET /summary ─────────────────────────────────────────────────────────────

router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const budgetRows = await prisma.projectBudget.groupBy({
      by: ['projectName'],
      _sum: { budgetAmount: true },
    });

    const now = new Date();
    const results = await Promise.all(
      budgetRows.map(async (row) => {
        const totals = await calcProjectTotals(row.projectName);
        return { projectName: row.projectName, budget: row._sum.budgetAmount || 0, ...totals };
      })
    );

    const totalBudget    = results.reduce((s, r) => s + r.budget, 0);
    const totalCommitted = results.reduce((s, r) => s + r.committed, 0);
    const totalInvoiced  = results.reduce((s, r) => s + r.invoiced, 0);
    const totalPaid      = results.reduce((s, r) => s + r.paid, 0);

    const overBudgetProjects = results
      .filter((r) => r.committed > r.budget)
      .map((r) => ({ projectName: r.projectName, budget: r.budget, committed: r.committed, overBy: r.committed - r.budget }));

    const utilizationByProject = results.map((r) => ({
      projectName: r.projectName,
      budget: r.budget,
      committed: r.committed,
      utilization: r.budget > 0 ? Math.round((r.committed / r.budget) * 100) : 0,
    }));

    const budgetTrend = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const monthsAgo = 5 - i;
        const { start, end } = monthRange(monthsAgo);
        const monthIndex = ((now.getMonth() - monthsAgo) + 12) % 12;
        const [committedM, paidM] = await Promise.all([
          prisma.costTransaction.aggregate({ where: { transactionType: 'PO_COMMITMENT', transactionDate: { gte: start, lte: end } }, _sum: { amount: true } }),
          prisma.costTransaction.aggregate({ where: { transactionType: 'PAYMENT', transactionDate: { gte: start, lte: end } }, _sum: { amount: true } }),
        ]);
        return { month: MONTH_NAMES[monthIndex], committed: committedM._sum.amount || 0, paid: paidM._sum.amount || 0 };
      })
    );

    res.json({ totalProjects: results.length, totalBudget, totalCommitted, totalInvoiced, totalPaid, overBudgetProjects, utilizationByProject, budgetTrend });
  } catch (error) {
    console.error('Budget summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /projects ────────────────────────────────────────────────────────────

router.get('/projects', authenticateToken, authorizeRole(MANAGER_PLUS), async (req, res) => {
  try {
    const budgetRows = await prisma.projectBudget.groupBy({
      by: ['projectName'],
      _sum: { budgetAmount: true },
      orderBy: { projectName: 'asc' },
    });

    const projects = await Promise.all(
      budgetRows.map(async (row) => {
        const totals = await calcProjectTotals(row.projectName);
        const budget = row._sum.budgetAmount || 0;
        return {
          projectName: row.projectName,
          totalBudget: budget,
          ...totals,
          utilizationPercent: budget > 0 ? Math.round((totals.committed / budget) * 100) : 0,
        };
      })
    );

    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /transactions/:projectName/:costCode ─────────────────────────────────

router.get('/transactions/:projectName/:costCode', authenticateToken, async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    const costCode = decodeURIComponent(req.params.costCode);

    const [budgetLine, transactions] = await Promise.all([
      prisma.projectBudget.findUnique({ where: { projectName_costCode: { projectName, costCode } } }),
      prisma.costTransaction.findMany({
        where: { projectName, costCode },
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { transactionDate: 'desc' },
      }),
    ]);

    const committed = transactions.filter((t) => t.transactionType === 'PO_COMMITMENT').reduce((s, t) => s + t.amount, 0);
    const invoiced  = transactions.filter((t) => t.transactionType === 'INVOICE').reduce((s, t) => s + t.amount, 0);
    const paid      = transactions.filter((t) => t.transactionType === 'PAYMENT').reduce((s, t) => s + t.amount, 0);

    res.json({ budgetLine, transactions, summary: { budget: budgetLine?.budgetAmount || 0, committed, invoiced, paid } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /:projectName ────────────────────────────────────────────────────────

router.get('/:projectName', authenticateToken, authorizeRole(MANAGER_PLUS), async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);

    const boqItems = await prisma.projectBudget.findMany({
      where: { projectName },
      orderBy: { costCode: 'asc' },
    });

    if (boqItems.length === 0) {
      return res.json({ projectName, items: [], summary: { totalBudget: 0, totalCommitted: 0, totalInvoiced: 0, totalPaid: 0 } });
    }

    const allTxs = await prisma.costTransaction.findMany({
      where: { projectName },
      select: { costCode: true, transactionType: true, amount: true },
    });

    const txMap = {};
    for (const tx of allTxs) {
      if (!txMap[tx.costCode]) txMap[tx.costCode] = { committed: 0, invoiced: 0, paid: 0 };
      if (tx.transactionType === 'PO_COMMITMENT') txMap[tx.costCode].committed += tx.amount;
      if (tx.transactionType === 'INVOICE')       txMap[tx.costCode].invoiced  += tx.amount;
      if (tx.transactionType === 'PAYMENT')       txMap[tx.costCode].paid      += tx.amount;
    }

    const items = boqItems.map((item) => {
      const txs = txMap[item.costCode] || { committed: 0, invoiced: 0, paid: 0 };
      const variance = item.budgetAmount - txs.committed;
      const variancePercent = item.budgetAmount > 0 ? Math.round((variance / item.budgetAmount) * 100) : 0;
      const utilizationPercent = item.budgetAmount > 0 ? Math.round((txs.committed / item.budgetAmount) * 100) : 0;
      return { ...item, ...txs, variance, variancePercent, utilizationPercent, isOverBudget: txs.committed > item.budgetAmount };
    });

    const summary = {
      totalBudget:    items.reduce((s, i) => s + i.budgetAmount, 0),
      totalCommitted: items.reduce((s, i) => s + i.committed, 0),
      totalInvoiced:  items.reduce((s, i) => s + i.invoiced, 0),
      totalPaid:      items.reduce((s, i) => s + i.paid, 0),
    };
    summary.totalVariance = summary.totalBudget - summary.totalCommitted;
    summary.utilizationPercent = summary.totalBudget > 0 ? Math.round((summary.totalCommitted / summary.totalBudget) * 100) : 0;

    res.json({ projectName, items, summary });
  } catch (error) {
    console.error('Budget project detail error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /projects/:projectName/items ────────────────────────────────────────

router.post('/projects/:projectName/items', authenticateToken, authorizeRole(MANAGER_PLUS), async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    const { costCode, boqDescription, budgetAmount, unit, quantity, unitRate, category } = req.body;

    if (!costCode || !boqDescription || !budgetAmount) {
      return res.status(400).json({ error: 'costCode, boqDescription, and budgetAmount are required' });
    }

    const existing = await prisma.projectBudget.findUnique({ where: { projectName_costCode: { projectName, costCode } } });
    if (existing) return res.status(409).json({ error: `Cost code ${costCode} already exists for this project` });

    const item = await prisma.projectBudget.create({
      data: {
        projectName, costCode, boqDescription,
        budgetAmount: parseFloat(budgetAmount),
        unit: unit || null,
        quantity: quantity ? parseFloat(quantity) : null,
        unitRate: unitRate ? parseFloat(unitRate) : null,
        category: category || null,
        createdById: req.user.id,
      },
    });

    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PUT /projects/:projectName/items/:costCode ───────────────────────────────

router.put('/projects/:projectName/items/:costCode', authenticateToken, authorizeRole(MANAGER_PLUS), async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    const costCode = decodeURIComponent(req.params.costCode);
    const { boqDescription, budgetAmount, unit, quantity, unitRate, category } = req.body;

    const item = await prisma.projectBudget.update({
      where: { projectName_costCode: { projectName, costCode } },
      data: {
        ...(boqDescription && { boqDescription }),
        ...(budgetAmount   && { budgetAmount: parseFloat(budgetAmount) }),
        ...(unit !== undefined && { unit: unit || null }),
        ...(quantity !== undefined && { quantity: quantity ? parseFloat(quantity) : null }),
        ...(unitRate !== undefined && { unitRate: unitRate ? parseFloat(unitRate) : null }),
        ...(category !== undefined && { category: category || null }),
      },
    });

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── DELETE /projects/:projectName/items/:costCode ────────────────────────────

router.delete('/projects/:projectName/items/:costCode', authenticateToken, authorizeRole(MANAGER_PLUS), async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    const costCode = decodeURIComponent(req.params.costCode);

    const txCount = await prisma.costTransaction.count({ where: { projectName, costCode } });
    if (txCount > 0) return res.status(409).json({ error: `Cannot delete: ${txCount} cost transaction(s) exist for this cost code` });

    await prisma.projectBudget.delete({ where: { projectName_costCode: { projectName, costCode } } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /projects/:projectName/import ──────────────────────────────────────

router.post('/projects/:projectName/import', authenticateToken, authorizeRole(MANAGER_PLUS), upload.single('file'), async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];

    const ops = [];
    const errors = [];

    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const vals = row.values;
      const costCode    = String(vals[1] || '').trim();
      const description = String(vals[2] || '').trim();
      const budgetAmt   = parseFloat(vals[3]) || 0;
      const unit        = String(vals[4] || '').trim() || null;
      const quantity    = parseFloat(vals[5]) || null;
      const unitRate    = parseFloat(vals[6]) || null;
      const category    = String(vals[7] || '').trim() || null;

      if (!costCode || !description) { errors.push({ row: rowNum, reason: 'Missing Cost Code or Description' }); return; }
      if (budgetAmt <= 0)            { errors.push({ row: rowNum, reason: 'Budget Amount must be > 0' }); return; }

      ops.push({ costCode, description, budgetAmt, unit, quantity, unitRate, category });
    });

    let imported = 0, updated = 0;
    for (const op of ops) {
      const existing = await prisma.projectBudget.findUnique({ where: { projectName_costCode: { projectName, costCode: op.costCode } } });
      if (existing) {
        await prisma.projectBudget.update({ where: { projectName_costCode: { projectName, costCode: op.costCode } }, data: { boqDescription: op.description, budgetAmount: op.budgetAmt, unit: op.unit, quantity: op.quantity, unitRate: op.unitRate, category: op.category } });
        updated++;
      } else {
        await prisma.projectBudget.create({ data: { projectName, costCode: op.costCode, boqDescription: op.description, budgetAmount: op.budgetAmt, unit: op.unit, quantity: op.quantity, unitRate: op.unitRate, category: op.category, createdById: req.user.id } });
        imported++;
      }
    }

    res.json({ imported, updated, errors });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /projects/:projectName/export ────────────────────────────────────────

router.get('/projects/:projectName/export', authenticateToken, authorizeRole(MANAGER_PLUS), async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    const boqItems = await prisma.projectBudget.findMany({ where: { projectName }, orderBy: { costCode: 'asc' } });

    const allTxs = await prisma.costTransaction.findMany({ where: { projectName }, select: { costCode: true, transactionType: true, amount: true } });
    const txMap = {};
    for (const tx of allTxs) {
      if (!txMap[tx.costCode]) txMap[tx.costCode] = { committed: 0, invoiced: 0, paid: 0 };
      if (tx.transactionType === 'PO_COMMITMENT') txMap[tx.costCode].committed += tx.amount;
      if (tx.transactionType === 'INVOICE')       txMap[tx.costCode].invoiced  += tx.amount;
      if (tx.transactionType === 'PAYMENT')       txMap[tx.costCode].paid      += tx.amount;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('BOQ');
    sheet.columns = [
      { header: 'Cost Code', key: 'costCode', width: 15 },
      { header: 'Description', key: 'boqDescription', width: 40 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Budget (SAR)', key: 'budgetAmount', width: 15 },
      { header: 'Committed (SAR)', key: 'committed', width: 16 },
      { header: 'Invoiced (SAR)', key: 'invoiced', width: 15 },
      { header: 'Paid (SAR)', key: 'paid', width: 15 },
      { header: 'Variance (SAR)', key: 'variance', width: 15 },
      { header: 'Utilization %', key: 'util', width: 14 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1628' } };

    for (const item of boqItems) {
      const txs = txMap[item.costCode] || { committed: 0, invoiced: 0, paid: 0 };
      const variance = item.budgetAmount - txs.committed;
      const util = item.budgetAmount > 0 ? Math.round((txs.committed / item.budgetAmount) * 100) : 0;
      sheet.addRow({ ...item, ...txs, variance, util: `${util}%` });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="BOQ-${projectName}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /transactions ───────────────────────────────────────────────────────

router.post('/transactions', authenticateToken, authorizeRole(MANAGER_PLUS), async (req, res) => {
  try {
    const { projectName, costCode, transactionType, amount, referenceNumber, referenceType, description, transactionDate } = req.body;

    if (!projectName || !costCode || !transactionType || !amount) {
      return res.status(400).json({ error: 'projectName, costCode, transactionType, and amount are required' });
    }

    const budgetLine = await prisma.projectBudget.findUnique({ where: { projectName_costCode: { projectName, costCode } } });
    if (!budgetLine) return res.status(404).json({ error: `No budget line found for ${projectName} / ${costCode}` });

    const tx = await prisma.costTransaction.create({
      data: {
        projectBudgetId: budgetLine.id, projectName, costCode, transactionType,
        amount: parseFloat(amount),
        referenceNumber: referenceNumber || null,
        referenceType: referenceType || null,
        description: description || null,
        transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
        createdById: req.user.id,
      },
    });

    res.status(201).json(tx);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
