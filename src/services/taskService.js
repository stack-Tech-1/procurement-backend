// backend/src/services/taskService.js - ENHANCED VERSION
import prisma from '../config/prismaClient.js';
import { notificationService } from './notificationService.js';
import { emailService } from './emailService.js';
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

  // Create task with notification + email
  async createTask(taskData) {
    const task = await prisma.task.create({
      data: {
        title: taskData.title,
        description: taskData.description,
        taskType: taskData.taskType,
        assignedTo: parseInt(taskData.assignedTo),
        assignedById: taskData.assignedById,
        dueDate: new Date(taskData.dueDate),
        priority: taskData.priority || 'MEDIUM',
        status: 'NOT_STARTED',
        remarks: taskData.remarks,
        relatedModule: taskData.relatedModule || null,
        relatedEntityId: taskData.relatedEntityId ? parseInt(taskData.relatedEntityId) : null,
      },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
        assignedByUser: { select: { id: true, name: true, email: true } },
      },
    });

    // In-app notification
    await notificationService.createNotification({
      userId: task.assignedTo,
      title: `New Task Assigned: ${task.title}`,
      body: `You have been assigned a new task. Due: ${new Date(task.dueDate).toLocaleDateString()}`,
      type: 'INFO',
      priority: task.priority === 'HIGH' || task.priority === 'URGENT' ? 'HIGH' : 'MEDIUM',
      actionUrl: '/dashboard/tasks',
      metadata: { taskId: task.id, taskType: task.taskType, dueDate: task.dueDate },
    });

    // Email notification to assigned user
    if (task.assignedUser?.email) {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      await emailService.sendEmail({
        to: task.assignedUser.email,
        subject: `New Task Assigned: ${task.title}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
            <div style="background:#0A1628;padding:20px 28px"><h2 style="color:#B8960A;margin:0">New Task Assigned</h2></div>
            <div style="padding:28px">
              <p style="color:#374151">Hi ${task.assignedUser.name},</p>
              <p style="color:#374151">You have been assigned a new task by <strong>${task.assignedByUser?.name || 'your manager'}</strong>:</p>
              <div style="background:#f9fafb;border-left:4px solid #B8960A;padding:16px;border-radius:4px;margin:16px 0">
                <p style="margin:0 0 8px;font-weight:bold;font-size:16px;color:#111827">${task.title}</p>
                ${task.description ? `<p style="margin:0 0 8px;color:#6b7280;font-size:14px">${task.description}</p>` : ''}
                <p style="margin:0;color:#6b7280;font-size:13px">Due: <strong>${new Date(task.dueDate).toLocaleDateString('en-SA', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</strong> · Priority: <strong>${task.priority}</strong></p>
              </div>
              <a href="${baseUrl}/dashboard/tasks" style="display:inline-block;background:#B8960A;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold">View Task</a>
            </div>
          </div>`,
      }).catch(err => console.error('[createTask] Email failed:', err));
    }

    return task;
  },

  // Update task status with validation (supports progressPct + completedAt)
  async updateTaskStatus(taskId, status, remarks, userId, progressPct) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
        assignedByUser: { select: { id: true, name: true, email: true } },
      },
    });

    if (!task) throw new Error('Task not found');

    if (task.assignedTo !== userId && task.assignedById !== userId) {
      throw new Error('Unauthorized to update this task');
    }

    const updateData = {
      status,
      updatedAt: new Date(),
      ...(remarks !== undefined && { remarks }),
      ...(progressPct !== undefined && { progressPct: Math.min(100, Math.max(0, parseInt(progressPct) || 0)) }),
    };

    if (status === 'COMPLETED') {
      updateData.completedAt = new Date();
      updateData.progressPct = 100;
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: { assignedUser: { select: { id: true, name: true, email: true } } },
    });

    // Notify + email manager when task is completed
    if (status === 'COMPLETED') {
      await notificationService.createNotification({
        userId: task.assignedById,
        title: `Task Completed: ${task.title}`,
        body: `Task assigned to ${task.assignedUser?.name} has been completed`,
        type: 'INFO',
        priority: 'MEDIUM',
        actionUrl: '/dashboard/tasks',
        metadata: { taskId: task.id, completedBy: task.assignedUser?.name },
      });

      if (task.assignedByUser?.email && task.assignedById !== userId) {
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        await emailService.sendEmail({
          to: task.assignedByUser.email,
          subject: `✅ Task Completed: ${task.title}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
              <div style="background:#0A1628;padding:20px 28px"><h2 style="color:#B8960A;margin:0">Task Completed</h2></div>
              <div style="padding:28px">
                <p style="color:#374151">Hi ${task.assignedByUser.name},</p>
                <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px;border-radius:4px;margin:16px 0">
                  <p style="margin:0 0 6px;font-weight:bold;font-size:15px;color:#111827">${task.title}</p>
                  <p style="margin:0;color:#6b7280;font-size:13px">Completed by <strong>${task.assignedUser?.name}</strong> on ${new Date().toLocaleDateString('en-SA')}</p>
                </div>
                <a href="${baseUrl}/dashboard/tasks" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold">View Task</a>
              </div>
            </div>`,
        }).catch(err => console.error('[updateTaskStatus] Email failed:', err));
      }
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

// ─── New: my-tasks endpoint ───────────────────────────────────────────────────
  async getMyTasksList(userId, filters = {}) {
    const where = { assignedTo: userId };
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignedByUser: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const now = new Date();
    return tasks.map(t => ({
      id: t.id,
      title: t.title,
      taskType: t.taskType,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      daysUntilDue: Math.ceil((new Date(t.dueDate) - now) / 86400000),
      isEscalated: t.isEscalated,
      reminderSent: t.reminderSent,
      progressPct: t.progressPct,
      remarks: t.remarks,
      relatedModule: t.relatedModule,
      relatedEntityId: t.relatedEntityId,
      assignedByName: t.assignedByUser?.name || null,
      assignedById: t.assignedByUser?.id || null,
    }));
  },

  // ─── New: team-overview endpoint ─────────────────────────────────────────────
  async getTeamOverviewData(managerId, roleId) {
    const whereTeam = roleId <= 1 ? {} : { assignedById: managerId };

    const allTasks = await prisma.task.findMany({
      where: whereTeam,
      include: {
        assignedUser: { select: { id: true, name: true, email: true, jobTitle: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    // Group by assignee
    const byUser = new Map();
    for (const task of allTasks) {
      const uid = task.assignedTo;
      if (!byUser.has(uid)) {
        byUser.set(uid, {
          userId: uid,
          userName: task.assignedUser?.name || 'Unknown',
          jobTitle: task.assignedUser?.jobTitle || '',
          tasks: [],
          overdueCount: 0,
          inProgressCount: 0,
          completedLast30Days: 0,
        });
      }
      const u = byUser.get(uid);
      u.tasks.push({
        id: task.id,
        title: task.title,
        taskType: task.taskType,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
        daysUntilDue: Math.ceil((new Date(task.dueDate) - now) / 86400000),
        isEscalated: task.isEscalated,
        progressPct: task.progressPct,
      });
      if (task.status === 'OVERDUE') u.overdueCount++;
      if (task.status === 'IN_PROGRESS') u.inProgressCount++;
      if (task.status === 'COMPLETED' && task.completedAt && new Date(task.completedAt) >= thirtyDaysAgo) {
        u.completedLast30Days++;
      }
    }

    const teamMembers = Array.from(byUser.values()).map(u => {
      const total = u.tasks.length;
      const completed = u.tasks.filter(t => t.status === 'COMPLETED').length;
      return { ...u, successRate: total > 0 ? Math.round((completed / total) * 100) : 0 };
    });

    const totalTasks = allTasks.length;
    const totalOverdue = allTasks.filter(t => t.status === 'OVERDUE').length;
    const totalCompleted = allTasks.filter(t => t.status === 'COMPLETED').length;
    const avgSuccessRate = teamMembers.length > 0
      ? Math.round(teamMembers.reduce((s, u) => s + u.successRate, 0) / teamMembers.length)
      : 0;

    return { teamMembers, totals: { totalTasks, totalOverdue, totalCompleted, averageSuccessRate: avgSuccessRate } };
  },

  // ─── New: reassign task ───────────────────────────────────────────────────────
  async reassignTask(taskId, newAssignedToId, reason, managerId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
        assignedByUser: { select: { id: true, name: true } },
      },
    });
    if (!task) throw new Error('Task not found');

    const newAssignee = await prisma.user.findUnique({
      where: { id: parseInt(newAssignedToId) },
      select: { id: true, name: true, email: true },
    });
    if (!newAssignee) throw new Error('New assignee not found');

    const oldName = task.assignedUser?.name || 'Unknown';
    const reassignNote = `[Reassigned ${new Date().toLocaleDateString('en-SA')}: from ${oldName} to ${newAssignee.name}. Reason: ${reason || 'N/A'}]`;
    const updatedRemarks = task.remarks ? `${task.remarks}\n${reassignNote}` : reassignNote;

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { assignedTo: newAssignee.id, remarks: updatedRemarks },
      include: { assignedUser: { select: { id: true, name: true, email: true } } },
    });

    await notificationService.createNotification({
      userId: newAssignee.id,
      title: `Task Reassigned to You: ${task.title}`,
      body: `You have been assigned a task previously held by ${oldName}. Due: ${new Date(task.dueDate).toLocaleDateString()}`,
      type: 'INFO',
      priority: task.priority === 'HIGH' || task.priority === 'URGENT' ? 'HIGH' : 'MEDIUM',
      actionUrl: '/dashboard/tasks',
      metadata: { taskId: task.id },
    });

    if (newAssignee.email) {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      await emailService.sendEmail({
        to: newAssignee.email,
        subject: `Task Reassigned to You: ${task.title}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
            <div style="background:#0A1628;padding:20px 28px"><h2 style="color:#B8960A;margin:0">Task Reassigned</h2></div>
            <div style="padding:28px">
              <p style="color:#374151">Hi ${newAssignee.name},</p>
              <p>A task has been reassigned to you:</p>
              <div style="background:#f9fafb;border-left:4px solid #B8960A;padding:16px;border-radius:4px;margin:16px 0">
                <p style="margin:0 0 6px;font-weight:bold;font-size:15px">${task.title}</p>
                <p style="margin:0;color:#6b7280;font-size:13px">Previously assigned to: ${oldName} · Due: ${new Date(task.dueDate).toLocaleDateString('en-SA')}</p>
                ${reason ? `<p style="margin:6px 0 0;color:#6b7280;font-size:13px">Reason: ${reason}</p>` : ''}
              </div>
              <a href="${baseUrl}/dashboard/tasks" style="display:inline-block;background:#B8960A;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold">View Task</a>
            </div>
          </div>`,
      }).catch(err => console.error('[reassignTask] Email failed:', err));
    }

    return updated;
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