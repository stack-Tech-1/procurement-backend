import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { authorizeRole } from '../middleware/roleMiddleware.js';
import {
  getTechnicalComparisons,
  upsertTechnicalComparison,
  getFinancialComparisons,
  upsertFinancialComparison,
  markLowestCommercial,
  getEvaluationSummary,
  upsertEvaluationSummary,
  approveEvaluationSummary,
  rejectEvaluationSummary,
} from '../controllers/rfqComparisonController.js';

const router = express.Router();
const AUTH = authenticateToken;
const OFFICER_PLUS = authorizeRole([1, 2, 3]);
const MANAGER_PLUS = authorizeRole([1, 2]);

// Technical Comparison
router.get('/:rfqId/technical-comparison', AUTH, getTechnicalComparisons);
router.post('/:rfqId/technical-comparison', AUTH, OFFICER_PLUS, upsertTechnicalComparison);

// Financial Comparison — specific routes before generic
router.patch('/:rfqId/financial-comparison/mark-lowest', AUTH, MANAGER_PLUS, markLowestCommercial);
router.get('/:rfqId/financial-comparison', AUTH, getFinancialComparisons);
router.post('/:rfqId/financial-comparison', AUTH, OFFICER_PLUS, upsertFinancialComparison);

// Evaluation Summary — specific routes before generic
router.patch('/:rfqId/evaluation-summary/approve', AUTH, MANAGER_PLUS, approveEvaluationSummary);
router.patch('/:rfqId/evaluation-summary/reject', AUTH, MANAGER_PLUS, rejectEvaluationSummary);
router.get('/:rfqId/evaluation-summary', AUTH, getEvaluationSummary);
router.post('/:rfqId/evaluation-summary', AUTH, OFFICER_PLUS, upsertEvaluationSummary);

export default router;
