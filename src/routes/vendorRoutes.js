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
} from "../controllers/vendorController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

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


router.put("/:id", authenticateToken, adminUpdateVendor);
router.get('/:id', authenticateToken, getVendorDetails);
export default router;
