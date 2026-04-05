import express from "express";
import {
  createVendor,
  getVendor,
  getAllVendors,
  getVendorStats,
  adminUpdateVendor,
  getVendorDetails,
  getMyQualificationDetails,
  getFilteredVendorList,
  updateVendorQualification,
  uploadVendorDocument,
  verifyVendorDocument,
  checkCrNumber,
  runAIEvaluation,
  submitEngineerReview,
  adminAction,
  getDocumentAlerts,
} from "../controllers/vendorController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRole } from "../middleware/roleMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";
import { cacheForUser, cachePublic, TTL } from "../middleware/cacheMiddleware.js";
import { cache } from "../services/cacheService.js";

const router = express.Router();

// In vendorRoutes.js, right after router declaration
router.param('id', (req, res, next, id) => {
  console.log('🔍 Vendor ID parameter captured:', {
    id: id,
    isNumber: !isNaN(id),
    parsed: parseInt(id),
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  if (!id || id === 'undefined' || id === 'null') {
    console.error('❌ ERROR: Invalid vendor ID parameter:', id);
    return res.status(400).json({ error: 'Invalid vendor ID' });
  }
  
  next();
});

// Public
router.post("/", createVendor);

// Vendor self-management
router.get("/me", authenticateToken, getVendor);

// Admin routes
router.get("/", authenticateToken, cacheForUser(TTL.MEDIUM), getAllVendors);
router.get("/qualification/me", authenticateToken, getMyQualificationDetails);
router.get('/list', authenticateToken, cacheForUser(TTL.MEDIUM), getFilteredVendorList);
router.get('/stats', authenticateToken, cacheForUser(TTL.MEDIUM), getVendorStats);

// Vendor qualification update - with file upload
router.put(
  '/qualification/update', 
  authenticateToken, 
  upload.fields([ // Use fields instead of array for multiple file types
    { name: 'companyLogo', maxCount: 1 },
    { name: 'files', maxCount: 20 } // For multiple document files
  ]), 
  updateVendorQualification
);

// CR number duplicate check (before /:id to avoid param conflict)
router.get('/check-cr', authenticateToken, cachePublic(TTL.SHORT), checkCrNumber);

// Document expiry alerts for managers/officers (before /:id to avoid param conflict)
router.get('/document-alerts', authenticateToken, authorizeRole([1, 2, 3]), getDocumentAlerts);

// Document upload and verification (must be before generic /:id routes)
router.put('/:id/documents/:docType', authenticateToken, authorizeRole([1, 2, 3]), upload.single('file'), uploadVendorDocument);
router.patch('/:id/documents/:docType/verify', authenticateToken, authorizeRole([1, 2, 3]), verifyVendorDocument);

// Evaluation & admin action (before generic /:id)
router.post('/:id/evaluation/ai', authenticateToken, authorizeRole([1, 2, 3]), runAIEvaluation);
router.post('/:id/evaluation/review', authenticateToken, authorizeRole([1, 2, 3]), submitEngineerReview);
router.post('/:id/qualification/admin-action', authenticateToken, authorizeRole([1, 2, 3]), adminAction);

router.put("/:id", authenticateToken, (req, res, next) => {
  cache.invalidatePrefix('route:');
  next();
}, adminUpdateVendor);
router.get('/:id', authenticateToken, cacheForUser(TTL.MEDIUM), getVendorDetails);

export default router;