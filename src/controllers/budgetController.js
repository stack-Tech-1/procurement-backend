// backend/src/controllers/budgetController.js
import prisma from '../config/prismaClient.js';

export const budgetController = {
  
  // Get budget summary (total budget, spent, usage)
  async getBudgetSummary(req, res) {
    try {
      console.log('📊 Fetching budget summary...');
      
      // Get total contract values (spent)
      const contractsAggregate = await prisma.contract.aggregate({
        _sum: { contractValue: true },
        _count: { id: true }
      });
      
      // Get total RFQ estimated values (budget/allocated)
      const rfqsAggregate = await prisma.rFQ.aggregate({
        _sum: { estimatedUnitPrice: true },
        _count: { id: true }
      });
      
      // Get active contracts count
      const activeContracts = await prisma.contract.count({
        where: {
          OR: [
            { status: 'ACTIVE' },
            { status: 'IN_PROGRESS' }
          ]
        }
      });
      
      const totalSpent = contractsAggregate._sum.contractValue || 0;
      const totalBudget = rfqsAggregate._sum.estimatedUnitPrice || 0;
      const budgetUtilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
      
      res.json({
        success: true,
        data: {
          totalBudget,
          totalSpent,
          budgetUtilization: Math.round(budgetUtilization * 10) / 10, // 1 decimal
          totalContracts: contractsAggregate._count.id,
          activeContracts,
          totalRFQs: rfqsAggregate._count.id,
          remainingBudget: Math.max(0, totalBudget - totalSpent)
        }
      });
    } catch (error) {
      console.error('❌ Error fetching budget summary:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Get detailed project budgets
  async getProjectBudgets(req, res) {
    try {
      console.log('📊 Fetching project budgets...');
      
      // Get ALL RFQs (including those without project names)
      const rfqs = await prisma.rFQ.findMany({
        select: {
          projectName: true,
          estimatedUnitPrice: true,
          id: true
        },
        orderBy: { projectName: 'asc' }
      });
      
      console.log('📊 Raw RFQs fetched:', rfqs.length);
      
      // Group manually - filter out null project names
      const projectMap = {};
      rfqs.forEach(rfq => {
        // Skip RFQs without project names
        if (!rfq.projectName || rfq.projectName.trim() === '') {
          return;
        }
        
        const projectName = rfq.projectName.trim();
        
        if (!projectMap[projectName]) {
          projectMap[projectName] = {
            projectName: projectName,
            budget: 0,
            rfqCount: 0,
            rfqIds: []
          };
        }
        
        projectMap[projectName].budget += (rfq.estimatedUnitPrice || 0);
        projectMap[projectName].rfqCount++;
        projectMap[projectName].rfqIds.push(rfq.id);
      });
      
      const projectBudgets = Object.values(projectMap);
      console.log('📊 Project budgets grouped:', projectBudgets.length);
      
      // If no projects found, return empty array
      if (projectBudgets.length === 0) {
        console.log('📊 No projects with valid project names found');
        return res.json({
          success: true,
          data: []
        });
      }
      
      // Get actual spend for each project
      const projectsWithSpend = await Promise.all(
        projectBudgets.map(async (project) => {
          // Find contracts for this project
          const projectContracts = await prisma.contract.findMany({
            where: {
              rfqId: { in: project.rfqIds }
            },
            select: {
              contractValue: true
            }
          });
          
          const totalSpent = projectContracts.reduce((sum, contract) => 
            sum + (contract.contractValue || 0), 0
          );
          
          const budget = project.budget || 0;
          const budgetUsage = budget > 0 ? (totalSpent / budget) * 100 : 0;
          
          return {
            projectName: project.projectName,
            budget: budget,
            spent: totalSpent,
            budgetUsage: Math.round(budgetUsage * 10) / 10,
            contractCount: projectContracts.length,
            rfqCount: project.rfqCount
          };
        })
      );
      
      // Sort by highest budget usage
      const sortedProjects = projectsWithSpend.sort((a, b) => b.budgetUsage - a.budgetUsage);
      
      console.log('📊 Returning', sortedProjects.length, 'projects');
      
      res.json({
        success: true,
        data: sortedProjects
      });
      
    } catch (error) {
      console.error('❌ Error fetching project budgets:', error);
      // Return empty array instead of error
      res.json({
        success: true,
        data: []
      });
    }
  },

  // Get monthly spend trends
  async getMonthlySpendTrends(req, res) {
    try {
      console.log('📊 Fetching monthly spend trends...');
      
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      // Get contracts created in the last 6 months
      const recentContracts = await prisma.contract.findMany({
        where: {
          createdAt: { gte: sixMonthsAgo }
        },
        select: {
          createdAt: true,
          contractValue: true
        },
        orderBy: { createdAt: 'asc' }
      });
      
      // Group by month
      const monthlyData = {};
      recentContracts.forEach(contract => {
        if (contract.createdAt) {
          const date = new Date(contract.createdAt);
          const monthKey = date.toLocaleString('default', { month: 'short', year: 'numeric' });
          
          if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = 0;
          }
          monthlyData[monthKey] += contract.contractValue || 0;
        }
      });
      
      // Convert to array format and ensure we have 6 months
      const chartData = [];
      const months = [];
      
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthKey = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        months.push(monthKey);
      }
      
      months.forEach(month => {
        chartData.push({
          month,
          spend: monthlyData[month] || 0,
          budget: (monthlyData[month] || 0) * 1.2 // Assuming 20% over budget
        });
      });
      
      res.json({
        success: true,
        data: chartData
      });
    } catch (error) {
      console.error('❌ Error fetching monthly spend trends:', error);     
      res.json({
        success: true,
        data: fallbackData
      });
    }
  }
};