import prisma from '../config/prismaClient.js';
import { getSignedUrl } from '../lib/supabaseAdmin.js';

export class DocumentService {
  
  // Upload document with version control
  async uploadDocument(fileData, uploadedById, options = {}) {
    const {
      previousVersionId,
      requiresSignature = false,
      approvalWorkflowId,
      tags = [],
      category,
      description
    } = options;

    return await prisma.document.create({
      data: {
        ...fileData,
        uploadedById,
        previousVersionId,
        requiresSignature,
        approvalWorkflowId,
        tags,
        category,
        description,
        // If this is a new version, mark previous as not current
        ...(previousVersionId && {
          previousVersion: {
            connect: { id: previousVersionId },
            update: { isCurrent: false }
          }
        })
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true }
        },
        approvalWorkflow: {
          include: {
            steps: {
              include: {
                role: true
              }
            }
          }
        }
      }
    });
  }

  // Get document with signed URL
  async getDocumentWithUrl(documentId, userId) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true }
        },
        signedBy: {
          select: { id: true, name: true, email: true }
        },
        approvalWorkflow: {
          include: {
            steps: {
              include: {
                role: true
              }
            }
          }
        },
        previousVersion: true,
        nextVersions: true
      }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    // Generate signed URL for secure access
    const signedUrl = await getSignedUrl(document.fileUrl, 300); // 5 minutes

    return {
      ...document,
      signedUrl
    };
  }

  // Get document version history
  async getDocumentHistory(documentId) {
    const documents = await prisma.document.findMany({
      where: {
        OR: [
          { id: documentId },
          { previousVersionId: documentId }
        ]
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true }
        },
        signedBy: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: {
        version: 'desc'
      }
    });

    return documents;
  }

  // Bulk document operations
  async bulkUpdateDocuments(documentIds, updates) {
    return await prisma.document.updateMany({
      where: {
        id: {
          in: documentIds
        }
      },
      data: updates
    });
  }

  // Document search with filters
  async searchDocuments(filters = {}, page = 1, pageSize = 20) {
    const where = this.buildDocumentWhereClause(filters);
    
    const [documents, totalCount] = await Promise.all([
      prisma.document.findMany({
        where,
        include: {
          uploadedBy: {
            select: { id: true, name: true, email: true }
          },
          signedBy: {
            select: { id: true, name: true, email: true }
          }
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          uploadedAt: 'desc'
        }
      }),
      prisma.document.count({ where })
    ]);

    return {
      documents,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    };
  }

  buildDocumentWhereClause(filters) {
    const where = {};
    
    if (filters.category) {
      where.category = filters.category;
    }
    
    if (filters.tags && filters.tags.length > 0) {
      where.tags = {
        hasSome: filters.tags
      };
    }
    
    if (filters.uploadedById) {
      where.uploadedById = parseInt(filters.uploadedById);
    }
    
    if (filters.approvalStatus) {
      where.approvalStatus = filters.approvalStatus;
    }
    
    if (filters.signatureStatus) {
      where.signatureStatus = filters.signatureStatus;
    }
    
    if (filters.searchTerm) {
      where.OR = [
        { fileName: { contains: filters.searchTerm, mode: 'insensitive' } },
        { description: { contains: filters.searchTerm, mode: 'insensitive' } },
        { tags: { has: filters.searchTerm } }
      ];
    }
    
    if (filters.dateFrom || filters.dateTo) {
      where.uploadedAt = {};
      if (filters.dateFrom) {
        where.uploadedAt.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        where.uploadedAt.lte = new Date(filters.dateTo);
      }
    }

    return where;
  }

  // Initiate approval workflow
  async initiateApproval(documentId, workflowId) {
    const document = await prisma.document.update({
      where: { id: documentId },
      data: {
        approvalStatus: 'PENDING_APPROVAL',
        approvalWorkflowId: workflowId
      },
      include: {
        approvalWorkflow: {
          include: {
            steps: {
              orderBy: { sequence: 'asc' },
              include: { role: true }
            }
          }
        }
      }
    });

    // Create approval records for each step
    const approvalPromises = document.approvalWorkflow.steps.map(step =>
      prisma.documentApproval.create({
        data: {
          documentId,
          stepId: step.id,
          approverId: null, // Will be assigned when step is reached
          status: 'PENDING'
        }
      })
    );

    await Promise.all(approvalPromises);

    return document;
  }
}