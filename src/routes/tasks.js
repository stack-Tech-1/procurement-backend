// backend/src/routes/tasks.js
import express from 'express';
import { taskController } from '../controllers/taskController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get tasks with filters
router.get('/', authenticateToken, taskController.getTasks);

// Get task statistics
router.get('/stats', authenticateToken, taskController.getTaskStatistics);

// Create new task
router.post('/', authenticateToken, taskController.createTask);

// Update task status
router.patch('/:taskId/status', authenticateToken, taskController.updateTaskStatus);

// Assign task to team member
router.patch('/:taskId/assign', authenticateToken, taskController.assignTask);


export default router;