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
        // Assuming taskService.getTaskStatistics returns { overview: { total, completed, overdue } }
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
        financialMetrics: { monthlySpend: [], budgetUtilization: 0, savings: 0 }, // Fallback for nested objects
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
        teamPerformance: { teamStats: [], averageCompletionRate: 0, totalOverdueTasks: 0, teamSize: 0 }, // Fallback
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
          // Assuming 'assignedReviewerId' is linked to the vendor/rfq submission process
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
        // NOTE: taskService.getUserTasks needs to be available and return data
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
        performance: {
          tasksCompleted: 0,
          totalTasks: 0,
          overdueTasks: 0,
          onTimeRate: 0,
          efficiencyScore: 0
        }
      };
    }
  },

  // REAL DATA HELPER METHODS

  async getRealFinancialMetrics() {
    try {
      // Concurrent fetching of sub-metrics
      const [monthlySpend, budgetUtilization, savings] = await Promise.all([
        this.getRealMonthlySpend(),
        this.getRealBudgetUtilization(),
        this.getRealSavings()
      ]);

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

  /**
   * Retrieves monthly contract spend data and aggregates it in memory for database compatibility.
   * FIX: Changed from groupBy on date to findMany + JS aggregation for robust monthly grouping.
   */
  async getRealMonthlySpend() {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      // Fetch all relevant contracts and their values
      const contracts = await executeQuery(() => 
        prisma.contract.findMany({
          where: {
            createdAt: { gte: sixMonthsAgo }
          },
          select: {
            createdAt: true,
            contractValue: true
          }
        }), []
      );

      // Process the data to group by month and sum the spend
      const monthlyData = {};
      contracts.forEach(contract => {
        if (contract.createdAt && contract.contractValue !== null) {
          // Ensure month names are consistent regardless of execution locale
          const month = contract.createdAt.toISOString().substring(0, 7); // YYYY-MM format for unique month key
          
          if (!monthlyData[month]) {
            monthlyData[month] = 0;
          }
          monthlyData[month] += contract.contractValue;
        }
      });

      // Convert to array and calculate budget (simplified, fixed to 120% of spend)
      return Object.entries(monthlyData)
        .sort(([monthA], [monthB]) => monthA.localeCompare(monthB)) // Sort by YYYY-MM key
        .map(([monthKey, spend]) => ({
          // Convert YYYY-MM key back to readable format for the frontend
          month: new Date(monthKey + '-01').toLocaleString('default', { month: 'short', year: 'numeric' }),
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
      const totalBudget = totalRFQEstimates._sum.estimatedUnitPrice || 1; // Avoid division by zero

      return Math.min(100, (totalSpent / totalBudget) * 100);
    } catch (error) {
      console.error('Error in getRealBudgetUtilization:', error.message);
      return 0;
    }
  },

  async getRealSavings() {
    try {
      // OPTIMIZATION: Explicitly select only needed fields
      const rfqSubmissions = await executeQuery(() => 
        prisma.rFQSubmission.findMany({
          select: {
            totalValue: true, // Assuming this field exists and represents the final submitted cost
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
        const estimated = submission.rfq?.estimatedUnitPrice || 0;
        const actual = submission.totalValue || 0;
        
        // Calculate savings only if both values are valid and estimated is higher
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
      // OPTIMIZATION: Explicitly select only needed fields
      const vendors = await executeQuery(() =>
        prisma.vendor.findMany({
          where: { status: 'APPROVED' },
          select: { // Use select on the main model
            companyLegalName: true,
            qualificationScore: true,
            contracts: { // Use select on relations
              select: {
                contractValue: true,
                status: true
              }
            },
            submissions: {
              select: { // Use select on relations
                id: true,
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
      // OPTIMIZATION: Explicitly select only needed fields
      const projects = await executeQuery(() =>
        prisma.rFQ.findMany({
          where: {
            status: { in: ['OPEN', 'ISSUED', 'AWARDED'] }
          },
          select: { // Use select on the main model
            projectName: true,
            title: true,
            status: true,
            estimatedUnitPrice: true,
            contracts: { // Use select on relations
              select: {
                contractValue: true,
                startDate: true,
                endDate: true
              }
            },
            submissions: {
              select: { // Use select on relations
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
      // OPTIMIZATION: Explicitly select only needed fields
      const teamMembers = await executeQuery(() =>
        prisma.user.findMany({
          where: { 
            roleId: ROLES.PROCUREMENT_OFFICER,
            isActive: true 
          },
          select: { // Use select on the main model
            name: true,
            tasksAssigned: { // Use select on relations
              select: {
                status: true,
                dueDate: true,
                updatedAt: true
              }
            },
            vendorsReviewed: {
              select: { // Use select on relations
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
      const avgCompletionRate = totalMembers > 0 ? teamStats.reduce((sum, stat) => sum + stat.completionRate, 0) / totalMembers : 0;
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
      // OPTIMIZATION: Explicitly select only needed fields
      return await executeQuery(() =>
        prisma.approval.findMany({
          where: { status: 'PENDING' },
          select: { // Use select on the main model
            id: true,
            type: true,
            itemId: true,
            createdAt: true,
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
          select: { // OPTIMIZATION: Use select for smaller payload
            id: true,
            title: true,
            dueDate: true,
            priority: true,
            status: true,
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
        dueIn: Math.ceil((new Date(task.dueDate).getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000)),
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
      // NOTE: Assuming taskService.getUserTasks fetches all task fields needed (dueDate, status, updatedAt)
      const userTasks = await executeQuery(() => taskService.getUserTasks(userId), []);
      const completedTasks = userTasks.filter(t => t.status === 'COMPLETED').length;
      const overdueTasks = userTasks.filter(t => 
        t.status !== 'COMPLETED' && new Date(t.dueDate) < new Date()
      ).length;

      const completedOnTime = userTasks.filter(t => {
        // Ensure t.updatedAt and t.dueDate are valid Date objects
        const completedDate = new Date(t.updatedAt);
        const dueDate = new Date(t.dueDate);
        return t.status === 'COMPLETED' && completedDate.getTime() <= dueDate.getTime();
      }).length;

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
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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
          select: { // OPTIMIZATION: Only select what's needed
            id: true,
            title: true,
            dueDate: true,
            status: true
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
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      return await executeQuery(() =>
        prisma.task.findMany({
          where: {
            assignedTo: userId,
            status: 'COMPLETED',
            updatedAt: { gte: oneWeekAgo }
          },
          select: { id: true, title: true, updatedAt: true }, // OPTIMIZATION: Only select what's needed
          orderBy: { updatedAt: 'desc' }
        }), []
      );
    } catch (error) {
      console.error('Error in getRealCompletedTasksThisWeek:', error.message);
      return [];
    }
  }
};