import approvalWorkflowService from '../services/approvalWorkflowService.js';
import prisma from '../config/prismaClient.js';

export class ApprovalWorkflowController {
  
  // Start a new approval workflow
  async startWorkflow(req, res) {
    try {
      const { entityType, entityId, workflowTemplateId } = req.body;
      const initiatorId = req.user.id;

      const workflow = await approvalWorkflowService.startApprovalWorkflow(
        entityType, 
        entityId, 
        workflowTemplateId, 
        initiatorId
      );

      res.json({
        success: true,
        data: workflow
      });
    } catch (error) {
      console.error('Start workflow error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get workflow status
  async getWorkflowStatus(req, res) {
    try {
      const { instanceId } = req.params;
      const workflow = await approvalWorkflowService.getWorkflowStatus(instanceId);

      res.json({
        success: true,
        data: workflow
      });
    } catch (error) {
      console.error('Get workflow status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Approve current step
  async approveStep(req, res) {
    try {
      const { instanceId, stepId } = req.params;
      const { comments, signatureData } = req.body;
      const approverId = req.user.id;

      const workflow = await approvalWorkflowService.approveStep(
        instanceId, 
        stepId, 
        approverId, 
        comments, 
        signatureData
      );

      res.json({
        success: true,
        data: workflow
      });
    } catch (error) {
      console.error('Approve step error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Reject current step
  async rejectStep(req, res) {
    try {
      const { instanceId, stepId } = req.params;
      const { comments } = req.body;
      const approverId = req.user.id;

      const workflow = await approvalWorkflowService.rejectStep(
        instanceId, 
        stepId, 
        approverId, 
        comments
      );

      res.json({
        success: true,
        error: false,
        data: workflow
      });
    } catch (error) {
      console.error('Reject step error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get user's pending approvals
  async getPendingApprovals(req, res) {
    try {
      const userId = req.user.id;
      const userRoles = req.user.roles; // Assuming roles are in user object

      const approvals = await approvalWorkflowService.getPendingApprovals(userId, userRoles);

      res.json({
        success: true,
        data: approvals
      });
    } catch (error) {
      console.error('Get pending approvals error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Initialize default workflows
  async initializeWorkflows(req, res) {
    try {
      await approvalWorkflowService.createDefaultWorkflowTemplates();

      res.json({
        success: true,
        message: 'Default workflow templates created successfully'
      });
    } catch (error) {
      console.error('Initialize workflows error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }



  // Add to ApprovalWorkflowController class
async getPendingApprovalsForUser(req, res) {
  try {
    const userId = req.user.id;
    
    const pendingApprovals = await prisma.approvalAction.findMany({
      where: { 
        approverId: userId,
        status: 'PENDING'
      },
      include: {
        instance: {
          include: {
            workflow: true
          }
        },
        step: true,
        approver: {
          select: { name: true, email: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      success: true,
      data: pendingApprovals
    });
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}




  // Get all approval instances
async getAllApprovalInstances(req, res) {
    try {
      const instances = await prisma.approvalInstance.findMany({
        include: {
          workflow: true,
          approvals: {
            include: {
              step: true,
              approver: {
                select: { id: true, name: true, email: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
  
      res.json({
        success: true,
        data: instances
      });
    } catch (error) {
      console.error('Get all approval instances error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}




export default new ApprovalWorkflowController();