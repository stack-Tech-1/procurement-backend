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
            try {
              console.log(`📊 Fetching task statistics for user ${userId}, role ${roleId}`);
              
              // Base query conditions based on role
              let whereCondition = {};
              
              if (roleId === ROLES.PROCUREMENT_MANAGER) {
                // Manager sees team's tasks
                whereCondition = {
                  OR: [
                    { assignedTo: userId },
                    { assignedById: userId }
                  ]
                };
              } else if (roleId === ROLES.PROCUREMENT_OFFICER) {
                // Officer sees only their tasks
                whereCondition = { assignedTo: userId };
              } else {
                // Other roles (admin, executive) see all tasks
                whereCondition = {};
              }
              
              // Execute all queries in parallel for efficiency
              const [
                totalTasks,
                completedTasks,
                overdueTasks,
                pendingTasks,
                highPriorityTasks,
                tasksDueThisWeek
              ] = await Promise.all([
                // Total tasks
                prisma.task.count({ where: whereCondition }),
                
                // Completed tasks
                prisma.task.count({ 
                  where: { 
                    ...whereCondition,
                    status: 'COMPLETED' 
                  }
                }),
                
                // Overdue tasks
                prisma.task.count({ 
                  where: { 
                    ...whereCondition,
                    status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
                    dueDate: { lt: new Date() }
                  }
                }),
                
                // Pending tasks (not completed)
                prisma.task.count({ 
                  where: { 
                    ...whereCondition,
                    status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }
                  }
                }),
                
                // High priority tasks
                prisma.task.count({ 
                  where: { 
                    ...whereCondition,
                    priority: { in: ['HIGH', 'URGENT'] },
                    status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }
                  }
                }),
                
                // Tasks due this week
                prisma.task.count({ 
                  where: { 
                    ...whereCondition,
                    dueDate: {
                      gte: new Date(),
                      lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    },
                    status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }
                  }
                })
              ]);

              // Calculate rates
              const completionRate = Math.round((completedTasks / Math.max(totalTasks, 1)) * 100);
              const overdueRate = Math.round((overdueTasks / Math.max(totalTasks, 1)) * 100);
              
              // Get recent tasks for timeline
              const recentTasks = await prisma.task.findMany({
                where: whereCondition,
                orderBy: { createdAt: 'desc' },
                take: 10,
                include: {
                  assignedUser: {
                    select: { name: true, email: true }
                  },
                  assignedByUser: {
                    select: { name: true }
                  }
                }
              });

              // Format recent tasks for display
              const formattedRecentTasks = recentTasks.map(task => ({
                id: task.id,
                title: task.title,
                status: task.status,
                priority: task.priority,
                dueDate: task.dueDate,
                assignedTo: task.assignedUser?.name || 'Unassigned',
                assignedBy: task.assignedByUser?.name || 'System',
                taskType: task.taskType,
                createdAt: task.createdAt
              }));

              // Get task distribution by priority
              const priorityDistribution = await prisma.task.groupBy({
                by: ['priority'],
                where: whereCondition,
                _count: { priority: true }
              });

              // Get task distribution by status
              const statusDistribution = await prisma.task.groupBy({
                by: ['status'],
                where: whereCondition,
                _count: { status: true }
              });

              return {
                overview: {
                  totalTasks,
                  completedTasks,
                  overdueTasks,
                  pendingTasks,
                  completionRate,
                  overdueRate,
                  highPriorityTasks,
                  tasksDueThisWeek
                },
                recentTasks: formattedRecentTasks,
                distributions: {
                  priority: priorityDistribution.map(item => ({
                    name: item.priority,
                    count: item._count.priority,
                    percentage: Math.round((item._count.priority / totalTasks) * 100)
                  })),
                  status: statusDistribution.map(item => ({
                    name: item.status,
                    count: item._count.status,
                    percentage: Math.round((item._count.status / totalTasks) * 100)
                  }))
                },
                metrics: {
                  averageCompletionTime: await this.calculateAverageCompletionTime(whereCondition),
                  onTimeCompletionRate: await this.calculateOnTimeCompletionRate(whereCondition)
                }
              };
            } catch (error) {
              console.error('❌ Error in getTaskStatistics:', error);
              
              // Return fallback data
              return {
                overview: {
                  totalTasks: 0,
                  completedTasks: 0,
                  overdueTasks: 0,
                  pendingTasks: 0,
                  completionRate: 0,
                  overdueRate: 0,
                  highPriorityTasks: 0,
                  tasksDueThisWeek: 0
                },
                recentTasks: [],
                distributions: {
                  priority: [],
                  status: []
                },
                metrics: {
                  averageCompletionTime: 0,
                  onTimeCompletionRate: 0
                }
              };
            }
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
  },
  
  // Add these helper methods to your taskService class
  async calculateAverageCompletionTime(whereCondition) {
    try {
      console.log('🔧 Calculating average completion time with where:', whereCondition);
      
      // FIX: Use a simpler approach - don't use not: null
      const where = {
        status: 'COMPLETED'
      };
      
      // Add OR conditions if they exist
      if (whereCondition.OR) {
        where.OR = whereCondition.OR;
      } else if (whereCondition.assignedTo) {
        where.assignedTo = whereCondition.assignedTo;
      }
      
      // FIX: Instead of not: null, filter after fetching
      const completedTasks = await prisma.task.findMany({
        where: where,
        select: {
          createdAt: true,
          updatedAt: true
        }
      });
  
      // Filter out tasks with null dates after fetching
      const validTasks = completedTasks.filter(task => 
        task.createdAt && task.updatedAt
      );
  
      if (validTasks.length === 0) {
        console.log('🔧 No valid completed tasks found');
        return 0;
      }
  
      const totalDuration = validTasks.reduce((sum, task) => {
        const duration = task.updatedAt - task.createdAt;
        return sum + duration;
      }, 0);
  
      const averageDays = totalDuration / validTasks.length / (24 * 60 * 60 * 1000);
      const result = Math.round(averageDays * 10) / 10;
      
      console.log('🔧 Average completion time calculated:', result, 'days from', validTasks.length, 'tasks');
      return result;
      
    } catch (error) {
      console.error('❌ Error calculating average completion time:', error);
      return 0;
    }
  },

async calculateOnTimeCompletionRate(whereCondition) {
  try {
    const onTimeTasks = await prisma.task.count({
      where: {
        ...whereCondition,
        status: 'COMPLETED',
        updatedAt: { lte: prisma.task.fields.dueDate } // Completed before or on due date
      }
    });

    const totalCompleted = await prisma.task.count({
      where: {
        ...whereCondition,
        status: 'COMPLETED'
      }
    });

    if (totalCompleted === 0) return 0;
    
    return Math.round((onTimeTasks / totalCompleted) * 100);
  } catch (error) {
    console.error('Error calculating on-time completion rate:', error);
    return 0;
  }
}

  
};