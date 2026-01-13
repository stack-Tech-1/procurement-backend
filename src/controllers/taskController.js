// backend/src/controllers/taskController.js
import { taskService } from '../services/taskService.js';

export const taskController = {

  // Get all tasks with filters
  async getTasks(req, res) {
    try {
      const { status, priority, taskType, assignedTo, page = 1, limit = 20 } = req.query;
      const { userId, roleId } = req.user;

      const filters = {
        status,
        priority,
        taskType,
        assignedTo: roleId === 3 ? userId : assignedTo, // Officers see only their tasks
        page: parseInt(page),
        limit: parseInt(limit)
      };

      const tasks = await taskService.getTasksWithPagination(filters);
      
      res.json({
        success: true,
        data: tasks
      });
    } catch (error) {
      console.error('Error getting tasks:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tasks'
      });
    }
  },

  // Get task statistics for dashboard - SIMPLIFIED
  async getTaskStatistics(req, res) {
    try {
      const { id: userId, roleId } = req.user;
      
      console.log(`📊 Getting task statistics for user ${userId}, role ${roleId}`);
      
      const stats = await taskService.getTaskStatistics(userId, roleId);

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error getting task statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch task statistics',
        error: error.message
      });
    }
  },


  // Create a new task
  async createTask(req, res) {
    try {
      const { userId, roleId } = req.user;
      
      if (roleId !== 2 && roleId !== 1) { // Only Managers and Executives can create tasks
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to create tasks'
        });
      }

      const taskData = {
        ...req.body,
        assignedById: userId
      };

      const task = await taskService.createTask(taskData);
      
      res.status(201).json({
        success: true,
        data: task
      });
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create task'
      });
    }
  },

  // Update task status
  async updateTaskStatus(req, res) {
    try {
      const { taskId } = req.params;
      const { status, remarks } = req.body;
      const { userId } = req.user;

      const task = await taskService.updateTaskStatus(parseInt(taskId), status, remarks, userId);
      
      res.json({
        success: true,
        data: task
      });
    } catch (error) {
      console.error('Error updating task status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update task status'
      });
    }
  },  

  // Assign task to team member (Manager only)
  async assignTask(req, res) {
    try {
      const { userId, roleId } = req.user;
      
      if (roleId !== 2) { // Only Managers can assign tasks
        return res.status(403).json({
          success: false,
          message: 'Only managers can assign tasks'
        });
      }

      const { taskId } = req.params;
      const { assignedTo, dueDate, priority } = req.body;

      const task = await taskService.assignTask(parseInt(taskId), assignedTo, dueDate, priority, userId);
      
      res.json({
        success: true,
        data: task
      });
    } catch (error) {
      console.error('Error assigning task:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to assign task'
      });
    }
  }
};