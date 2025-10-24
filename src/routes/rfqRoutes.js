import express from "express";
import {
  createRFQ,
  getRFQs,
  getRFQById,
  updateRFQ,
  deleteRFQ,
} from "../controllers/rfqController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", authenticateToken, createRFQ); 
router.get("/", getRFQs);
router.get("/:id", getRFQById);
router.put("/:id", updateRFQ);
router.delete("/:id", deleteRFQ);

export default router;
