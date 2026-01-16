import express from "express";

import { 
    getReports, 
    getReportById, 
    createReport, 
    updateReport, 
    deleteReport, 
    executeReport, 
    exportReport, 
    scheduleReport, 
    toggleFavorite, 
    getReportTemplates, 
    getReportExecutions 
} from '../controllers/reportController.js';

import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/templates/categories', authenticateToken, getReportTemplates);

// Get all reports
router.get('/', authenticateToken, getReports);

// Get report by ID
router.get('/:id', authenticateToken, getReportById);

// Create new report
router.post('/', authenticateToken, createReport);

// Update report
router.put('/:id', authenticateToken, updateReport);

// Delete report
router.delete('/:id', authenticateToken, deleteReport);

// Execute report (generate data)
router.post('/:id/execute', authenticateToken, executeReport);

// Export report
router.post('/:id/export', authenticateToken, exportReport);

// Schedule report
router.post('/:id/schedule', authenticateToken, scheduleReport);

// Toggle favorite
router.post('/:id/favorite', authenticateToken, toggleFavorite);

// Get report executions history
router.get('/:id/executions', authenticateToken, getReportExecutions);


export default router;