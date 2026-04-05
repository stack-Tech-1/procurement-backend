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
import { cacheForUser, TTL } from '../middleware/cacheMiddleware.js';
import { cache } from '../services/cacheService.js';

const router = express.Router();

// Stats must come before /:id to avoid "stats" being matched as an id
router.get('/stats/summary', authenticateToken, authorizeRole([1, 2, 3]), cacheForUser(TTL.MEDIUM), getPOStats);

router.get('/', authenticateToken, authorizeRole([1, 2, 3]), cacheForUser(TTL.MEDIUM), getPurchaseOrders);
router.get('/:id', authenticateToken, authorizeRole([1, 2, 3]), cacheForUser(TTL.MEDIUM), getPurchaseOrderById);

const invalidatePO = (req, res, next) => {
  cache.invalidatePrefix(`route:${req.user?.id}:/api/purchase-orders`);
  cache.invalidatePrefix(`route:${req.user?.id}:/api/dashboard`);
  cache.invalidatePrefix(`route:${req.user?.id}:/api/budget`);
  next();
};

router.post('/', authenticateToken, authorizeRole([1, 2, 3]), invalidatePO, createPurchaseOrder);
router.put('/:id', authenticateToken, authorizeRole([1, 2, 3]), invalidatePO, updatePurchaseOrder);
router.patch('/:id/status', authenticateToken, authorizeRole([1, 2, 3]), invalidatePO, updatePOStatus);
router.delete('/:id', authenticateToken, authorizeRole([1]), invalidatePO, deletePurchaseOrder);

export default router;
