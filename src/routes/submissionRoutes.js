// backend/src/routes/submissionRoutes.js
import express from "express";
import multer from "multer";
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
const upload = multer({ storage: multer.memoryStorage() });

// Create submission with file upload
router.post("/", authenticateToken, upload.single("submissionFile"), createSubmission);

// Other routes remain the same
router.get("/", authenticateToken, getSubmissions);
router.get("/:id", authenticateToken, getSubmissionById);
router.put("/:id", authenticateToken, updateSubmission);
router.delete("/:id", authenticateToken, deleteSubmission);
router.post("/:id/evaluate", authenticateToken, evaluateSubmission);

export default router;