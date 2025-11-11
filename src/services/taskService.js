// backend/src/services/taskService.js - ENHANCED VERSION
import prisma from '../config/prismaClient.js';
import { notificationService } from './notificationService.js';
import { ROLES } from '../constants/roles.js';

export const taskService = {
  
  // Get tasks with pagination and advanced filtering
  async getTasksWithPagination(filters = {}) {
    const where = {};
    const { page = 1, limit = 20, ...filterParams } = filters;
    const skip = (page - 1) * limit;

    // Build where clause based on filters
    if (filterParams.status) where.status = filterParams.status;
    if (filterParams.priority) where.priority = filterParams.priority;
    if (filterParams.taskType) where.taskType = filterParams.taskType;
    if (filterParams.assignedTo) where.assignedTo = parseInt(filterParams.assignedTo);

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          assignedUser: {
            select: { id: true, name: true, email: true, department: true }
          },
          assignedByUser: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { dueDate: 'asc' },
        skip,
        take: limit
      }),
      prisma.task.count({ where })
    ]);

    return {
      tasks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  },

  // Create task with notification
  async createTask(taskData) {
    const task = await prisma.task.create({
      data: {
        title: taskData.title,
        description: taskData.description,
        taskType: taskData.taskType,
        assignedTo: taskData.assignedTo,
        assignedById: taskData.assignedById,
        dueDate: new Date(taskData.dueDate),
        priority: taskData.priority || 'MEDIUM',
        status: taskData.status || 'NOT_STARTED',
        remarks: taskData.remarks
      },
      include: {
        assignedUser: {
          select: { id: true, name: true, email: true }
        },
        assignedByUser: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Send notification to assigned user
    await notificationService.createNotification({
      userId: taskData.assignedTo,
      title: `New Task Assigned: ${taskData.title}`,
      body: `You have been assigned a new task. Due: ${new Date(taskData.dueDate).toLocaleDateString()}`,
      type: 'INFO',
      priority: taskData.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
      actionUrl: `/dashboard/tasks`,
      metadata: {
        taskId: task.id,
        taskType: taskData.taskType,
        dueDate: taskData.dueDate
      }
    });

    return task;
  },

  // Update task status with validation
  async updateTaskStatus(taskId, status, remarks, userId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignedUser: true,
        assignedByUser: true
      }
    });

    if (!task) {
      throw new Error('Task not found');
    }

    // Check if user has permission to update this task
    if (task.assignedTo !== userId && task.assignedById !== userId) {
      throw new Error('Unauthorized to update this task');
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        ...(remarks && { remarks }),
        updatedAt: new Date()
      },
      include: {
        assignedUser: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Notify manager when task is completed
    if (status === 'COMPLETED' && task.assignedById !== userId) {
      await notificationService.createNotification({
        userId: task.assignedById,
        title: `Task Completed: ${task.title}`,
        body: `Task assigned to ${task.assignedUser.name} has been completed`,
        type: 'INFO',
        priority: 'MEDIUM',
        actionUrl: `/dashboard/tasks`,
        metadata: {
          taskId: task.id,
          completedBy: task.assignedUser.name
        }
      });
    }

    return updatedTask;
  },

  // Assign task to team member
  async assignTask(taskId, assignedTo, dueDate, priority, assignedById) {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        assignedTo: parseInt(assignedTo),
        dueDate: new Date(dueDate),
        priority: priority || 'MEDIUM',
        status: 'NOT_STARTED',
        updatedAt: new Date()
      },
      include: {
        assignedUser: {
          select: { id: true, name: true, email: true }
        },
        assignedByUser: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Notify the newly assigned user
    await notificationService.createNotification({
      userId: parseInt(assignedTo),
      title: `Task Reassigned: ${task.title}`,
      body: `A task has been reassigned to you. New due date: ${new Date(dueDate).toLocaleDateString()}`,
      type: 'INFO',
      priority: priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
      actionUrl: `/dashboard/tasks`,
      metadata: {
        taskId: task.id,
        previousAssignee: task.assignedUser.name,
        newDueDate: dueDate
      }
    });

    return task;
  },

  // Get comprehensive task statistics
  async getTaskStatistics(userId, roleId) {
    const where = roleId === ROLES.PROCUREMENT_OFFICER ? { assignedTo: userId } : {};

    const [
      total,
      completed,
      inProgress,
      notStarted,
      overdue,
      highPriority,
      tasksByType
    ] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.task.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      prisma.task.count({ where: { ...where, status: 'NOT_STARTED' } }),
      prisma.task.count({ 
        where: { 
          ...where, 
          status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
          dueDate: { lt: new Date() }
        } 
      }),
      prisma.task.count({ where: { ...where, priority: 'HIGH' } }),
      prisma.task.groupBy({
        by: ['taskType'],
        where,
        _count: { _all: true }
      })
    ]);

    // Calculate completion rates
    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    const onTimeRate = await this.calculateOnTimeRate(where);

    return {
      overview: {
        total,
        completed,
        inProgress,
        notStarted,
        overdue,
        highPriority
      },
      metrics: {
        completionRate: Math.round(completionRate),
        onTimeRate: Math.round(onTimeRate),
        efficiency: Math.round((completed / Math.max(total, 1)) * 100)
      },
      distribution: {
        byStatus: { completed, inProgress, notStarted, overdue },
        byType: tasksByType.reduce((acc, item) => {
          acc[item.taskType] = item._count._all;
          return acc;
        }, {}),
        byPriority: { high: highPriority, medium: total - highPriority }
      }
    };
  },

  
