// backend/src/services/advancedApprovalService.js
import prisma from '../config/prismaClient.js';

class AdvancedApprovalService {
  
  // Determine the appropriate workflow based on entity type and conditions
  async determineWorkflow(entityType, entityData, context) {
    try {
      // Find active workflows for this entity type
      const workflows = await prisma.approvalWorkflow.findMany({
        where: {
          entityType,
          isActive: true
        },
        orderBy: { createdAt: 'desc' }
      });

      // Evaluate conditions for each workflow
      for (const workflow of workflows) {
        if (await this.evaluateConditions(workflow.conditions, entityData, context)) {
          return workflow;
        }
      }

      // Return default workflow if no specific match
      return this.getDefaultWorkflow(entityType, context);
    } catch (error) {
      console.error('Error determining workflow:', error);
      return this.getDefaultWorkflow(entityType, context);
    }
  }

  // Evaluate workflow conditions
  async evaluateConditions(conditions, entityData, context) {
    if (!conditions) return true;

    // Example condition evaluation logic
    for (const condition of conditions) {
      switch (condition.type) {
        case 'VALUE_THRESHOLD':
          if (entityData.value > condition.threshold) {
            return true;
          }
          break;
        case 'DEPARTMENT':
          if (entityData.department === condition.department) {
            return true;
          }
          break;
        case 'RISK_LEVEL':
          if (entityData.riskLevel === condition.riskLevel) {
            return true;
          }
          break;
        case 'PROJECT_TYPE':
          if (entityData.projectType === condition.projectType) {
            return true;
          }
          break;
        default:
          continue;
      }
    }
    return false;
  }

  // Get default workflow for entity type
  getDefaultWorkflow(entityType, context) {
    const defaultWorkflows = {
      'VENDOR': {
        id: 'default-vendor',
        name: 'Default Vendor Qualification',
        steps: [
          { stepNumber: 1, stepName: 'Procurement Officer Review', approverRole: 3, slaHours: 24 },
          { stepNumber: 2, stepName: 'Procurement Manager Approval', approverRole: 2, slaHours: 48 },
          { stepNumber: 3, stepName: 'Head of Procurement Final Approval', approverRole: 1, slaHours: 72 }
        ]
      },
      'RFQ': {
        id: 'default-rfq',
        name: 'Default RFQ Approval',
        steps: [
          { stepNumber: 1, stepName: 'Technical Evaluation', approverRole: 3, slaHours: 24 },
          { stepNumber: 2, stepName: 'Commercial Evaluation', approverRole: 3, slaHours: 24 },
          { stepNumber: 3, stepName: 'Manager Approval', approverRole: 2, slaHours: 48 }
        ]
      },
      'CONTRACT': {
        id: 'default-contract',
        name: 'Default Contract Approval',
        steps: [
          { stepNumber: 1, stepName: 'Legal Review', approverRole: 3, slaHours: 48 },
          { stepNumber: 2, stepName: 'Procurement Manager Approval', approverRole: 2, slaHours: 72 },
          { stepNumber: 3, stepName: 'Director Final Approval', approverRole: 1, slaHours: 96 }
        ]
      }
    };

    return defaultWorkflows[entityType] || defaultWorkflows.VENDOR;
  }

  // Initialize advanced approval workflow
  async initializeAdvancedApproval(approvalData, entityData, context) {
    try {
      const workflow = await this.determineWorkflow(approvalData.entityType, entityData, context);
      
      // Get the next sequence number
      const lastApproval = await prisma.approval.findFirst({
        where: { entityType: approvalData.entityType },
        orderBy: { sequence: 'desc' }
      });
      
      const nextSequence = (lastApproval?.sequence || 0) + 1;

      // Create the main approval record
      const approval = await prisma.approval.create({
        data: {
          ...approvalData,
          sequence: nextSequence, // Add the sequence field
          workflowId: workflow.id,
          totalSteps: workflow.steps.length,
          currentStep: 0,
          parallelApprovals: workflow.parallelApprovals || false,
          slaDeadline: this.calculateSLADeadline(workflow.steps)
        }
      });

      // Create approval steps
      const approvalSteps = [];
      for (const step of workflow.steps) {
        const stepDeadline = this.calculateStepDeadline(step.slaHours);
        
        const approvalStep = await prisma.approvalStep.create({
          data: {
            approvalId: approval.id,
            stepNumber: step.stepNumber,
            stepName: step.stepName,
            approverRole: step.approverRole,
            slaDeadline: stepDeadline,
            status: 'PENDING'
          }
        });
        approvalSteps.push(approvalStep);
      }

      // Start the first step
      await this.startNextStep(approval.id);

      return { approval, steps: approvalSteps };
    } catch (error) {
      console.error('Error initializing advanced approval:', error);
      throw error;
    }
  }

  // Start the next approval step
  async startNextStep(approvalId) {
    try {
      const approval = await prisma.approval.findUnique({
        where: { id: approvalId },
        include: { steps: true }
      });

      const currentStep = approval.currentStep;
      const nextStep = approval.steps.find(step => step.stepNumber === currentStep + 1);

      if (nextStep) {
        // Update approval current step
        await prisma.approval.update({
          where: { id: approvalId },
          data: { currentStep: currentStep + 1 }
        });

        // Notify approvers
        await this.notifyApprovers(nextStep, approval);

        return nextStep;
      } else {
        // All steps completed
        await prisma.approval.update({
          where: { id: approvalId },
          data: { status: 'APPROVED' }
        });

        return null;
      }
    } catch (error) {
      console.error('Error starting next step:', error);
      throw error;
    }
  }

