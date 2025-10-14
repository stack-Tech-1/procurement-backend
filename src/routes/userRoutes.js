import express from "express";
import {
  createUser,
  getUsers,
  updateUser,
} from "../controllers/userController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// -----------------------------
// ROUTES
// -----------------------------

// Create new user (staff/vendor)
router.post("/", createUser);

// Get all users (Admins only)
router.get("/", authenticateToken, getUsers);

// Approve / Update user (Admins only)
router.patch("/:id", authenticateToken, updateUser);

export default router;
