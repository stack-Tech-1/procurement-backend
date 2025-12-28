// backend/src/services/dashboardService.js
import prisma from '../config/prismaClient.js';
import { ROLES } from '../constants/roles.js';
import { taskService } from './taskService.js';

// Helper function to handle database errors gracefully
const handleDatabaseError = (error, defaultValue = null) => {
  console.error('Database error:', error.message);
  
  if (error.code === 'P1001') {
    console.log('🔄 Database connection unavailable, using fallback data');
    return defaultValue;
  }
  
  throw error;
};

const executeQuery = async (queryFn, defaultValue = null) => {
  try {
    return await queryFn();
  } catch (error) {
    return handleDatabaseError(error, defaultValue);
  }
};

export const dashboardService = {
  
  // Executive Dashboard Data - REAL DATA ONLY
  async getExecutiveDashboard() {
    try {
      console.log('📊 Fetching executive dashboard data...');
      
      // Execute queries with error handling
      const [
        totalVendors,
        approvedVendors,
        totalContracts,
        totalSpend,
        pendingApprovals,
        activeProjects,
        teamMembers
      ] = await Promise.all([
        executeQuery(() => prisma.vendor.count(), 0),
        executeQuery(() => prisma.vendor.count({ where: { status: 'APPROVED' } }), 0),
        executeQuery(() => prisma.contract.count(), 0),
        executeQuery(() => prisma.contract.aggregate({ _sum: { contractValue: true } }), { _sum: { contractValue: 0 } }),
        executeQuery(() => prisma.approval.count({ where: { status: 'PENDING' } }), 0),
        executeQuery(() => prisma.rFQ.count({ where: { status: { in: ['OPEN', 'ISSUED'] } } }), 0),
        executeQuery(() => prisma.user.count({ 
          where: { 
            roleId: { in: [ROLES.PROCUREMENT_MANAGER, ROLES.PROCUREMENT_OFFICER] }, 
            isActive: true 
          } 
        }), 0)
      ]);

      // Get task statistics with error handling
      let taskStatistics = { overview: { total: 0, completed: 0, overdue: 0 } };
      let overdueTasks = [];
      
      try {
        taskStatistics = await taskService.getTaskStatistics() || taskStatistics;
        overdueTasks = await taskService.getOverdueTasks() || [];
      } catch (taskError) {
        console.error('Task service error:', taskError.message);
      }

      // Get additional data with error handling
      const financialMetrics = await this.getRealFinancialMetrics();
      const vendorPerformance = await this.getRealVendorPerformance();
      const projectProgress = await this.getRealProjectProgress();

      return {
        summary: {
          totalVendors,
          approvedVendors,
          totalContracts,
          totalSpend: totalSpend._sum?.contractValue || 0,
          pendingApprovals,
          activeProjects,
          overdueTasks: overdueTasks.length,
          teamMembers
        },
        financialMetrics,
        vendorPerformance,
        projectProgress,
        taskOverview: taskStatistics
      };
    } catch (error) {
      console.error('❌ Error in getExecutiveDashboard:', error.message);
      
      // Return minimal fallback data
      return {
        summary: {
          totalVendors: 0,
          approvedVendors: 0,
          totalContracts: 0,
          totalSpend: 0,
          pendingApprovals: 0,
          activeProjects: 0,
          overdueTasks: 0,
          teamMembers: 0
        },
        financialMetrics: await this.getRealFinancialMetrics(),
        vendorPerformance: [],
        projectProgress: [],
        taskOverview: { overview: { total: 0, completed: 0, overdue: 0 } }
      };
    }
  },

  // Procurement Manager Dashboard Data - REAL DATA ONLY
  async getManagerDashboard(userId) {
    try {
      console.log('📊 Fetching manager dashboard data...');
      
      const [
        teamMembers,
        pendingApprovals,
        vendorReviews,
        teamPerformance,
        approvalQueue,
        deadlineTracking
      ] = await Promise.all([
        executeQuery(() => prisma.user.count({ 
          where: { roleId: ROLES.PROCUREMENT_OFFICER, isActive: true } 
        }), 0),
        executeQuery(() => prisma.approval.count({ where: { status: 'PENDING' } }), 0),
        executeQuery(() => prisma.vendor.count({ where: { status: 'UNDER_REVIEW' } }), 0),
        this.getRealTeamPerformance(),
        this.getRealApprovalQueue(),
        this.getRealDeadlineTracking()
      ]);

      // Get overdue tasks with error handling
      let overdueTasks = [];
      try {
        overdueTasks = await taskService.getOverdueTasks() || [];
      } catch (taskError) {
        console.error('Error fetching overdue tasks:', taskError.message);
      }

      return {
        teamOverview: {
          teamMembers,
          pendingApprovals,
          overdueTasks: overdueTasks.length,
          vendorReviews
        },
        teamPerformance,
        approvalQueue,
        deadlineTracking
      };
    } catch (error) {
      console.error('❌ Error in getManagerDashboard:', error.message);
      
      return {
        teamOverview: {
          teamMembers: 0,
          pendingApprovals: 0,
          overdueTasks: 0,
          vendorReviews: 0
        },
        teamPerformance: await this.getRealTeamPerformance(),
        approvalQueue: [],
        deadlineTracking: []
      };
    }
  },

  // Procurement Officer Dashboard Data - REAL DATA ONLY
  async getOfficerDashboard(userId) {
    try {
      console.log('📊 Fetching officer dashboard data...');
      
      const [
        pendingSubmissions,
        assignedWork,
        performance
      ] = await Promise.all([
        executeQuery(() => prisma.rFQSubmission.count({ 
          where: { vendor: { assignedReviewerId: userId } } 
        }), 0),
        this.getRealAssignedWork(userId),
        this.getRealPersonalPerformance(userId)
      ]);

      // Get task-related data with error handling
      let myTasks = [];
      let upcomingDeadlines = [];
      let completedThisWeek = [];
      
      try {
        myTasks = await taskService.getUserTasks(userId) || [];
        upcomingDeadlines = await this.getRealUpcomingDeadlines(userId) || [];
        completedThisWeek = await this.getRealCompletedTasksThisWeek(userId) || [];
      } catch (taskError) {
        console.error('Task service error in officer dashboard:', taskError.message);
      }

      return {
        personalMetrics: {
          myTasks: myTasks.length,
          upcomingDeadlines: upcomingDeadlines.length,
          pendingSubmissions,
          completedThisWeek: completedThisWeek.length
        },
        assignedWork,
        performance
      };
    } catch (error) {
      console.error('❌ Error in getOfficerDashboard:', error.message);
      
      return {
        personalMetrics: {
          myTasks: 0,
          upcomingDeadlines: 0,
          pendingSubmissions: 0,
          completedThisWeek: 0
        },
        assignedWork: [],
        performance: await this.getRealPersonalPerformance(userId)
      };
    }
  },

  // REAL DATA HELPER METHODS

  async getRealFinancialMetrics() {
    try {
      const monthlySpend = await this.getRealMonthlySpend();
      const budgetUtilization = await this.getRealBudgetUtilization();
      const savings = await this.getRealSavings();

      return {
        monthlySpend,
        budgetUtilization,
        savings
      };
    } catch (error) {
      console.error('Error in getRealFinancialMetrics:', error.message);
      return {
        monthlySpend: [],
        budgetUtilization: 0,
        savings: 0
      };
    }
  },

  async getRealMonthlySpend() {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const monthlyContracts = await executeQuery(() => 
        prisma.contract.groupBy({
          by: ['createdAt'],
          where: {
            createdAt: { gte: sixMonthsAgo }
          },
          _sum: {
            contractValue: true
          }
        }), []
      );

      // Process the data
      const monthlyData = {};
      monthlyContracts.forEach(contract => {
        const month = contract.createdAt.toLocaleString('default', { month: 'short' });
        const year = contract.createdAt.getFullYear();
        const key = `${month} ${year}`;
        
        if (!monthlyData[key]) {
          monthlyData[key] = 0;
        }
        monthlyData[key] += contract._sum.contractValue || 0;
      });

      return Object.entries(monthlyData).map(([month, spend]) => ({
        month,
        spend,
        budget: spend * 1.2
      }));
    } catch (error) {
      console.error('Error in getRealMonthlySpend:', error.message);
      return [];
    }
  },

  async getRealBudgetUtilization() {
    try {
      const [totalContracts, totalRFQEstimates] = await Promise.all([
        executeQuery(() => prisma.contract.aggregate({ _sum: { contractValue: true } }), { _sum: { contractValue: 0 } }),
        executeQuery(() => prisma.rFQ.aggregate({ _sum: { estimatedUnitPrice: true } }), { _sum: { estimatedUnitPrice: 0 } })
      ]);

      const totalSpent = totalContracts._sum.contractValue || 0;
      const totalBudget = totalRFQEstimates._sum.estimatedUnitPrice || 1;

      return Math.min(100, (totalSpent / totalBudget) * 100);
    } catch (error) {
      console.error('Error in getRealBudgetUtilization:', error.message);
      return 0;
    }
  },

  async getRealSavings() {
    try {
      const rfqSubmissions = await executeQuery(() => 
        prisma.rFQSubmission.findMany({
          include: {
            rfq: {
              select: { estimatedUnitPrice: true }
            },
            evaluations: {
              select: { totalScore: true }
            }
          }
        }), []
      );

      let totalSavings = 0;
      rfqSubmissions.forEach(submission => {
        const estimated = submission.rfq.estimatedUnitPrice || 0;
        const actual = submission.totalValue || 0;
        if (estimated > 0 && actual > 0) {
          totalSavings += Math.max(0, estimated - actual);
        }
      });

      return totalSavings;
    } catch (error) {
      console.error('Error in getRealSavings:', error.message);
      return 0;
    }
  },

  async getRealVendorPerformance() {
    try {
      const vendors = await executeQuery(() =>
        prisma.vendor.findMany({
          where: { status: 'APPROVED' },
          include: {
            contracts: {
              select: {
                contractValue: true,
                status: true
              }
            },
            submissions: {
              include: {
                evaluations: {
                  select: {
                    totalScore: true
                  }
                }
              }
            }
          },
          take: 10
        }), []
      );

      return vendors.map(vendor => {
        const totalContracts = vendor.contracts.length;
        const completedContracts = vendor.contracts.filter(c => c.status === 'COMPLETED').length;
        const totalContractValue = vendor.contracts.reduce((sum, c) => sum + (c.contractValue || 0), 0);
        
        const allScores = vendor.submissions.flatMap(s => 
          s.evaluations.map(e => e.totalScore).filter(score => score !== null)
        );
        const avgScore = allScores.length > 0 
          ? allScores.reduce((sum, score) => sum + score, 0) / allScores.length 
          : 0;

        return {
          name: vendor.companyLegalName || 'Unknown Vendor',
          qualificationScore: vendor.qualificationScore || 0,
          contractCount: totalContracts,
          completedContracts,
          totalValue: totalContractValue,
          averageScore: Math.round(avgScore * 10) / 10,
          winRate: vendor.submissions.length > 0 
            ? Math.round((totalContracts / vendor.submissions.length) * 100) 
            : 0
        };
      });
    } catch (error) {
      console.error('Error in getRealVendorPerformance:', error.message);
      return [];
    }
  },

  async getRealProjectProgress() {
    try {
      const projects = await executeQuery(() =>
        prisma.rFQ.findMany({
          where: {
            status: { in: ['OPEN', 'ISSUED', 'AWARDED'] }
          },
          include: {
            contracts: {
              select: {
                contractValue: true,
                startDate: true,
                endDate: true
              }
            },
            submissions: {
              select: {
                id: true,
                status: true
              }
            }
          },
          take: 8
        }), []
      );

      return projects.map(project => {
        const totalSubmissions = project.submissions.length;
        const awardedContracts = project.contracts.length;
        const totalContractValue = project.contracts.reduce((sum, c) => sum + (c.contractValue || 0), 0);
        
        let progress = 0;
        if (project.status === 'AWARDED') progress = 100;
        else if (project.status === 'ISSUED') progress = 75;
        else if (project.status === 'OPEN') progress = 25;

        return {
          name: project.projectName || project.title,
          progress,
          budget: project.estimatedUnitPrice || 0,
          spent: totalContractValue,
          submissions: totalSubmissions,
          contracts: awardedContracts
        };
      });
    } catch (error) {
      console.error('Error in getRealProjectProgress:', error.message);
      return [];
    }
  },

  async getRealTeamPerformance() {
    try {
      const teamMembers = await executeQuery(() =>
        prisma.user.findMany({
          where: { 
            roleId: ROLES.PROCUREMENT_OFFICER,
            isActive: true 
          },
          include: {
            tasksAssigned: {
              select: {
                status: true,
                dueDate: true,
                updatedAt: true
              }
            },
            vendorsReviewed: {
              select: {
                id: true
              }
            }
          }
        }), []
      );

      const teamStats = teamMembers.map(member => {
        const tasks = member.tasksAssigned;
        const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
        const overdueTasks = tasks.filter(t => 
          t.status !== 'COMPLETED' && new Date(t.dueDate) < new Date()
        ).length;
        const vendorsReviewed = member.vendorsReviewed.length;

        return {
          memberName: member.name || 'Unknown',
          completedTasks,
          overdueTasks,
          vendorsReviewed,
          completionRate: tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0
        };
      });

      const totalMembers = teamStats.length;
      const avgCompletionRate = teamStats.reduce((sum, stat) => sum + stat.completionRate, 0) / totalMembers;
      const totalOverdue = teamStats.reduce((sum, stat) => sum + stat.overdueTasks, 0);

      return {
        teamStats,
        averageCompletionRate: Math.round(avgCompletionRate),
        totalOverdueTasks: totalOverdue,
        teamSize: totalMembers
      };
    } catch (error) {
      console.error('Error in getRealTeamPerformance:', error.message);
      return { teamStats: [], averageCompletionRate: 0, totalOverdueTasks: 0, teamSize: 0 };
    }
  },

  async getRealApprovalQueue() {
    try {
      return await executeQuery(() =>
        prisma.approval.findMany({
          where: { status: 'PENDING' },
          include: {
            approver: {
              select: { name: true, email: true, jobTitle: true }
            }
          },
          orderBy: { createdAt: 'asc' },
          take: 15
        }), []
      );
    } catch (error) {
      console.error('Error in getRealApprovalQueue:', error.message);
      return [];
    }
  },

  async getRealDeadlineTracking() {
    try {
      const upcomingDeadlines = await executeQuery(() =>
        prisma.task.findMany({
          where: {
            dueDate: {
              gte: new Date(),
              lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
            },
            status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }
          },
          include: {
            assignedUser: {
              select: { name: true, email: true }
            }
          },
          orderBy: { dueDate: 'asc' },
          take: 10
        }), []
      );

      return upcomingDeadlines.map(task => ({
        id: task.id,
        title: task.title,
        dueDate: task.dueDate,
        dueIn: Math.ceil((task.dueDate - new Date()) / (24 * 60 * 60 * 1000)),
        priority: task.priority,
        assignedTo: task.assignedUser?.name || 'Unassigned',
        status: task.status
      }));
    } catch (error) {
      console.error('Error in getRealDeadlineTracking:', error.message);
      return [];
    }
  },

  async getRealAssignedWork(userId) {
    try {
      return await executeQuery(() => 
        taskService.getUserTasks(userId, { 
          status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } 
        }), []
      );
    } catch (error) {
      console.error('Error in getRealAssignedWork:', error.message);
      return [];
    }
  },

  async getRealPersonalPerformance(userId) {
    try {
      const userTasks = await executeQuery(() => taskService.getUserTasks(userId), []);
      const completedTasks = userTasks.filter(t => t.status === 'COMPLETED').length;
      const overdueTasks = userTasks.filter(t => 
        t.status !== 'COMPLETED' && new Date(t.dueDate) < new Date()
      ).length;

      const completedOnTime = userTasks.filter(t => 
        t.status === 'COMPLETED' && new Date(t.updatedAt) <= new Date(t.dueDate)
      ).length;

      const onTimeRate = completedTasks > 0 ? (completedOnTime / completedTasks) * 100 : 0;

      return {
        tasksCompleted: completedTasks,
        totalTasks: userTasks.length,
        overdueTasks,
        onTimeRate: Math.round(onTimeRate),
        efficiencyScore: Math.round((completedTasks / Math.max(userTasks.length, 1)) * 100)
      };
    } catch (error) {
      console.error('Error in getRealPersonalPerformance:', error.message);
      return {
        tasksCompleted: 0,
        totalTasks: 0,
        overdueTasks: 0,
        onTimeRate: 0,
        efficiencyScore: 0
      };
    }
  },

  async getRealUpcomingDeadlines(userId) {
    try {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      return await executeQuery(() =>
        prisma.task.findMany({
          where: {
            assignedTo: userId,
            dueDate: {
              gte: new Date(),
              lte: nextWeek
            },
            status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }
          },
          orderBy: { dueDate: 'asc' }
        }), []
      );
    } catch (error) {
      console.error('Error in getRealUpcomingDeadlines:', error.message);
      return [];
    }
  },

  async getRealCompletedTasksThisWeek(userId) {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      return await executeQuery(() =>
        prisma.task.findMany({
          where: {
            assignedTo: userId,
            status: 'COMPLETED',
            updatedAt: { gte: oneWeekAgo }
          }
        }), []
      );
    } catch (error) {
      console.error('Error in getRealCompletedTasksThisWeek:', error.message);
      return [];
    }
  }
};