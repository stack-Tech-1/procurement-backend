import prisma from '../config/prismaClient.js';
import { signatureService } from '../services/signatureService.js';
import { notificationService } from '../services/notificationService.js';

export const signatureController = {

  // Create signature request
  async createSignatureRequest(req, res) {
    try {
      console.log('📥 Received request body:', req.body);
      const { approvalActionId, documentId } = req.body;
      const requesterId = req.user.id;

          // 👇 ADD VALIDATION: Check if approval action exists
    const approvalAction = await prisma.approvalAction.findUnique({
        where: { id: approvalActionId },
        include: {
          instance: true,
          step: true
        }
      });
  
      if (!approvalAction) {
        return res.status(404).json({
          success: false,
          message: `Approval action with ID ${approvalActionId} not found`
        });
      }
  
      // 👇 ADD VALIDATION: Check if document exists
      const document = await prisma.document.findUnique({
        where: { id: documentId }
      });
  
      if (!document) {
        return res.status(404).json({
          success: false,
          message: `Document with ID ${documentId} not found`
        });
      }
  
      // 👇 ADD VALIDATION: Check if user is the approver for this action
      if (approvalAction.approverId !== requesterId) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to create signature requests for this approval'
        });
      }

      const signatureRequest = await signatureService.createSignatureRequest(
        approvalActionId, 
        requesterId, 
        documentId
      );

      // Notify the approver (if notification service exists)
      if (notificationService && notificationService.createSignatureNotification) {
        await notificationService.createSignatureNotification(
          signatureRequest.approvalAction.approverId,
          signatureRequest
        );
      }

      res.status(201).json({
        success: true,
        message: 'Signature request created successfully',
        data: signatureRequest
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // Process signature
  async processSignature(req, res) {
    try {
      const { signatureRequestId } = req.params;
      const { signatureData } = req.body;
      const signerId = req.user.id;
      const ipAddress = req.ip || req.connection.remoteAddress;

      // Validate signature data
      signatureService.validateSignatureData(signatureData);

      const result = await signatureService.processSignature(
        signatureRequestId,
        signerId,
        signatureData,
        ipAddress
      );

      // Notify requester (if notification service exists)
      if (notificationService && notificationService.createSignatureCompleteNotification) {
        await notificationService.createSignatureCompleteNotification(
          result.requesterId,
          result
        );
      }

      res.json({
        success: true,
        message: 'Signature processed successfully',
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // Get pending signatures for user
  async getPendingSignatures(req, res) {
    try {
      const userId = req.user.id;
      
      const signatureRequests = await signatureService.getPendingSignatures(userId);

      res.json({
        success: true,
        data: signatureRequests
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // Get signature request details
  async getSignatureRequest(req, res) {
    try {
      const { signatureRequestId } = req.params;

      const signatureRequest = await prisma.signatureRequest.findUnique({
        where: { id: signatureRequestId },
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
          },
          signer: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      if (!signatureRequest) {
        return res.status(404).json({
          success: false,
          message: 'Signature request not found'
        });
      }

      res.json({
        success: true,
        data: signatureRequest
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // Cancel signature request
  async cancelSignatureRequest(req, res) {
    try {
      const { signatureRequestId } = req.params;
      const cancelledById = req.user.id;

      const result = await signatureService.cancelSignatureRequest(
        signatureRequestId,
        cancelledById
      );

      res.json({
        success: true,
        message: 'Signature request cancelled successfully',
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
};