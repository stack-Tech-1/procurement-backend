// backend/src/routes/ipcRoutes.js
import express from "express";
import {
  createIPC,
  getIPCs,
  getIPCById,
  updateIPC,
  updateIPCStatus,
  deleteIPC
} from "../controllers/ipcController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Allow Vendors (roleId 2) to view IPCs for their contracts
router.post("/", authenticateToken, authorizeRole([1, 2, 3, 4, 5, 6]), createIPC);
router.get("/", authenticateToken, authorizeRole([1, 2, 3, 4, 5, 6, 7]), getIPCs);
router.get("/:id", authenticateToken, authorizeRole([1, 2, 3, 4, 5, 6, 7]), getIPCById);
router.put("/:id", authenticateToken, authorizeRole([1, 3, 4, 5, 6]), updateIPC);
router.patch("/:id/status", authenticateToken, authorizeRole([1, 3, 4, 5, 6, 7]), updateIPCStatus);
router.delete("/:id", authenticateToken, authorizeRole([1, 3]), deleteIPC);

export default router;