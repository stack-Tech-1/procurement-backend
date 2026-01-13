import express from 'express';
import { ApprovalWorkflowController } from '../controllers/approvalWorkflowController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();
const approvalController = new ApprovalWorkflowController();

// Apply authentication to all routes
router.use(authenticateToken);

// Approval workflow routes
router.post('/start', approvalController.startWorkflow.bind(approvalController));
router.get('/status/:instanceId', approvalController.getWorkflowStatus.bind(approvalController));
router.post('/:instanceId/steps/:stepId/approve', approvalController.approveStep.bind(approvalController));
router.post('/:instanceId/steps/:stepId/reject', approvalController.rejectStep.bind(approvalController));
router.get('/pending', approvalController.getPendingApprovals.bind(approvalController));
router.post('/initialize', approvalController.initializeWorkflows.bind(approvalController));
router.get('/instances', approvalController.getAllApprovalInstances.bind(approvalController));
router.get('/pending', approvalController.getPendingApprovalsForUser);

export default router;