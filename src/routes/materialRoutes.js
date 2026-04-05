import express from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();

const OFFICER_PLUS = [1, 2, 3];
const MANAGER_PLUS = [1, 2];

// ─── Multer — for import ─────────────────────────────────────────────────────
const importStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/materials/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `import-${Date.now()}${path.extname(file.originalname)}`),
});
const uploadImport = multer({ storage: importStorage });

// ─── Multer — for image upload ────────────────────────────────────────────────
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/material-images/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `mat-${Date.now()}${path.extname(file.originalname)}`),
});
const uploadImage = multer({ storage: imageStorage });

// ─── Auto-generate materialCode ───────────────────────────────────────────────
async function generateMaterialCode(csiDivision) {
  const prefix = `MAT-${(csiDivision || 'GEN').replace(/\s/g, '').substring(0, 3).toUpperCase()}-`;
  const last = await prisma.cSI_Material.findFirst({
    where: { materialCode: { startsWith: prefix } },
    orderBy: { materialCode: 'desc' },
  });
  const seq = last ? parseInt(last.materialCode.slice(-4)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ─── GET /api/materials/stats ─────────────────────────────────────────────────
router.get('/stats', authenticateToken, authorizeRole(OFFICER_PLUS), async (req, res) => {
  try {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, withPricing, activePriceEntries, expiringThisMonth] = await Promise.all([
      prisma.cSI_Material.count({ where: { isActive: true } }),
      prisma.cSI_Material.count({ where: { isActive: true, priceEntries: { some: { isActive: true } } } }),
      prisma.priceEntry.count({ where: { isActive: true } }),
      prisma.priceEntry.count({ where: { isActive: true, validityDate: { gte: startOfMonth, lte: endOfMonth } } }),
    ]);

    res.json({ total, withPricing, activePriceEntries, expiringThisMonth });
  } catch (err) {
    console.error('materials stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── GET /api/materials/export ────────────────────────────────────────────────
router.get('/export', authenticateToken, authorizeRole(OFFICER_PLUS), async (req, res) => {
  try {
    const materials = await prisma.cSI_Material.findMany({
      where: { isActive: true },
      include: {
        priceEntries: {
          where: { isActive: true },
          orderBy: { unitPrice: 'asc' },
          include: { vendor: { select: { companyLegalName: true } } },
        },
      },
      orderBy: { materialCode: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Materials');

    ws.columns = [
      { header: 'Material Code', key: 'materialCode', width: 18 },
      { header: 'CSI Code',      key: 'csiCode',      width: 14 },
      { header: 'CSI Division',  key: 'csiDivision',  width: 18 },
      { header: 'Material Name', key: 'materialName', width: 35 },
      { header: 'Type',          key: 'materialType', width: 18 },
      { header: 'Unit',          key: 'unit',         width: 10 },
      { header: 'Vendors',       key: 'vendors',      width: 10 },
      { header: 'Lowest Price (SAR)', key: 'lowestPrice', width: 18 },
      { header: 'Std Price (SAR)',    key: 'stdPrice',     width: 16 },
    ];

    // Navy header
    ws.getRow(1).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1628' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    });

    materials.forEach(m => {
      ws.addRow({
        materialCode: m.materialCode || '',
        csiCode:      m.csiCode || '',
        csiDivision:  m.csiDivision || '',
        materialName: m.materialName || m.name,
        materialType: m.materialType || '',
        unit:         m.unit || '',
        vendors:      m.priceEntries.length,
        lowestPrice:  m.priceEntries[0]?.unitPrice ?? '',
        stdPrice:     m.standardPrice ?? '',
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=materials-export.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('materials export:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ─── POST /api/materials/import ───────────────────────────────────────────────
router.post('/import', authenticateToken, authorizeRole(MANAGER_PLUS), uploadImport.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(req.file.path);
    const ws = wb.worksheets[0];

    let imported = 0, updated = 0;
    const errors = [];

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const [, csiCode, csiDivision, materialName, materialType, unit, standardPriceRaw, currency, specs] = row.values;
      if (!materialName) return;
      rowData.push({ csiCode, csiDivision, materialName: String(materialName), materialType, unit, standardPrice: parseFloat(standardPriceRaw) || null, currency: currency || 'SAR', specs });
    });

    const rowData = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const vals = row.values;
      const csiCode      = vals[1] ? String(vals[1]) : null;
      const csiDivision  = vals[2] ? String(vals[2]) : null;
      const materialName = vals[3] ? String(vals[3]) : null;
      const materialType = vals[4] ? String(vals[4]) : null;
      const unit         = vals[5] ? String(vals[5]) : null;
      const standardPrice = vals[6] ? parseFloat(vals[6]) : null;
      const currency     = vals[7] ? String(vals[7]) : 'SAR';
      const specs        = vals[8] ? String(vals[8]) : null;
      if (materialName) rowData.push({ csiCode, csiDivision, materialName, materialType, unit, standardPrice, currency, specs });
    });

    for (const row of rowData) {
      try {
        const existing = await prisma.cSI_Material.findFirst({
          where: {
            OR: [
              { materialName: row.materialName },
              ...(row.csiCode ? [{ csiCode: row.csiCode, name: row.materialName }] : []),
            ],
          },
        });
        if (existing) {
          await prisma.cSI_Material.update({ where: { id: existing.id }, data: { ...row, name: row.materialName } });
          updated++;
        } else {
          const materialCode = await generateMaterialCode(row.csiDivision);
          await prisma.cSI_Material.create({ data: { materialCode, name: row.materialName, ...row, createdById: req.user.id } });
          imported++;
        }
      } catch (e) {
        errors.push({ row: row.materialName, error: e.message });
      }
    }

    // Clean up temp file
    fs.unlink(req.file.path, () => {});
    res.json({ imported, updated, errors, total: imported + updated });
  } catch (err) {
    console.error('materials import:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});

// ─── GET /api/materials ────────────────────────────────────────────────────────
router.get('/', authenticateToken, authorizeRole(OFFICER_PLUS), async (req, res) => {
  try {
    const { search, csiDivision, materialType, hasPrice, validPricesOnly, page = 1, limit = 50 } = req.query;
    const now = new Date();

    const where = { isActive: true };
    if (csiDivision) where.csiDivision = csiDivision;
    if (materialType) where.materialType = materialType;
    if (search) {
      where.OR = [
        { materialName: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { materialCode: { contains: search, mode: 'insensitive' } },
        { csiCode: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (hasPrice === 'true') where.priceEntries = { some: { isActive: true } };
    if (validPricesOnly === 'true') {
      where.priceEntries = { some: { isActive: true, OR: [{ validityDate: null }, { validityDate: { gt: now } }] } };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [materials, total] = await Promise.all([
      prisma.cSI_Material.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { materialCode: 'asc' },
        include: {
          _count: { select: { priceEntries: { where: { isActive: true } } } },
          priceEntries: {
            where: { isActive: true, OR: [{ validityDate: null }, { validityDate: { gt: now } }] },
            orderBy: { unitPrice: 'asc' },
            take: 1,
            select: { unitPrice: true, currency: true },
          },
        },
      }),
      prisma.cSI_Material.count({ where }),
    ]);

    const result = materials.map(m => ({
      ...m,
      vendorCount: m._count.priceEntries,
      lowestPrice: m.priceEntries[0]?.unitPrice ?? null,
      lowestPriceCurrency: m.priceEntries[0]?.currency ?? 'SAR',
    }));

    res.json({ data: result, total, page: parseInt(page) });
  } catch (err) {
    console.error('materials list:', err);
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

// ─── POST /api/materials ───────────────────────────────────────────────────────
router.post('/', authenticateToken, authorizeRole(MANAGER_PLUS), uploadImage.single('image'), async (req, res) => {
  try {
    const { csiCode, csiDivision, materialName, materialNameAr, materialType, unit, standardPrice, currency, defaultVendorId, specs, notes } = req.body;
    if (!materialName) return res.status(400).json({ error: 'materialName is required' });

    const materialCode = await generateMaterialCode(csiDivision);
    const imageUrl = req.file ? `/uploads/material-images/${req.file.filename}` : null;

    const material = await prisma.cSI_Material.create({
      data: {
        materialCode,
        csiCode: csiCode || null,
        csiDivision: csiDivision || null,
        name: materialName,
        materialName,
        materialNameAr: materialNameAr || null,
        materialType: materialType || null,
        unit: unit || null,
        standardPrice: standardPrice ? parseFloat(standardPrice) : null,
        currency: currency || 'SAR',
        defaultVendorId: defaultVendorId ? parseInt(defaultVendorId) : null,
        specs: specs || null,
        notes: notes || null,
        imageUrl,
        createdById: req.user.id,
      },
    });
    res.status(201).json(material);
  } catch (err) {
    console.error('create material:', err);
    res.status(500).json({ error: 'Failed to create material' });
  }
});

// ─── GET /api/materials/:id/price-history ─────────────────────────────────────
router.get('/:id/price-history', authenticateToken, authorizeRole(OFFICER_PLUS), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entries = await prisma.priceEntry.findMany({
      where: { materialId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { companyLegalName: true, vendorClass: true } },
        createdBy: { select: { name: true } },
      },
    });

    const now = new Date();
    const result = entries.map(e => ({
      id: e.id,
      vendorId: e.vendorId,
      vendorName: e.vendor.companyLegalName,
      vendorClass: e.vendor.vendorClass,
      unitPrice: e.unitPrice,
      currency: e.currency,
      vatPercent: e.vatPercent,
      validityDate: e.validityDate,
      isCurrentlyValid: e.isActive && (!e.validityDate || e.validityDate > now),
      quotationReference: e.quotationReference,
      createdBy: e.createdBy?.name || null,
      createdAt: e.createdAt,
    }));

    res.json(result);
  } catch (err) {
    console.error('price history:', err);
    res.status(500).json({ error: 'Failed to fetch price history' });
  }
});

// ─── GET /api/materials/:id/price-comparison ──────────────────────────────────
router.get('/:id/price-comparison', authenticateToken, authorizeRole(OFFICER_PLUS), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const now = new Date();

    const material = await prisma.cSI_Material.findUnique({ where: { id }, select: { materialName: true, name: true, unit: true, csiCode: true } });
    if (!material) return res.status(404).json({ error: 'Material not found' });

    const entries = await prisma.priceEntry.findMany({
      where: { materialId: id, isActive: true, OR: [{ validityDate: null }, { validityDate: { gt: now } }] },
      orderBy: { unitPrice: 'asc' },
      include: { vendor: { select: { id: true, companyLegalName: true, vendorClass: true, paymentTerms: true } } },
    });

    if (entries.length === 0) {
      return res.json({ materialName: material.materialName || material.name, unit: material.unit, entries: [], summary: { lowestPrice: null, highestPrice: null, averagePrice: null, priceRange: null, vendorCount: 0, lastUpdated: null } });
    }

    const lowestPrice = entries[0].unitPrice;
    const result = entries.map(e => ({
      vendorId: e.vendor.id,
      vendorName: e.vendor.companyLegalName,
      vendorClass: e.vendor.vendorClass,
      unitPrice: e.unitPrice,
      currency: e.currency,
      vatPercent: e.vatPercent,
      priceWithVAT: Math.round(e.unitPrice * (1 + e.vatPercent / 100) * 100) / 100,
      leadTimeDays: e.leadTimeDays,
      paymentTerms: e.vendor.paymentTerms,
      validityDate: e.validityDate,
      isLowest: e.unitPrice === lowestPrice,
      varianceFromLowest: lowestPrice > 0 ? Math.round(((e.unitPrice - lowestPrice) / lowestPrice) * 10000) / 100 : 0,
      quotationReference: e.quotationReference,
      quotationFileUrl: e.quotationFileUrl,
    }));

    const prices = entries.map(e => e.unitPrice);
    const highestPrice = Math.max(...prices);
    const averagePrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100;

    res.json({
      materialName: material.materialName || material.name,
      unit: material.unit,
      entries: result,
      summary: {
        lowestPrice,
        highestPrice,
        averagePrice,
        priceRange: Math.round((highestPrice - lowestPrice) * 100) / 100,
        vendorCount: result.length,
        lastUpdated: entries[0]?.createdAt || null,
      },
    });
  } catch (err) {
    console.error('price comparison:', err);
    res.status(500).json({ error: 'Failed to fetch price comparison' });
  }
});

// ─── GET /api/materials/:id ───────────────────────────────────────────────────
router.get('/:id', authenticateToken, authorizeRole(OFFICER_PLUS), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const material = await prisma.cSI_Material.findUnique({
      where: { id },
      include: {
        defaultVendor: { select: { id: true, companyLegalName: true, vendorClass: true } },
        priceEntries: {
          where: { isActive: true },
          orderBy: { unitPrice: 'asc' },
          include: { vendor: { select: { id: true, companyLegalName: true, vendorClass: true } } },
        },
        createdBy: { select: { name: true } },
      },
    });
    if (!material) return res.status(404).json({ error: 'Material not found' });
    res.json(material);
  } catch (err) {
    console.error('material detail:', err);
    res.status(500).json({ error: 'Failed to fetch material' });
  }
});

// ─── PUT /api/materials/:id ────────────────────────────────────────────────────
router.put('/:id', authenticateToken, authorizeRole(MANAGER_PLUS), uploadImage.single('image'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { csiCode, csiDivision, materialName, materialNameAr, materialType, unit, standardPrice, currency, defaultVendorId, specs, notes } = req.body;

    const data = {};
    if (csiCode !== undefined)       data.csiCode = csiCode;
    if (csiDivision !== undefined)   data.csiDivision = csiDivision;
    if (materialName !== undefined)  { data.materialName = materialName; data.name = materialName; }
    if (materialNameAr !== undefined) data.materialNameAr = materialNameAr;
    if (materialType !== undefined)  data.materialType = materialType;
    if (unit !== undefined)          data.unit = unit;
    if (standardPrice !== undefined) data.standardPrice = parseFloat(standardPrice) || null;
    if (currency !== undefined)      data.currency = currency;
    if (defaultVendorId !== undefined) data.defaultVendorId = defaultVendorId ? parseInt(defaultVendorId) : null;
    if (specs !== undefined)         data.specs = specs;
    if (notes !== undefined)         data.notes = notes;
    if (req.file)                    data.imageUrl = `/uploads/material-images/${req.file.filename}`;

    const updated = await prisma.cSI_Material.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    console.error('update material:', err);
    res.status(500).json({ error: 'Failed to update material' });
  }
});

// ─── DELETE /api/materials/:id ────────────────────────────────────────────────
router.delete('/:id', authenticateToken, authorizeRole(MANAGER_PLUS), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const activePrices = await prisma.priceEntry.count({ where: { materialId: id, isActive: true } });
    if (activePrices > 0) return res.status(400).json({ error: 'Cannot delete material with active price entries. Deactivate them first.' });

    await prisma.cSI_Material.update({ where: { id }, data: { isActive: false } });
    res.json({ message: 'Material deactivated successfully' });
  } catch (err) {
    console.error('delete material:', err);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

export default router;
