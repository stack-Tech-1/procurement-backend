import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { authorizeRole } from '../../middleware/roleMiddleware.js';
import { uploadToS3, generatePresignedUrl, getPublicUrl } from '../../lib/awsS3.js';
import {
  getQualificationDraft,
  saveQualificationDraft,
  submitQualification,
} from '../../controllers/vendorController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const AUTH = authenticateToken;
const VENDOR_ONLY = authorizeRole([4]);

// ─── Draft & Submission ───────────────────────────────────────────────────────
router.get('/draft', AUTH, VENDOR_ONLY, getQualificationDraft);
router.post('/save-draft', AUTH, VENDOR_ONLY, saveQualificationDraft);
router.post('/submit', AUTH, VENDOR_ONLY, submitQualification);

// ─── Presigned URL for document access ───────────────────────────────────────
router.get('/documents/:key/url', AUTH, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    // Validate caller owns this vendor
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id } });
    if (!vendor) return res.status(403).json({ error: 'Access denied' });

    const signedUrl = await generatePresignedUrl(key, 3600);
    if (!signedUrl) return res.status(404).json({ error: 'Could not generate URL' });
    res.json({ url: signedUrl });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ error: 'Failed to generate URL' });
  }
});

export default router;
