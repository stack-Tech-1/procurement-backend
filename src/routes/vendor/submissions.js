import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/vendor/submissions
 * Get all submissions/qualifications for the logged-in vendor
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    
    // Find vendor by user ID
    const vendor = await prisma.vendor.findUnique({
      where: { userId },
      include: {
        documents: {
          select: {
            id: true,
            docType: true,
            fileName: true,
            expiryDate: true,
            isValid: true,
            uploadedAt: true,
          }
        },
        projectExperience: {
          select: {
            id: true,
            projectName: true,
            clientName: true,
            contractValue: true,
            startDate: true,
            endDate: true,
          }
        },
        assignedReviewer: {
          select: {
            name: true,
            email: true,
            jobTitle: true,
          }
        },
        lastReviewedBy: {
          select: {
            name: true,
            email: true,
          }
        },
        categories: {
          include: {
            category: {
              select: {
                name: true,
                csiCode: true,
              }
            }
          }
        }
      }
    });

    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        error: "Vendor profile not found" 
      });
    }

    // Calculate submission statistics
    const totalDocuments = vendor.documents.length;
    const validDocuments = vendor.documents.filter(doc => doc.isValid).length;
    const expiringDocuments = vendor.documents.filter(doc => {
      if (!doc.expiryDate) return false;
      const expiryDate = new Date(doc.expiryDate);
      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(now.getDate() + 30);
      return expiryDate > now && expiryDate <= thirtyDaysFromNow;
    }).length;
    
    const expiredDocuments = vendor.documents.filter(doc => {
      if (!doc.expiryDate) return false;
      return new Date(doc.expiryDate) < new Date();
    }).length;

    // Get approval workflow status if any
    const approvalInstance = await prisma.approvalInstance.findFirst({
      where: {
        entityType: 'VENDOR',
        entityId: vendor.id,
      },
      include: {
        workflow: {
          select: {
            name: true,
          }
        },
        approvals: {
          include: {
            step: {
              select: {
                sequence: true,
                role: {
                  select: {
                    name: true,
                  }
                }
              }
            },
            approver: {
              select: {
                name: true,
                email: true,
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    // Format categories
    const categories = vendor.categories.map(vc => vc.category);

    // Format the response
    const submissionData = {
      vendor: {
        id: vendor.id,
        vendorId: vendor.vendorId,
        companyLegalName: vendor.companyLegalName,
        vendorType: vendor.vendorType,
        businessType: vendor.businessType,
        status: vendor.status,
        vendorClass: vendor.vendorClass,
        isQualified: vendor.isQualified,
        qualificationScore: vendor.qualificationScore,
        reviewStatus: vendor.reviewStatus,
        reviewNotes: vendor.reviewNotes,
        lastReviewedAt: vendor.lastReviewedAt,
        nextReviewDate: vendor.nextReviewDate,
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
      },
      statistics: {
        totalDocuments,
        validDocuments,
        expiringDocuments,
        expiredDocuments,
        documentCompliance: totalDocuments > 0 ? Math.round((validDocuments / totalDocuments) * 100) : 0,
        projectCount: vendor.projectExperience.length,
      },
      documents: vendor.documents.map(doc => ({
        ...doc,
        status: doc.isValid ? 'VALID' : (doc.expiryDate && new Date(doc.expiryDate) < new Date() ? 'EXPIRED' : 'PENDING'),
        daysUntilExpiry: doc.expiryDate ? 
          Math.ceil((new Date(doc.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)) : null,
      })),
      projects: vendor.projectExperience,
      categories,
      assignedReviewer: vendor.assignedReviewer,
      lastReviewedBy: vendor.lastReviewedBy,
      approvalWorkflow: approvalInstance ? {
        id: approvalInstance.id,
        name: approvalInstance.workflow?.name || 'Vendor Qualification',
        status: approvalInstance.status,
        currentStep: approvalInstance.currentStep,
        steps: approvalInstance.approvals.map(approval => ({
          step: approval.step.sequence,
          role: approval.step.role.name,
          status: approval.status,
          approver: approval.approver,
          comments: approval.comments,
          approvedAt: approval.signedAt,
          createdAt: approval.createdAt,
        }))
      } : null,
      timeline: [
        {
          date: vendor.createdAt,
          event: 'Profile Created',
          description: 'Vendor profile registered in system',
        },
        ...(vendor.lastReviewedAt ? [{
          date: vendor.lastReviewedAt,
          event: 'Last Review',
          description: `Status: ${vendor.reviewStatus || vendor.status}`,
          details: vendor.reviewNotes,
        }] : []),
        ...(vendor.nextReviewDate ? [{
          date: vendor.nextReviewDate,
          event: 'Next Review Due',
          description: 'Scheduled for qualification renewal',
        }] : []),
      ].sort((a, b) => new Date(a.date) - new Date(b.date))
    };

    res.json({
      success: true,
      data: submissionData,
    });

  } catch (error) {
    console.error("Error fetching vendor submissions:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch submission data",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/vendor/submissions/timeline
 * Get detailed timeline/audit log for vendor
 */
router.get("/timeline", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const vendor = await prisma.vendor.findUnique({
      where: { userId },
      select: { id: true }
    });

    if (!vendor) {
      return res.status(404).json({ success: false, error: "Vendor not found" });
    }

    // Get audit logs for this vendor
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entity: 'VENDOR', entityId: vendor.id },
          { userId: userId }
        ]
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50,
    });

    // Get approval actions
    const approvalInstances = await prisma.approvalInstance.findMany({
      where: {
        entityType: 'VENDOR',
        entityId: vendor.id,
      },
      include: {
        approvals: {
          include: {
            step: {
              select: {
                sequence: true,
                role: {
                  select: { name: true }
                }
              }
            },
            approver: {
              select: {
                name: true,
                email: true,
              }
            }
          }
        }
      }
    });

    const timeline = [
      // Convert audit logs
      ...auditLogs.map(log => ({
        id: `log-${log.id}`,
        date: log.createdAt,
        event: log.action,
        description: log.data ? JSON.stringify(log.data) : '',
        user: log.user,
        type: 'AUDIT',
      })),
      
      // Convert approval actions
      ...approvalInstances.flatMap(instance => 
        instance.approvals.map(approval => ({
          id: `approval-${approval.id}`,
          date: approval.createdAt,
          event: `Approval Step ${approval.step.sequence}`,
          description: `${approval.step.role.name}: ${approval.status}`,
          user: approval.approver,
          type: 'APPROVAL',
          details: approval.comments,
          status: approval.status,
        }))
      ),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      data: timeline,
    });

  } catch (error) {
    console.error("Error fetching timeline:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch timeline",
    });
  }
});

export default router;