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
} from "../controllers/vendorController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRole } from "../middleware/roleMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";

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
router.get("/", authenticateToken, getAllVendors);
router.get("/qualification/me", authenticateToken, getMyQualificationDetails); 
router.get('/list', authenticateToken, getFilteredVendorList);
router.get('/stats', authenticateToken, getVendorStats);

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

// Document upload and verification (must be before generic /:id routes)
router.put('/:id/documents/:docType', authenticateToken, authorizeRole([1, 2, 3]), upload.single('file'), uploadVendorDocument);
router.patch('/:id/documents/:docType/verify', authenticateToken, authorizeRole([1, 2, 3]), verifyVendorDocument);

router.put("/:id", authenticateToken, adminUpdateVendor);
router.get('/:id', authenticateToken, getVendorDetails);

export default router;