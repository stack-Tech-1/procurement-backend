import express from "express";
import { approveUser } from "../controllers/adminController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Only admins should approve; authorizeRole expects admin role id(s) or checks role name
// If authorizeRole expects ids (e.g., [1]), ensure it matches your seeded role ids.
// You could also implement an authorizeRoleName middleware — but I'll assume your authorizeRole works.
router.put("/approve/:id", authenticateToken, authorizeRole([1]), approveUser);

export default router;
