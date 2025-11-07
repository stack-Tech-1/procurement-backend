// backend/src/routes/submissionRoutes.js
import express from "express";
import {
  createSubmission,
  getSubmissions,
  getSubmissionById,
  updateSubmission,
  deleteSubmission,
  evaluateSubmission
} from "../controllers/submissionController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", authenticateToken, createSubmission);
router.get("/", authenticateToken, getSubmissions);
router.get("/:id", authenticateToken, getSubmissionById);
router.put("/:id", authenticateToken, updateSubmission);
router.delete("/:id", authenticateToken, deleteSubmission);
router.post("/:id/evaluate", authenticateToken, evaluateSubmission);

export default router;