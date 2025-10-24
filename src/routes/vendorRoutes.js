import express from "express";
import {
  createVendor,
  getVendor,  
  getAllVendors,
  //getVendorById,
  adminUpdateVendor,
  getVendorDetails,
  getMyQualificationDetails,
} from "../controllers/vendorController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public
router.post("/", createVendor);

// Vendor self-management
router.get("/me", authenticateToken, getVendor);

// Admin routes
router.get("/", authenticateToken, getAllVendors);
//router.get("/:id", authenticateToken, getVendorById);
router.put("/:id", authenticateToken, adminUpdateVendor);
router.get('/:id', authenticateToken, getVendorDetails);
router.get("/qualification/me", authenticateToken, getMyQualificationDetails); // <-- ADD THIS ROUTE

export default router;
