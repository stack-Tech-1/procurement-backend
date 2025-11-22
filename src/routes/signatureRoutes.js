import express from 'express';
import { signatureController } from '../controllers/signatureController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Signature requests
router.post('/requests', signatureController.createSignatureRequest);
router.get('/requests/pending', signatureController.getPendingSignatures);
router.get('/requests/:signatureRequestId', signatureController.getSignatureRequest);
router.post('/requests/:signatureRequestId/sign', signatureController.processSignature);
router.post('/requests/:signatureRequestId/cancel', signatureController.cancelSignatureRequest);

export default router;