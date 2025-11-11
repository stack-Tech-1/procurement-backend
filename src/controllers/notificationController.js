// backend/src/controllers/notificationController.js
import { notificationService } from '../services/notificationService.js';

export const notificationController = {

  // Get user notifications
  async getUserNotifications(req, res) {
    try {
      const { userId } = req.user;
      const { unreadOnly, type, limit } = req.query;

      const notifications = await notificationService.getUserNotifications(userId, {
        unreadOnly: unreadOnly === 'true',
        type,
        limit: limit ? parseInt(limit) : 50
      });

      res.json({
        success: true,
        data: notifications
      });
    } catch (error) {
      console.error('Error getting notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications'
      });
    }
  },

  // Get notification statistics
  async getNotificationStats(req, res) {
    try {
      const { userId } = req.user;
      const stats = await notificationService.getNotificationStats(userId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting notification stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notification statistics'
      });
    }
  },

  // Mark notification as read
  async markAsRead(req, res) {
    try {
      const { notificationId } = req.params;
      const notification = await notificationService.markAsRead(parseInt(notificationId));

      res.json({
        success: true,
        data: notification
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read'
      });
    }
  },

  // Mark all as read
  async markAllAsRead(req, res) {
    try {
      const { userId } = req.user;
      const result = await notificationService.markAllAsRead(userId);

      res.json({
        success: true,
        data: { count: result.count }
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read'
      });
    }
  },

  // Manual trigger for document expiry alerts (for testing)
  async triggerDocumentExpiryAlerts(req, res) {
    try {
      const count = await notificationService.checkDocumentExpiryAlerts();

      res.json({
        success: true,
        message: `Document expiry alerts triggered for ${count} documents`,
        data: { count }
      });
    } catch (error) {
      console.error('Error triggering document expiry alerts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to trigger document expiry alerts'
      });
    }
  },

  // Manual trigger for pending approval alerts (for testing)
  async triggerPendingApprovalAlerts(req, res) {
    try {
      const count = await notificationService.checkPendingApprovals();

      res.json({
        success: true,
        message: `Pending approval alerts triggered for ${count} items`,
        data: { count }
      });
    } catch (error) {
      console.error('Error triggering pending approval alerts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to trigger pending approval alerts'
      });
    }
  }
};