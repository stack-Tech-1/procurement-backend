// backend/src/routes/informationRequestRoutes.js
import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import {
  getVendorRequests,
  getRequestDetails,
  submitResponse,
  getRequestStats,
  //createRequest,
  //updateRequestStatus
} from '../controllers/informationRequestController.js';

const router = express.Router();

router.get('/vendor/requests/stats', authenticateToken, getRequestStats);

// Vendor routes (for vendors to view and respond to requests)
router.get('/vendor/requests', authenticateToken, getVendorRequests);
router.get('/vendor/requests/:id', authenticateToken, getRequestDetails);
router.post('/vendor/requests/:id/respond', authenticateToken, submitResponse);

// Admin/Procurement routes (for creating and managing requests)
router.get('/vendor/requests/:vendorId/all', authenticateToken, getVendorRequests); // For admin view
//router.post('/vendor/requests', authenticateToken, createRequest);
//router.put('/vendor/requests/:id/status', authenticateToken, updateRequestStatus);

export default router;