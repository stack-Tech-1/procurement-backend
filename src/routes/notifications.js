// backend/src/routes/notifications.js
import express from 'express';
import { notificationController } from '../controllers/notificationController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { cacheForUser, TTL } from '../middleware/cacheMiddleware.js';

const router = express.Router();

// Get user notifications (not cached — always fresh)
router.get('/', authenticateToken, notificationController.getUserNotifications);

// Get notification statistics
router.get('/stats', authenticateToken, notificationController.getNotificationStats);

// Fast unread count — short TTL, stale-while-revalidate on frontend
router.get('/unread-count', authenticateToken, cacheForUser(TTL.SHORT), notificationController.getUnreadCount);

// Mark notification as read
router.patch('/:notificationId/read', authenticateToken, notificationController.markAsRead);

// Mark all as read
router.patch('/read-all', authenticateToken, notificationController.markAllAsRead);

// Manual triggers for testing (Admin only)
router.post('/alerts/document-expiry', authenticateToken, notificationController.triggerDocumentExpiryAlerts);
router.post('/alerts/pending-approvals', authenticateToken, notificationController.triggerPendingApprovalAlerts);

// Delete own notification
router.delete('/:notificationId', authenticateToken, notificationController.deleteNotification);

export default router;