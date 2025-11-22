-- Create ApprovalWorkflow table
CREATE TABLE "ApprovalWorkflow" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "entityType" VARCHAR(50) NOT NULL,
    "conditions" JSONB,
    "steps" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalWorkflow_pkey" PRIMARY KEY ("id")
);

-- Add foreign key
ALTER TABLE "ApprovalWorkflow" ADD CONSTRAINT "ApprovalWorkflow_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enhance Approval table for complex workflows
ALTER TABLE "Approval" 
ADD COLUMN "workflowId" TEXT,
ADD COLUMN "currentStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalSteps" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "stepRequirements" JSONB,
ADD COLUMN "parallelApprovals" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "escalationLevel" INTEGER DEFAULT 0,
ADD COLUMN "slaDeadline" TIMESTAMP(3),
ADD COLUMN "slaBreached" BOOLEAN NOT NULL DEFAULT false;

-- Add foreign key
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ApprovalWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create ApprovalStep table for tracking individual step approvals
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "stepName" VARCHAR(255) NOT NULL,
    "approverRole" INTEGER NOT NULL,
    "approverId" INTEGER,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "comments" TEXT,
    "approvedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "slaDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create indexes for performance
CREATE INDEX "Approval_workflowId_idx" ON "Approval"("workflowId");
CREATE INDEX "ApprovalStep_approvalId_idx" ON "ApprovalStep"("approvalId");
CREATE INDEX "ApprovalStep_approverId_idx" ON "ApprovalStep"("approverId");
CREATE INDEX "ApprovalStep_status_idx" ON "ApprovalStep"("status");