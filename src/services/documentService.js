import prisma from '../config/prismaClient.js';
import { generatePresignedUrl, getPublicUrl } from '../lib/awsS3.js';

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

  // Get document with signed URL - UPDATED FOR AWS S3
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

    // Generate presigned URL for AWS S3 access (valid for 1 hour)
    let signedUrl = document.fileUrl; // Default to stored URL
    
    // If fileUrl is an S3 key (not a full URL), generate presigned URL
    if (document.fileUrl && !document.fileUrl.startsWith('http')) {
      signedUrl = await generatePresignedUrl(document.fileUrl, 3600);
    }
    
    // If still no signed URL, try to get public URL
    if (!signedUrl && document.fileUrl && !document.fileUrl.startsWith('http')) {
      signedUrl = getPublicUrl(document.fileUrl);
    }

    return {
      ...document,
      signedUrl: signedUrl || document.fileUrl
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

    // Generate presigned URLs for all documents in history
    const documentsWithUrls = await Promise.all(
      documents.map(async (doc) => {
        let signedUrl = doc.fileUrl;
        
        // Generate presigned URL for AWS S3 keys
        if (doc.fileUrl && !doc.fileUrl.startsWith('http')) {
          signedUrl = await generatePresignedUrl(doc.fileUrl, 3600) || getPublicUrl(doc.fileUrl) || doc.fileUrl;
        }
        
        return {
          ...doc,
          signedUrl
        };
      })
    );

    return documentsWithUrls;
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

    // Generate presigned URLs for all search results
    const documentsWithUrls = await Promise.all(
      documents.map(async (document) => {
        let signedUrl = document.fileUrl;
        
        // Generate presigned URL for AWS S3 keys
        if (document.fileUrl && !document.fileUrl.startsWith('http')) {
          signedUrl = await generatePresignedUrl(document.fileUrl, 3600) || getPublicUrl(document.fileUrl) || document.fileUrl;
        }
        
        return {
          ...document,
          signedUrl
        };
      })
    );

    return {
      documents: documentsWithUrls,
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

  // NEW: Update document with S3 file
  async updateDocumentWithS3File(documentId, s3Key, metadata = {}) {
    const document = await prisma.document.update({
      where: { id: documentId },
      data: {
        fileUrl: s3Key, // Store S3 key, not full URL
        fileName: metadata.fileName || 'document',
        mimeType: metadata.mimeType || 'application/octet-stream',
        fileSize: metadata.fileSize || 0,
        uploadedAt: new Date(),
        ...metadata
      }
    });

    return document;
  }

  // NEW: Get presigned URL for specific document
  async getPresignedUrlForDocument(documentId, expiresIn = 3600) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { fileUrl: true }
    });

    if (!document || !document.fileUrl) {
      throw new Error('Document not found');
    }

    // If it's already a full URL, return it
    if (document.fileUrl.startsWith('http')) {
      return document.fileUrl;
    }

    // Generate presigned URL for S3 key
    return await generatePresignedUrl(document.fileUrl, expiresIn);
  }

  // NEW: Delete document from S3 and database
  async deleteDocument(documentId) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { fileUrl: true, id: true }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    // TODO: Implement S3 deletion if needed
    // For now, just delete from database
    // Note: In production, you might want to implement soft delete
    
    const deletedDocument = await prisma.document.delete({
      where: { id: documentId }
    });

    return deletedDocument;
  }
}