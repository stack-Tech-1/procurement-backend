// backend/src/controllers/advancedApprovalController.js
import advancedApprovalService from '../services/advancedApprovalService.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';
import prisma from '../config/prismaClient.js';


class AdvancedApprovalController {
  
  // Initialize advanced approval
  async initializeAdvancedApproval(req, res) {
    try {
      const { entityType, entityId, entityData } = req.body;
      const userId = req.user.id;

      const result = await advancedApprovalService.initializeAdvancedApproval(
        {
          entityType,
          entityId,
          status: 'PENDING',
          requestedById: userId
        },
        entityData,
        { userId }
      );

      sendSuccess(res, 'Advanced approval workflow initialized', result, 201);
    } catch (error) {
      console.error('Error initializing advanced approval:', error);
      sendError(res, error.message, 500);
    }
  }

  // Get approval progress
  async getApprovalProgress(req, res) {
    try {
      const { approvalId } = req.params;

      const progress = await advancedApprovalService.getApprovalProgress(approvalId);

      sendSuccess(res, 'Approval progress retrieved', progress);
    } catch (error) {
      console.error('Error getting approval progress:', error);
      sendError(res, error.message, 500);
    }
  }

  // Approve/reject step
  async processStepDecision(req, res) {
    try {
      const { stepId } = req.params;
      const { decision, comments } = req.body;
      const userId = req.user.id;

      if (!['APPROVED', 'REJECTED'].includes(decision)) {
        return sendError(res, 'Invalid decision. Must be APPROVED or REJECTED', 400);
      }

      const result = await advancedApprovalService.processStepApproval(
        stepId, 
        userId, 
        decision, 
        comments
      );

      sendSuccess(res, `Step ${decision.toLowerCase()}`, result);
    } catch (error) {
      console.error('Error processing step decision:', error);
      sendError(res, error.message, 500);
    }
  }

  // Escalate step
  async escalateStep(req, res) {
    try {
      const { stepId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      const result = await advancedApprovalService.escalateStep(stepId, reason);

      sendSuccess(res, 'Step escalated successfully', result);
    } catch (error) {
      console.error('Error escalating step:', error);
      sendError(res, error.message, 500);
    }
  }

  // Get pending approvals for user
  async getMyPendingApprovals(req, res) {
    try {
      const userId = req.user.id;
      
      // Get user with role information
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { role: true }
      });

      if (!user) {
        return sendError(res, 'User not found', 404);
      }

      if (!user.role) {
        return sendError(res, 'User role not found', 400);
      }

      const userRole = user.role.id; // Use role ID instead of role name

      console.log(`🔍 Fetching pending approvals for user ${userId} with role ${userRole}`);

      const pendingSteps = await prisma.approvalStep.findMany({
        where: {
          approverRole: userRole,
          status: 'PENDING',
          approval: {
            status: 'PENDING'
          }
        },
        include: {
          approval: {
            include: {
              requestedBy: {
                select: { name: true, email: true }
              },
              workflow: true
            }
          }
        },
        orderBy: { slaDeadline: 'asc' }
      });

      console.log(`📋 Found ${pendingSteps.length} pending approval steps`);

      sendSuccess(res, 'Pending approvals retrieved', pendingSteps);
    } catch (error) {
      console.error('Error getting pending approvals:', error);
      sendError(res, error.message, 500);
    }
  }

  // Create new workflow
  async createWorkflow(req, res) {
    try {
      const { name, description, entityType, conditions, steps } = req.body;
      const userId = req.user.id;

      const workflow = await prisma.approvalWorkflow.create({
        data: {
          name,
          description,
          entityType,
          conditions,
          steps,
          createdById: userId
        }
      });

      sendSuccess(res, 'Workflow created successfully', workflow, 201);
    } catch (error) {
      console.error('Error creating workflow:', error);
      sendError(res, error.message, 500);
    }
  }

  // Get all workflows
  async getWorkflows(req, res) {
    try {
      const workflows = await prisma.approvalWorkflow.findMany({
        include: {
          createdBy: {
            select: { name: true, email: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      sendSuccess(res, 'Workflows retrieved', workflows);
    } catch (error) {
      console.error('Error getting workflows:', error);
      sendError(res, error.message, 500);
    }
  }

  // Get approval progress for a specific approval
  async getApprovalDetails(req, res) {
    try {
      const { approvalId } = req.params;

      const approval = await prisma.approval.findUnique({
        where: { id: approvalId },
        include: {
          steps: {
            orderBy: { stepNumber: 'asc' },
            include: {
              approver: {
                select: { name: true, email: true }
              }
            }
          },
          workflow: true,
          requestedBy: {
            select: { name: true, email: true }
          },
          approver: {
            select: { name: true, email: true }
          }
        }
      });

      if (!approval) {
        return sendError(res, 'Approval not found', 404);
      }

      sendSuccess(res, 'Approval details retrieved', approval);
    } catch (error) {
      console.error('Error getting approval details:', error);
      sendError(res, error.message, 500);
    }
  }
}

export default new AdvancedApprovalController();