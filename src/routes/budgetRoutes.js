// backend/src/routes/budgetRoutes.js
import express from 'express';
import { budgetController } from '../controllers/budgetController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Budget endpoints
router.get('/summary', authenticateToken, budgetController.getBudgetSummary);
router.get('/projects', authenticateToken, budgetController.getProjectBudgets);
router.get('/trends', authenticateToken, budgetController.getMonthlySpendTrends);

export default router;