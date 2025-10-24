import express from "express";
import { 
    approveUser, 
    approveSubmission, // <-- Imported directly
    rejectSubmission,  // <-- Imported directly
    getPendingSubmissions // <-- Added for completeness of the dashboard
} from "../controllers/adminController.js"; 
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRole } from "../middleware/roleMiddleware.js";


const router = express.Router();

// Assuming role ID '1' is the Admin role.
const ADMIN_ROLE_ID = [1]; 

// Route to fetch all pending submissions (GET /api/admin/submissions/pending)
router.get('/submissions/pending', authenticateToken, authorizeRole(ADMIN_ROLE_ID), getPendingSubmissions);

router.put("/approve/:id", authenticateToken, authorizeRole(ADMIN_ROLE_ID), approveUser);

// Use the imported functions directly as the controller: approveSubmission
router.put('/submissions/:id/approve', authenticateToken, authorizeRole(ADMIN_ROLE_ID), approveSubmission);

// Use the imported functions directly as the controller: rejectSubmission
router.put('/submissions/:id/reject', authenticateToken, authorizeRole(ADMIN_ROLE_ID), rejectSubmission);

// ... other admin routes

export default router;
