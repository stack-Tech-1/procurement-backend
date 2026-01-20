// backend/src/routes/informationRequestRoutes.js (or wherever your routes are)
import express from "express";
import multer from "multer";
import {
  getRequestStats,
  getVendorRequests,
  getRequestDetails,
  submitResponse,
  uploadResponseFile
} from "../controllers/informationRequestController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Vendor routes
router.get("/vendor/requests/stats", authenticateToken, getRequestStats);
router.get("/vendor/requests", authenticateToken, getVendorRequests);
router.get("/vendor/requests/:id", authenticateToken, getRequestDetails);
router.post("/vendor/requests/:id/respond", authenticateToken, submitResponse);
router.post("/vendor/requests/:id/upload-response-file", authenticateToken, upload.single("file"), uploadResponseFile);

export default router;