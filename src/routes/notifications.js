// backend/src/routes/notifications.js
import express from 'express';
import { notificationController } from '../controllers/notificationController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get user notifications
router.get('/', authenticateToken, notificationController.getUserNotifications);

// Get notification statistics
router.get('/stats', authenticateToken, notificationController.getNotificationStats);

// Fast unread count (registered before /:notificationId to avoid param conflict)
router.get('/unread-count', authenticateToken, notificationController.getUnreadCount);

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