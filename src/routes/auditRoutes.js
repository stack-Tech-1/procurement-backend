import express from 'express';
import { getAuditLogs } from '../controllers/auditController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// The authorization check is handled in the controller (Admin/Procurement only)
/**
 * GET /api/audit/logs
 * Fetches all audit log data.
 */
router.get('/logs', authenticateToken, getAuditLogs);

export default router;