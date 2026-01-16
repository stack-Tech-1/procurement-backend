// backend/src/routes/analyticsRoutes.js
import express from 'express';
import analyticsController from '../controllers/analyticsController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Analytics routes
router.get('/forecast', authenticateToken, analyticsController.getSpendForecast);
router.get('/spend-analysis', authenticateToken, analyticsController.getSpendAnalysis);
router.get('/vendor-benchmarks', authenticateToken, analyticsController.getVendorBenchmarks);
router.get('/kpis', authenticateToken, analyticsController.getKPIs);
router.get('/dashboard-metrics', authenticateToken, analyticsController.getDashboardMetrics);
router.get('/health', authenticateToken, analyticsController.getAnalyticsHealth);
router.get('/vendor-performance', authenticateToken, analyticsController.getVendorPerformance);

export default router;