// backend/src/routes/tasks.js
import express from 'express';
import { taskController } from '../controllers/taskController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// ── Static routes (must come before /:taskId param routes) ───────────────────

// Personal task list for the logged-in user
router.get('/my-tasks', authenticateToken, taskController.getMyTasks);

// Manager team overview (grouped by assignee)
router.get('/team-overview', authenticateToken, taskController.getTeamOverview);

// Get tasks with filters
router.get('/', authenticateToken, taskController.getTasks);

// Get task statistics
router.get('/stats', authenticateToken, taskController.getTaskStatistics);

// Create new task
router.post('/', authenticateToken, taskController.createTask);

// ── Parameterised routes ──────────────────────────────────────────────────────

// Update task status (accepts progressPct)
router.patch('/:taskId/status', authenticateToken, taskController.updateTaskStatus);

// Reassign task to a different user
router.patch('/:taskId/reassign', authenticateToken, taskController.reassignTask);

// Assign task to team member (legacy)
router.patch('/:taskId/assign', authenticateToken, taskController.assignTask);


export default router;