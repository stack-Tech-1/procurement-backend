import express from 'express';
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { authorizeRole } from '../../middleware/roleMiddleware.js';
import { cache } from '../../services/cacheService.js';

const router = express.Router();
const requireAdmin = [authenticateToken, authorizeRole([1])];

// GET /api/admin/cache/stats — show cache stats. Admin only.
router.get('/stats', ...requireAdmin, (req, res) => {
  res.json(cache.stats());
});

// POST /api/admin/cache/flush — flush entire cache. Admin only.
router.post('/flush', ...requireAdmin, (req, res) => {
  cache.flush();
  res.json({ message: 'Cache flushed successfully', timestamp: new Date().toISOString() });
});

export default router;
