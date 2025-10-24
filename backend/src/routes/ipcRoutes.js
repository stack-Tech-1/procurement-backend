import express from "express";
import { submitIPC, getIPCs, updateIPCStatus } from "../controllers/ipcController.js";
import { authorizeRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Vendor submits IPC
router.post("/", authorizeRole([2]), submitIPC);

// Admin approves/rejects
router.put("/:id", authorizeRole([1]), updateIPCStatus);

// Both Admin & Vendor can view IPCs
router.get("/", authorizeRole([1, 2]), getIPCs);

export default router;