// Get overdue tasks for dashboard
async getOverdueTasks() {
  try {
    const overdueTasks = await prisma.task.findMany({
      where: {
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        dueDate: { lt: new Date() }
      },
      include: {
        assignedUser: {
          select: { 
            id: true, 
            name: true, 
            email: true, 
            department: true 
          }
        },
        assignedByUser: {
          select: { 
            id: true, 
            name: true, 
            email: true 
          }
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    return overdueTasks;
  } catch (error) {
    console.error('Error fetching overdue tasks:', error);
    throw error;
  }
},

// Get user tasks (this method is also missing but referenced in dashboardService)
async getUserTasks(userId, filters = {}) {
  try {
    const where = {
      assignedTo: userId,
      ...filters
    };

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignedUser: {
          select: { 
            id: true, 
            name: true, 
            email: true 
          }
        },
        assignedByUser: {
          select: { 
            id: true, 
            name: true, 
            email: true 
          }
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    return tasks;
  } catch (error) {
    console.error('Error fetching user tasks:', error);
    throw error;
  }
},

  // Calculate on-time completion rate
  async calculateOnTimeRate(where) {
    const completedTasks = await prisma.task.findMany({
      where: { ...where, status: 'COMPLETED' },
      select: { dueDate: true, updatedAt: true }
    });

    if (completedTasks.length === 0) return 0;

    const onTimeTasks = completedTasks.filter(task => 
      new Date(task.updatedAt) <= new Date(task.dueDate)
    ).length;

    return (onTimeTasks / completedTasks.length) * 100;
  },

  // Get overdue tasks for escalation
  async getOverdueTasksForEscalation() {
    const overdueTasks = await prisma.task.findMany({
      where: {
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        dueDate: { lt: new Date() }
      },
      include: {
        assignedUser: true,
        assignedByUser: true
      }
    });

    // Escalate tasks that are more than 3 days overdue
    const criticalOverdue = overdueTasks.filter(task => {
      const daysOverdue = Math.ceil((new Date() - task.dueDate) / (1000 * 60 * 60 * 24));
      return daysOverdue >= 3;
    });

    for (const task of criticalOverdue) {
      await notificationService.createNotification({
        userId: task.assignedById,
        title: `CRITICAL: Overdue Task Needs Attention`,
        body: `Task "${task.title}" assigned to ${task.assignedUser.name} is ${Math.ceil((new Date() - task.dueDate) / (1000 * 60 * 60 * 24))} days overdue`,
        type: 'WARNING',
        priority: 'HIGH',
        actionUrl: `/dashboard/tasks`,
        metadata: {
          taskId: task.id,
          assignedTo: task.assignedUser.name,
          daysOverdue: Math.ceil((new Date() - task.dueDate) / (1000 * 60 * 60 * 24))
        },
        sendEmail: true
      });
    }

    return criticalOverdue.length;
  }


  
};