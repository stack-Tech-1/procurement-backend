// backend/src/routes/tasks.js
import express from 'express';
import { taskController } from '../controllers/taskController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { cacheForUser, TTL } from '../middleware/cacheMiddleware.js';
import { cache } from '../services/cacheService.js';

const router = express.Router();

// ── Static routes (must come before /:taskId param routes) ───────────────────

// Personal task list for the logged-in user
router.get('/my-tasks', authenticateToken, cacheForUser(TTL.SHORT), taskController.getMyTasks);

// Manager team overview (grouped by assignee)
router.get('/team-overview', authenticateToken, cacheForUser(TTL.MEDIUM), taskController.getTeamOverview);

// Get tasks with filters
router.get('/', authenticateToken, cacheForUser(TTL.SHORT), taskController.getTasks);

// Get task statistics
router.get('/stats', authenticateToken, cacheForUser(TTL.SHORT), taskController.getTaskStatistics);

const invalidateTaskCache = (req, res, next) => {
  cache.invalidatePrefix(`route:${req.user?.id}:/api/tasks`);
  cache.invalidatePrefix(`route:${req.user?.id}:/api/dashboard`);
  next();
};

// Create new task
router.post('/', authenticateToken, invalidateTaskCache, taskController.createTask);

// ── Parameterised routes ──────────────────────────────────────────────────────

// Update task status (accepts progressPct)
router.patch('/:taskId/status', authenticateToken, invalidateTaskCache, taskController.updateTaskStatus);

// Reassign task to a different user
router.patch('/:taskId/reassign', authenticateToken, invalidateTaskCache, taskController.reassignTask);

// Assign task to team member (legacy)
router.patch('/:taskId/assign', authenticateToken, invalidateTaskCache, taskController.assignTask);


export default router;