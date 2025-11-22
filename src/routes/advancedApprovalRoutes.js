// backend/src/routes/advancedApprovalRoutes.js
import express from 'express';
import advancedApprovalController from '../controllers/advancedApprovalController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Workflow management
router.post('/workflows', advancedApprovalController.createWorkflow);
router.get('/workflows', advancedApprovalController.getWorkflows);

// Approval operations
router.post('/initialize', advancedApprovalController.initializeAdvancedApproval);
router.get('/details/:approvalId', advancedApprovalController.getApprovalDetails);
router.get('/progress/:approvalId', advancedApprovalController.getApprovalProgress);
router.post('/steps/:stepId/decision', advancedApprovalController.processStepDecision);
router.post('/steps/:stepId/escalate', advancedApprovalController.escalateStep);
router.get('/my-pending', advancedApprovalController.getMyPendingApprovals);

export default router;