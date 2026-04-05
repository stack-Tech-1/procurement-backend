import express from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();

const OFFICER_PLUS = [1, 2, 3];
const MANAGER_PLUS = [1, 2];

// ─── Multer — quotation file uploads ─────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/price-entries/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `quot-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage });

// ─── GET /api/price-entries ───────────────────────────────────────────────────
router.get('/', authenticateToken, authorizeRole(OFFICER_PLUS), async (req, res) => {
  try {
    const { materialId, vendorId, isActive, validOnly, page = 1, limit = 100 } = req.query;
    const now = new Date();

    const where = {};
    if (materialId) where.materialId = parseInt(materialId);
    if (vendorId)   where.vendorId   = parseInt(vendorId);
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (validOnly === 'true') {
      where.isActive = true;
      where.OR = [{ validityDate: null }, { validityDate: { gt: now } }];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [entries, total] = await Promise.all([
      prisma.priceEntry.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          material: { select: { id: true, materialName: true, name: true, csiCode: true, unit: true } },
          vendor:   { select: { id: true, companyLegalName: true, vendorClass: true } },
          createdBy: { select: { name: true } },
        },
      }),
      prisma.priceEntry.count({ where }),
    ]);

    const result = entries.map(e => ({
      ...e,
      materialName: e.material?.materialName || e.material?.name,
      vendorName:   e.vendor?.companyLegalName,
      isExpired:    e.validityDate ? e.validityDate <= now : false,
      priceWithVAT: Math.round(e.unitPrice * (1 + e.vatPercent / 100) * 100) / 100,
    }));

    res.json({ data: result, total, page: parseInt(page) });
  } catch (err) {
    console.error('price-entries list:', err);
    res.status(500).json({ error: 'Failed to fetch price entries' });
  }
});

// ─── POST /api/price-entries ──────────────────────────────────────────────────
router.post('/', authenticateToken, authorizeRole(OFFICER_PLUS), upload.single('quotationFile'), async (req, res) => {
  try {
    const { materialId, vendorId, scope, unitPrice, currency, vatPercent, leadTimeDays, validityDate, quotationReference, notes } = req.body;

    if (!materialId || !vendorId || !unitPrice) {
      return res.status(400).json({ error: 'materialId, vendorId, and unitPrice are required' });
    }

    const quotationFileUrl = req.file ? `/uploads/price-entries/${req.file.filename}` : null;

    const entry = await prisma.priceEntry.create({
      data: {
        materialId:         parseInt(materialId),
        vendorId:           parseInt(vendorId),
        scope:              scope || null,
        unitPrice:          parseFloat(unitPrice),
        currency:           currency || 'SAR',
        vatPercent:         vatPercent ? parseFloat(vatPercent) : 15,
        leadTimeDays:       leadTimeDays ? parseInt(leadTimeDays) : null,
        validityDate:       validityDate ? new Date(validityDate) : null,
        quotationReference: quotationReference || null,
        quotationFileUrl,
        notes:              notes || null,
        isActive:           true,
        createdById:        req.user.id,
      },
      include: {
        material: { select: { materialName: true, name: true, unit: true } },
        vendor:   { select: { companyLegalName: true, vendorClass: true } },
      },
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error('create price entry:', err);
    res.status(500).json({ error: 'Failed to create price entry' });
  }
});

// ─── PUT /api/price-entries/:id ───────────────────────────────────────────────
router.put('/:id', authenticateToken, authorizeRole(OFFICER_PLUS), upload.single('quotationFile'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { scope, unitPrice, currency, vatPercent, leadTimeDays, validityDate, quotationReference, notes, isActive } = req.body;

    const data = {};
    if (scope !== undefined)               data.scope              = scope;
    if (unitPrice !== undefined)           data.unitPrice          = parseFloat(unitPrice);
    if (currency !== undefined)            data.currency           = currency;
    if (vatPercent !== undefined)          data.vatPercent         = parseFloat(vatPercent);
    if (leadTimeDays !== undefined)        data.leadTimeDays       = parseInt(leadTimeDays) || null;
    if (validityDate !== undefined)        data.validityDate       = validityDate ? new Date(validityDate) : null;
    if (quotationReference !== undefined)  data.quotationReference = quotationReference;
    if (notes !== undefined)               data.notes              = notes;
    if (isActive !== undefined)            data.isActive           = isActive === true || isActive === 'true';
    if (req.file)                          data.quotationFileUrl   = `/uploads/price-entries/${req.file.filename}`;

    const updated = await prisma.priceEntry.update({
      where: { id },
      data,
      include: {
        material: { select: { materialName: true, name: true } },
        vendor:   { select: { companyLegalName: true } },
      },
    });
    res.json(updated);
  } catch (err) {
    console.error('update price entry:', err);
    res.status(500).json({ error: 'Failed to update price entry' });
  }
});

// ─── DELETE /api/price-entries/:id ───────────────────────────────────────────
router.delete('/:id', authenticateToken, authorizeRole(MANAGER_PLUS), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.priceEntry.update({ where: { id }, data: { isActive: false } });
    res.json({ message: 'Price entry deactivated successfully' });
  } catch (err) {
    console.error('delete price entry:', err);
    res.status(500).json({ error: 'Failed to delete price entry' });
  }
});

export default router;