  // Process step approval
  async processStepApproval(stepId, approverId, decision, comments = '') {
    try {
      const step = await prisma.approvalStep.findUnique({
        where: { id: stepId },
        include: { approval: true }
      });

      if (!step) {
        throw new Error('Approval step not found');
      }

      // Update step status
      const updatedStep = await prisma.approvalStep.update({
        where: { id: stepId },
        data: {
          status: decision,
          approverId,
          comments,
          approvedAt: decision === 'APPROVED' ? new Date() : null
        }
      });

      if (decision === 'APPROVED') {
        // Move to next step
        await this.startNextStep(step.approvalId);
      } else if (decision === 'REJECTED') {
        // Reject the entire approval
        await prisma.approval.update({
          where: { id: step.approvalId },
          data: { status: 'REJECTED' }
        });
      }

      return updatedStep;
    } catch (error) {
      console.error('Error processing step approval:', error);
      throw error;
    }
  }

  // Escalate approval step
  async escalateStep(stepId, reason) {
    try {
      const step = await prisma.approvalStep.findUnique({
        where: { id: stepId },
        include: { approval: true }
      });

      // Find escalation approver (typically one level higher)
      const escalationRole = await this.getEscalationRole(step.approverRole);
      
      const escalatedStep = await prisma.approvalStep.update({
        where: { id: stepId },
        data: {
          status: 'ESCALATED',
          escalatedAt: new Date(),
          comments: reason
        }
      });

      // Create new step for escalation approver
      const newStep = await prisma.approvalStep.create({
        data: {
          approvalId: step.approvalId,
          stepNumber: step.stepNumber, // Same step number for escalation
          stepName: `${step.stepName} (Escalated)`,
          approverRole: escalationRole,
          slaDeadline: this.calculateStepDeadline(24), // 24 hours for escalated steps
          status: 'PENDING'
        }
      });

      await this.notifyApprovers(newStep, step.approval);

      return { escalatedStep, newStep };
    } catch (error) {
      console.error('Error escalating step:', error);
      throw error;
    }
  }

  // Get escalation role (one level higher)
  async getEscalationRole(currentRole) {
    const escalationMap = {
      3: 2, // Officer → Manager
      2: 1, // Manager → Director
      1: 1  // Director stays at Director
    };
    return escalationMap[currentRole] || currentRole;
  }

  // Calculate SLA deadline for entire workflow
  calculateSLADeadline(steps) {
    const totalHours = steps.reduce((total, step) => total + (step.slaHours || 72), 0);
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + totalHours);
    return deadline;
  }

  // Calculate step deadline
  calculateStepDeadline(hours = 72) {
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + hours);
    return deadline;
  }

  // Notify approvers
  async notifyApprovers(step, approval) {
    // This would integrate with your notification system
    console.log(`Notifying approvers for step: ${step.stepName}`);
    
    // In a real implementation, this would:
    // 1. Find users with the required role
    // 2. Send email/push notifications
    // 3. Create dashboard alerts
  }

  // Get approval progress
  async getApprovalProgress(approvalId) {
    try {
      const approval = await prisma.approval.findUnique({
        where: { id: approvalId },
        include: {
          steps: {
            orderBy: { stepNumber: 'asc' }
          },
          workflow: true,
          requestedBy: {
            select: { name: true, email: true }
          }
        }
      });

      if (!approval) {
        throw new Error('Approval not found');
      }

      const completedSteps = approval.steps.filter(step => 
        step.status === 'APPROVED' || step.status === 'ESCALATED'
      ).length;

      const progress = {
        currentStep: approval.currentStep,
        totalSteps: approval.totalSteps,
        completedSteps,
        completionPercentage: Math.round((completedSteps / approval.totalSteps) * 100),
        steps: approval.steps,
        workflow: approval.workflow,
        slaStatus: this.checkSLAStatus(approval),
        requestedBy: approval.requestedBy
      };

      return progress;
    } catch (error) {
      console.error('Error getting approval progress:', error);
      throw error;
    }
  }

  // Check SLA status
  checkSLAStatus(approval) {
    const now = new Date();
    const breachedSteps = approval.steps.filter(step => 
      step.slaDeadline && step.slaDeadline < now && step.status === 'PENDING'
    );

    return {
      isBreached: breachedSteps.length > 0,
      breachedSteps: breachedSteps.length,
      nextDeadline: this.getNextDeadline(approval.steps)
    };
  }

  // Get next deadline
  getNextDeadline(steps) {
    const pendingSteps = steps.filter(step => step.status === 'PENDING');
    if (pendingSteps.length === 0) return null;
    
    return pendingSteps.reduce((earliest, step) => 
      step.slaDeadline < earliest ? step.slaDeadline : earliest, 
      pendingSteps[0].slaDeadline
    );
  }
}

export default new AdvancedApprovalService();