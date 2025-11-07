// backend/src/routes/rfqRoutes.js
import express from "express";
import {
  createRFQ,
  getRFQs,
  getRFQById,
  updateRFQ,
  deleteRFQ,
} from "../controllers/rfqController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Allow Vendors (roleId 2) to view RFQs (for bidding)
router.post("/", authenticateToken, authorizeRole([1, 3, 4, 5, 6]), createRFQ);
router.get("/", authenticateToken, authorizeRole([1, 2, 3, 4, 5, 6, 7]), getRFQs);
router.get("/:id", authenticateToken, authorizeRole([1, 2, 3, 4, 5, 6, 7]), getRFQById);
router.put("/:id", authenticateToken, authorizeRole([1, 3, 4, 5, 6]), updateRFQ);
router.delete("/:id", authenticateToken, authorizeRole([1, 3]), deleteRFQ);

export default router;