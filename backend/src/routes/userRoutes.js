import express from "express";
import {
  createUser,
  getUsers,
  updateUser,
  getAllUsers, // <-- ADD THIS
  toggleUserStatus,
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


// Admin/Procurement Manager Routes (Requires authentication and role check in controller)
router.get('/', authenticateToken, getAllUsers); // GET /api/users
router.patch('/:id/status', authenticateToken, toggleUserStatus); // PATCH /api/users/:id/status


export default router;
