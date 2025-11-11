import prisma from '../config/prismaClient.js';

export class ApprovalWorkflowService {
  
  // Start a new approval workflow for an entity
  async startApprovalWorkflow(entityType, entityId, workflowTemplateId, initiatorId) {

    try {
        // First, check if an approval instance already exists for this entity
        const existingInstance = await prisma.approvalInstance.findUnique({
          where: {
            entityType_entityId: {
              entityType,
              entityId
            }
          },
          include: {
            workflow: {
              include: { steps: { orderBy: { sequence: 'asc' } } }
            },
            approvals: {
              include: {
                step: true,
                approver: {
                  select: { id: true, name: true, email: true }
                }
              }
            }
          }
        });
    
        // If an instance exists, return it instead of creating a new one
        if (existingInstance) {
          console.log(`⏭️ Approval workflow already exists for ${entityType} ${entityId}`);
          return existingInstance;
        }

    const workflow = await prisma.approvalWorkflowTemplate.findUnique({
      where: { id: workflowTemplateId },
      include: { steps: { orderBy: { sequence: 'asc' } } }
    });

    if (!workflow) {
      throw new Error('Workflow template not found');
    }

    // Create approval instance
    const approvalInstance = await prisma.approvalInstance.create({
        data: {
          entityType,
          entityId,
          workflowId: workflowTemplateId,
          status: 'PENDING',
          currentStep: 0
        }
      });

    // Create initial approval actions for all steps
    const approvalActions = await Promise.all(
        workflow.steps.map(step =>
          prisma.approvalAction.create({
            data: {
              instanceId: approvalInstance.id,
              stepId: step.id,
              approverId: null,
              status: 'PENDING'
            }
          })
        )
      );

    // Start the first step
    await this.advanceToNextStep(approvalInstance.id, initiatorId);

    return await prisma.approvalInstance.findUnique({
        where: { id: approvalInstance.id },
        include: {
          workflow: {
            include: { steps: { orderBy: { sequence: 'asc' } } }
          },
          approvals: {
            include: {
              step: true,
              approver: {
                select: { id: true, name: true, email: true }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error in startApprovalWorkflow:', error);
      throw error;
    }
  }

  // Advance to the next approval step
  async advanceToNextStep(instanceId, actorId) {
    const instance = await prisma.approvalInstance.findUnique({
      where: { id: instanceId },
      include: {
        workflow: {
          include: { 
            steps: { 
              orderBy: { sequence: 'asc' },
              include: { role: true }
            } 
          }
        },
        approvals: {
          include: { step: true }
        }
      }
    });
  
    if (!instance) {
      throw new Error('Approval instance not found');
    }
  
    const currentStepIndex = instance.currentStep;
    const nextStep = instance.workflow.steps[currentStepIndex];
  
    if (!nextStep) {
      // No more steps - workflow is complete
      await prisma.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'APPROVED' }
      });
      return this.getWorkflowStatus(instanceId);
    }
  
    // Find a user with the required role to assign as approver
    const potentialApprover = await prisma.user.findFirst({
      where: { 
        roleId: nextStep.roleId,
        isActive: true
      },
      select: { id: true, name: true, email: true }
    });
  
    if (!potentialApprover) {
      console.warn(`⚠️ No active user found with role: ${nextStep.role.name}`);
      // For now, assign to the actor as fallback
      var approverId = actorId;
    } else {
      var approverId = potentialApprover.id;
    }
  
    // Update the approval action for this step
    await prisma.approvalAction.updateMany({
      where: {
        instanceId: instanceId,
        stepId: nextStep.id
      },
      data: {
        approverId: approverId,
        status: 'PENDING'
      }
    });
  
    // Update instance to current step
    await prisma.approvalInstance.update({
      where: { id: instanceId },
      data: {
        currentStep: currentStepIndex + 1,
        status: 'IN_PROGRESS'
      }
    });
  
    // Send notifications to the assigned approver
    await this.notifyApprover(instanceId, nextStep.id);
  
    return this.getWorkflowStatus(instanceId);
  }

  // Approve current step
  async approveStep(instanceId, stepId, approverId, comments = '', signatureData = null) {
    const approval = await prisma.approvalAction.findUnique({
      where: {
        instanceId_stepId: {
          instanceId,
          stepId
        }
      },
      include: {
        instance: true
      }
    });

    if (!approval) {
      throw new Error('Approval action not found');
    }

    if (approval.approverId !== approverId) {
      throw new Error('User not authorized to approve this step');
    }

    // Update approval action
    await prisma.approvalAction.update({
      where: {
        instanceId_stepId: {
          instanceId,
          stepId
        }
      },
      data: {
        status: 'APPROVED',
        comments,
        signedAt: new Date(),
        signatureData
      }
    });

    // Advance to next step or complete workflow
    return await this.advanceToNextStep(instanceId, approverId);
  }

  // Reject step and optionally restart workflow
  async rejectStep(instanceId, stepId, approverId, comments = '') {
    const approval = await prisma.approvalAction.findUnique({
      where: {
        instanceId_stepId: {
          instanceId,
          stepId
        }
      }
    });

    if (!approval) {
      throw new Error('Approval action not found');
    }

    // Update approval action
    await prisma.approvalAction.update({
      where: {
        instanceId_stepId: {
          instanceId,
          stepId
        }
      },
      data: {
        status: 'REJECTED',
        comments
      }
    });

    // Update instance status
    await prisma.approvalInstance.update({
      where: { id: instanceId },
      data: { status: 'REJECTED' }
    });

    return this.getWorkflowStatus(instanceId);
  }

  // Get current workflow status
  async getWorkflowStatus(instanceId) {
    return await prisma.approvalInstance.findUnique({
      where: { id: instanceId },
      include: {
        workflow: {
          include: { steps: { orderBy: { sequence: 'asc' } } }
        },
        approvals: {
          include: {
            step: true,
            approver: {
              select: { id: true, name: true, email: true, jobTitle: true }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
  }

  // Get pending approvals for a user
  async getPendingApprovals(userId, userRoles) {
    return await prisma.approvalAction.findMany({
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
        step: true
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  // Notify approver (placeholder for notification service integration)
  async notifyApprover(instanceId, stepId) {
    // Integrate with your notification service
    console.log(`Notifying approver for instance ${instanceId}, step ${stepId}`);
    // await notificationService.sendApprovalNotification(instanceId, stepId);
  }

  // Create default workflow templates
  // In backend/src/services/approvalWorkflowService.js
async createDefaultWorkflowTemplates() {
    try {
      console.log('🔄 Creating default workflow templates...');
  
      const defaultTemplates = [
        {
          id: 'vendor-qualification-workflow',
          name: 'Vendor Qualification Workflow',
          category: 'VENDOR_QUALIFICATION',
          description: 'Standard workflow for vendor qualification and approval',
          steps: [
            { sequence: 1, roleName: 'PROCUREMENT_ENGINEER', isRequired: true },
            { sequence: 2, roleName: 'PROCUREMENT_MANAGER', isRequired: true },
            { sequence: 3, roleName: 'COST_MANAGER', isRequired: false, minAmount: 50000 },
            { sequence: 4, roleName: 'DIRECTOR', isRequired: false, minAmount: 100000 }
          ]
        },
        {
          id: 'contract-approval-workflow', 
          name: 'Contract Approval Workflow',
          category: 'CONTRACT',
          description: 'Workflow for contract review and approval',
          steps: [
            { sequence: 1, roleName: 'PROCUREMENT_MANAGER', isRequired: true },
            { sequence: 2, roleName: 'LEGAL_REVIEWER', isRequired: true },
            { sequence: 3, roleName: 'DIRECTOR', isRequired: false, minAmount: 50000 }
          ]
        },
        {
          id: 'purchase-order-workflow',
          name: 'Purchase Order Workflow', 
          category: 'PO',
          description: 'Workflow for purchase order approval',
          steps: [
            { sequence: 1, roleName: 'PROCUREMENT_ENGINEER', isRequired: true },
            { sequence: 2, roleName: 'PROCUREMENT_MANAGER', isRequired: true }
          ]
        }
      ];
  
      let createdCount = 0;
  
      for (const templateData of defaultTemplates) {
        // Check if template already exists
        const existing = await prisma.approvalWorkflowTemplate.findUnique({
          where: { id: templateData.id }
        });
  
        if (!existing) {
          console.log(`📋 Creating template: ${templateData.name}`);
          
          // Get role IDs for the role names
          const stepsWithRoleIds = [];
          
          for (const step of templateData.steps) {
            const role = await prisma.role.findFirst({
              where: { name: step.roleName }
            });
            
            if (!role) {
              console.warn(`⚠️ Role not found: ${step.roleName}. Skipping step.`);
              continue;
            }
            
            stepsWithRoleIds.push({
              sequence: step.sequence,
              roleId: role.id,
              isRequired: step.isRequired,
              minAmount: step.minAmount,
              maxAmount: step.maxAmount
            });
          }
  
          if (stepsWithRoleIds.length > 0) {
            await prisma.approvalWorkflowTemplate.create({
              data: {
                id: templateData.id,
                name: templateData.name,
                description: templateData.description,
                category: templateData.category,
                steps: {
                  create: stepsWithRoleIds
                }
              }
            });
            createdCount++;
            console.log(`✅ Created template: ${templateData.name}`);
          } else {
            console.warn(`⚠️ No valid steps for template: ${templateData.name}`);
          }
        } else {
          console.log(`✅ Template already exists: ${templateData.name}`);
        }
      }
  
      console.log(`🎉 Created ${createdCount} workflow templates`);
      return { created: createdCount, total: defaultTemplates.length };
      
    } catch (error) {
      console.error('❌ Error creating workflow templates:', error);
      throw error;
    }
  } 

  // Get approval instance for an entity
async getEntityApprovalInstance(entityType, entityId) {
    return await prisma.approvalInstance.findUnique({
      where: {
        entityType_entityId: {
          entityType,
          entityId
        }
      },
      include: {
        workflow: {
          include: { steps: { orderBy: { sequence: 'asc' } } }
        },
        approvals: {
          include: {
            step: true,
            approver: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
  }
  
  // Reset approval workflow for an entity
  async resetApprovalWorkflow(entityType, entityId, workflowTemplateId, initiatorId) {
    // Delete existing instance and start fresh
    await prisma.approvalInstance.delete({
      where: {
        entityType_entityId: {
          entityType,
          entityId
        }
      }
    });
  
    // Start new workflow
    return await this.startApprovalWorkflow(entityType, entityId, workflowTemplateId, initiatorId);
  }
 
}

export default new ApprovalWorkflowService();