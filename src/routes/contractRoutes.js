import express from "express";
import {
  createContract,
  getContracts,
  getContractById,
  updateContract,
  deleteContract,
} from "../controllers/contractController.js";
import { authorizeRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Admin only can create, update, delete contracts
router.post("/", authorizeRole([1]), createContract);
router.put("/:id", authorizeRole([1]), updateContract);
router.delete("/:id", authorizeRole([1]), deleteContract);

// Admin and Vendor can view
router.get("/", authorizeRole([1, 2]), getContracts);
router.get("/:id", authorizeRole([1, 2]), getContractById);

export default router;
