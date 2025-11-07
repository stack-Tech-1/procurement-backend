import express from "express";
import {
  createUser,
  //getUsers,
  updateUser,
  getAllUsers, // <-- ADD THIS
  toggleUserStatus,
  getRolePermissions,
  updateRolePermissions,
  updateUserProfile,
  getUserAuditLogs
} from "../controllers/userController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// -----------------------------
// ROUTES
// -----------------------------

// Create new user (staff/vendor)
router.post("/", createUser);

// Get all users (Admins only)
router.get("/", authenticateToken, getAllUsers);

// Approve / Update user (Admins only)
router.patch("/:id", authenticateToken, updateUser);


// Admin/Procurement Manager Routes (Requires authentication and role check in controller)
router.get('/', authenticateToken, getAllUsers); // GET /api/users
router.patch('/:id/status', authenticateToken, toggleUserStatus); // PATCH /api/users/:id/status

// New routes for user management
router.get('/permissions/roles', authenticateToken, getRolePermissions);
router.put('/permissions/roles', authenticateToken, updateRolePermissions);
router.patch('/:id', authenticateToken, updateUserProfile);
// In your userRoutes.js
router.get('/:id/audit-logs', authenticateToken, getUserAuditLogs);



export default router;
