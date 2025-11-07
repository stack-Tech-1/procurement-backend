// backend/src/routes/contractRoutes.js
import express from "express";
import {
  getContracts,
  getContractById,
  createContract,
  updateContract,
  deleteContract
} from "../controllers/contractController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Allow Vendors (roleId 2) to view contracts they're involved with
router.get("/", authenticateToken, authorizeRole([1, 2, 3, 4, 5, 6, 7]), getContracts);
router.get("/:id", authenticateToken, authorizeRole([1, 2, 3, 4, 5, 6, 7]), getContractById);
router.post("/", authenticateToken, authorizeRole([1, 3, 4, 5, 6]), createContract);
router.put("/:id", authenticateToken, authorizeRole([1, 3, 4, 5, 6]), updateContract);
router.delete("/:id", authenticateToken, authorizeRole([1, 3]), deleteContract);

export default router;