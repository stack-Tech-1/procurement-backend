// backend/src/routes/purchaseOrderRoutes.js
import express from 'express';
import {
  getPurchaseOrders,
  getPOStats,
  getPurchaseOrderById,
  createPurchaseOrder,
  updatePurchaseOrder,
  updatePOStatus,
  deletePurchaseOrder,
} from '../controllers/purchaseOrderController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Stats must come before /:id to avoid "stats" being matched as an id
router.get('/stats/summary', authenticateToken, authorizeRole([1, 2, 3]), getPOStats);

router.get('/', authenticateToken, authorizeRole([1, 2, 3]), getPurchaseOrders);
router.get('/:id', authenticateToken, authorizeRole([1, 2, 3]), getPurchaseOrderById);
router.post('/', authenticateToken, authorizeRole([1, 2, 3]), createPurchaseOrder);
router.put('/:id', authenticateToken, authorizeRole([1, 2, 3]), updatePurchaseOrder);
router.patch('/:id/status', authenticateToken, authorizeRole([1, 2, 3]), updatePOStatus);
router.delete('/:id', authenticateToken, authorizeRole([1]), deletePurchaseOrder);

export default router;
