import prisma from '../config/prismaClient.js';

async function createTestApprovalData() {
  try {
    console.log('🔄 Creating test approval data...');

    // Create a test approval workflow template
    const workflowTemplate = await prisma.approvalWorkflowTemplate.create({
      data: {
        name: 'Vendor Qualification Test Workflow',
        description: 'Test workflow for vendor qualification approvals',
        category: 'VENDOR_QUALIFICATION',
        steps: {
          create: [
            {
              sequence: 1,
              roleId: 2, // Procurement Manager role ID
              isRequired: true
            },
            {
              sequence: 2, 
              roleId: 1, // Admin role ID
              isRequired: true
            }
          ]
        }
      },
      include: {
        steps: true
      }
    });

    // Create a test approval instance
    const approvalInstance = await prisma.approvalInstance.create({
      data: {
        entityType: 'VENDOR',
        entityId: 1, // Use an existing vendor ID
        workflowId: workflowTemplate.id,
        status: 'PENDING',
        currentStep: 0
      }
    });

    // Create approval actions for the first step
    const approvalAction = await prisma.approvalAction.create({
      data: {
        instanceId: approvalInstance.id,
        stepId: workflowTemplate.steps[0].id,
        approverId: 3, // Your user ID from the token
        status: 'PENDING'
      },
      include: {
        instance: true,
        step: true
      }
    });

    console.log('✅ Test approval data created:');
    console.log('Approval Action ID:', approvalAction.id);
    console.log('Approval Instance ID:', approvalInstance.id);
    console.log('Workflow Template ID:', workflowTemplate.id);

    return approvalAction;
  } catch (error) {
    console.error('❌ Failed to create test approval data:', error);
    throw error;
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createTestApprovalData()
    .then(() => {
      console.log('🎉 Test data creation completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test data creation failed:', error);
      process.exit(1);
    });
}

export { createTestApprovalData };