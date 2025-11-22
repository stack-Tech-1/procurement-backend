import prisma from '../config/prismaClient.js';
import { logAudit } from '../utils/auditLogger.js';

export const signatureService = {
  
  // Create signature request
  async createSignatureRequest(approvalActionId, requesterId, documentId) {
    try {
      const signatureRequest = await prisma.signatureRequest.create({
        data: {
          approvalActionId,
          documentId,
          requesterId,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
        include: {
          approvalAction: {
            include: {
              instance: true,
              step: true
            }
          },
          document: true
        }
      });

      // Log the action using your actual audit logger
      await logAudit(
        requesterId,
        'SIGNATURE_REQUEST_CREATED',
        'SIGNATURE_REQUEST',
        signatureRequest.id,
        { approvalActionId, documentId }
      );

      return signatureRequest;
    } catch (error) {
      throw new Error(`Failed to create signature request: ${error.message}`);
    }
  },

  // Process digital signature
  async processSignature(signatureRequestId, signerId, signatureData, ipAddress = '') {
    try {
      const signatureRequest = await prisma.signatureRequest.findUnique({
        where: { id: signatureRequestId },
        include: {
          approvalAction: true,
          document: true
        }
      });

      if (!signatureRequest) {
        throw new Error('Signature request not found');
      }

      if (signatureRequest.status !== 'PENDING') {
        throw new Error('Signature request already processed');
      }

      if (new Date() > signatureRequest.expiresAt) {
        throw new Error('Signature request has expired');
      }

      // Update signature request
      const updatedRequest = await prisma.signatureRequest.update({
        where: { id: signatureRequestId },
        data: {
          status: 'SIGNED',
          signedAt: new Date(),
          signatureData: JSON.stringify(signatureData),
          ipAddress,
          signerId
        },
        include: {
          approvalAction: {
            include: {
              instance: true
            }
          }
        }
      });

      // Update document signature status
      await prisma.document.update({
        where: { id: signatureRequest.documentId },
        data: {
          signatureStatus: 'SIGNED',
          signedById: signerId,
          signedAt: new Date()
        }
      });

      // Update approval action
      await prisma.approvalAction.update({
        where: { id: signatureRequest.approvalActionId },
        data: {
          status: 'APPROVED',
          signedAt: new Date(),
          signatureData: JSON.stringify(signatureData)
        }
      });

      // Log the signature using your actual audit logger
      await logAudit(
        signerId,
        'DOCUMENT_SIGNED',
        'SIGNATURE_REQUEST',
        signatureRequestId,
        { 
          approvalActionId: signatureRequest.approvalActionId,
          documentId: signatureRequest.documentId
        }
      );

      return updatedRequest;
    } catch (error) {
      throw new Error(`Failed to process signature: ${error.message}`);
    }
  },

  // Get signature requests for user
  async getPendingSignatures(userId) {
    try {
      const signatureRequests = await prisma.signatureRequest.findMany({
        where: {
          status: 'PENDING',
          approvalAction: {
            approverId: userId
          },
          expiresAt: {
            gt: new Date()
          }
        },
        include: {
          approvalAction: {
            include: {
              instance: true,
              step: true
            }
          },
          document: true,
          requester: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return signatureRequests;
    } catch (error) {
      throw new Error(`Failed to fetch pending signatures: ${error.message}`);
    }
  },

  // Validate signature data
  validateSignatureData(signatureData) {
    const { signatureImage, typedName, timestamp } = signatureData;
    
    if (!signatureImage && !typedName) {
      throw new Error('Either signature image or typed name is required');
    }

    if (signatureImage && !signatureImage.startsWith('data:image/')) {
      throw new Error('Invalid signature image format');
    }

    return true;
  },

  // Cancel signature request
  async cancelSignatureRequest(signatureRequestId, cancelledById) {
    try {
      const signatureRequest = await prisma.signatureRequest.update({
        where: { 
          id: signatureRequestId,
          status: 'PENDING'
        },
        data: {
          status: 'CANCELLED',
          signerId: cancelledById
        }
      });

      // Log the cancellation
      await logAudit(
        cancelledById,
        'SIGNATURE_REQUEST_CANCELLED',
        'SIGNATURE_REQUEST',
        signatureRequestId,
        { reason: 'Manual cancellation' }
      );

      return signatureRequest;
    } catch (error) {
      throw new Error(`Failed to cancel signature request: ${error.message}`);
    }
  }
};