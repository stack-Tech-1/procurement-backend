// backend/src/controllers/analyticsController.js
import analyticsService from '../services/analyticsService.js';
import prisma from '../config/prismaClient.js';

class AnalyticsController {
  
  // Get predictive spend forecast
  async getSpendForecast(req, res) {
    try {
      const { range = 'quarter' } = req.query;
      
      console.log('📊 API: Getting spend forecast for range:', range);
      const forecast = await analyticsService.forecastSpend(range);
      
      res.json({
        success: true,
        data: forecast,
        message: 'Spend forecast generated successfully'
      });
    } catch (error) {
      console.error('❌ API Error - Spend forecast:', error);
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // Get comprehensive spend analysis
  async getSpendAnalysis(req, res) {
    try {
      const { category = 'all', vendorId, projectId } = req.query;
      
      console.log('📊 API: Getting spend analysis:', { category, vendorId, projectId });
      const analysis = await analyticsService.analyzeSpend(category, vendorId, projectId);
      
      res.json({
        success: true,
        data: analysis,
        message: 'Spend analysis completed successfully'
      });
    } catch (error) {
      console.error('❌ API Error - Spend analysis:', error);
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // Get vendor performance benchmarks
  async getVendorBenchmarks(req, res) {
    try {
      const { category } = req.query;
      
      console.log('📊 API: Getting vendor benchmarks for category:', category || 'all');
      const benchmarks = await analyticsService.benchmarkVendors(category);
      
      res.json({
        success: true,
        data: benchmarks,
        message: 'Vendor benchmarks generated successfully'
      });
    } catch (error) {
      console.error('❌ API Error - Vendor benchmarks:', error);
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  /**
 * GET /api/analytics/vendor-performance
 * Get performance analytics for the authenticated vendor
 */
async getVendorPerformance(req, res) {
  try {
    // Only vendors can access their own performance
    if (req.user?.roleId !== 4) {
      return res.status(403).json({ 
        error: "Access denied. Only vendor users can access performance data." 
      });
    }

    // Get vendor by user ID
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user.id },
      select: {
        id: true,
        companyLegalName: true,
        vendorClass: true,
        qualificationScore: true,
        status: true,
      }
    });

    if (!vendor) {
      return res.status(404).json({ error: "Vendor profile not found." });
    }

    // Get total number of vendors for ranking
    const totalVendors = await prisma.vendor.count();
    
    // Get vendor rank by qualification score
    const vendorsWithHigherScore = await prisma.vendor.count({
      where: {
        qualificationScore: {
          gt: vendor.qualificationScore || 0
        }
      }
    });
    const rank = vendorsWithHigherScore + 1;

    // Get RFQ submissions data (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const submissions = await prisma.rFQSubmission.findMany({
      where: {
        vendorId: vendor.id,
        submittedAt: {
          gte: twelveMonthsAgo
        }
      },
      include: {
        rfq: true,
        evaluations: true
      },
      orderBy: {
        submittedAt: 'asc'
      }
    });

    // Calculate monthly data
    const monthlyData = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    for (let i = 0; i < 12; i++) {
      const monthDate = new Date();
      monthDate.setMonth(monthDate.getMonth() - (11 - i));
      
      const monthSubmissions = submissions.filter(sub => {
        const subDate = new Date(sub.submittedAt);
        return subDate.getMonth() === monthDate.getMonth() && 
               subDate.getFullYear() === monthDate.getFullYear();
      });

      // Calculate wins (evaluations with score > 0 or contracts awarded)
      const wins = monthSubmissions.filter(sub => {
        return sub.evaluations && sub.evaluations.length > 0 && 
               sub.evaluations.some(evaluation => eval.totalScore && eval.totalScore > 70);
      }).length;

      // Calculate rating (average of evaluation scores or use qualification score)
      const ratings = monthSubmissions.flatMap(sub => 
        sub.evaluations.map(evalualion => eval.totalScore).filter(score => score)
      );
      const avgRating = ratings.length > 0 
        ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) / 10 // Convert to 0-10 scale
        : (vendor.qualificationScore || 8.0);

      monthlyData.push({
        month: monthNames[monthDate.getMonth()],
        rating: parseFloat(avgRating.toFixed(1)),
        proposals: monthSubmissions.length,
        wins: wins
      });
    }

    // Get contracts for delivery metrics
    const contracts = await prisma.contract.findMany({
      where: {
        vendorId: vendor.id
      },
      include: {
        ipcs: true
      }
    });

    // Calculate KPI metrics
    const totalProposals = submissions.length;
    const successfulDeliveries = contracts.filter(c => c.status === 'COMPLETED').length;
    
    // Get all IPCs (Interim Payment Certificates) as proxy for deliveries
    const allIPCs = contracts.flatMap(c => c.ipcs);
    const onTimeDelivery = allIPCs.filter(ipc => ipc.status === 'APPROVED').length;
    const delayedDeliveries = allIPCs.filter(ipc => ipc.status === 'REJECTED').length;

    // Calculate win rate
    const totalEvaluated = submissions.filter(s => s.evaluations.length > 0).length;
    const successfulWins = submissions.filter(s => 
      s.evaluations.some(e => e.totalScore && e.totalScore > 70)
    ).length;
    const winRate = totalEvaluated > 0 ? (successfulWins / totalEvaluated) * 100 : 0;

    // Calculate trends (simplified - comparing last 3 months vs previous 3 months)
    const last3Months = monthlyData.slice(-3);
    const prev3Months = monthlyData.slice(-6, -3);
    
    const avgDeliveryCompliance = last3Months.reduce((sum, month) => sum + (month.wins / Math.max(month.proposals, 1)), 0) / 3;
    const prevAvgDeliveryCompliance = prev3Months.reduce((sum, month) => sum + (month.wins / Math.max(month.proposals, 1)), 0) / 3;

    // Mock response time (this would need actual response time data from your system)
    const responseTime = 2.3; // Average in days
    const prevResponseTime = 2.8;

    // Mock satisfaction score (this would need feedback data)
    const satisfactionScore = 4.2;
    const prevSatisfactionScore = 4.0;

    // Calculate average contract value
    const totalContractValue = contracts.reduce((sum, contract) => sum + (contract.contractValue || 0), 0);
    const averageContractValue = contracts.length > 0 ? totalContractValue / contracts.length : 0;

    // Prepare response data
    const performanceData = {
      vendorRating: vendor.qualificationScore ? parseFloat((vendor.qualificationScore / 10).toFixed(1)) : 8.7,
      vendorClass: vendor.vendorClass || 'B',
      rank: rank,
      totalVendors: totalVendors,
      trends: {
        deliveryCompliance: { 
          current: parseFloat((avgDeliveryCompliance * 100).toFixed(1)), 
          previous: parseFloat((prevAvgDeliveryCompliance * 100).toFixed(1)), 
          trend: avgDeliveryCompliance > prevAvgDeliveryCompliance ? 'up' : 'down' 
        },
        responseTime: { 
          current: responseTime, 
          previous: prevResponseTime, 
          trend: responseTime < prevResponseTime ? 'down' : 'up' 
        },
        winRate: { 
          current: parseFloat(winRate.toFixed(1)), 
          previous: parseFloat(Math.max(0, winRate - 3).toFixed(1)), 
          trend: 'up' 
        },
        satisfactionScore: { 
          current: satisfactionScore, 
          previous: prevSatisfactionScore, 
          trend: satisfactionScore > prevSatisfactionScore ? 'up' : 'down' 
        }
      },
      monthlyData: monthlyData,
      kpis: {
        totalProposals: totalProposals,
        successfulDeliveries: successfulDeliveries,
        onTimeDelivery: onTimeDelivery,
        delayedDeliveries: delayedDeliveries,
        rejectedProposals: submissions.filter(s => s.status === 'REJECTED').length,
        averageContractValue: parseFloat(averageContractValue.toFixed(0)),
        totalRevenue: parseFloat(totalContractValue.toFixed(0))
      }
    };

    res.json({
      success: true,
      data: performanceData,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching vendor performance:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch performance data',
      details: error.message 
    });
  }
}

  // Get comprehensive KPIs
  async getKPIs(req, res) {
    try {
      const { range = 'month' } = req.query;
      
      console.log('📊 API: Calculating KPIs for range:', range);
      const kpis = await analyticsService.calculateKPIs(range);
      
      res.json({
        success: true,
        data: kpis,
        message: 'KPIs calculated successfully'
      });
    } catch (error) {
      console.error('❌ API Error - KPI calculation:', error);
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // Get real-time dashboard metrics
  async getDashboardMetrics(req, res) {
    try {
      const { range = 'month' } = req.query;
      
      console.log('📊 API: Getting comprehensive dashboard metrics');
      
      const [kpis, forecast, spendAnalysis, vendorBenchmarks] = await Promise.all([
        analyticsService.calculateKPIs(range),
        analyticsService.forecastSpend(range),
        analyticsService.analyzeSpend('all'),
        analyticsService.benchmarkVendors()
      ]);
      
      const metrics = {
        kpis,
        forecast,
        spendAnalysis,
        vendorBenchmarks,
        lastUpdated: new Date().toISOString(),
        dataSources: ['contracts', 'vendors', 'approvals', 'evaluations']
      };

      res.json({
        success: true,
        data: metrics,
        message: 'Dashboard metrics retrieved successfully'
      });
    } catch (error) {
      console.error('❌ API Error - Dashboard metrics:', error);
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // Health check for analytics service
  async getAnalyticsHealth(req, res) {
    try {
      // Test basic functionality
      const testKpis = await analyticsService.calculateKPIs('month');
      const testForecast = await analyticsService.forecastSpend('quarter');
      
      res.json({
        success: true,
        data: {
          status: 'healthy',
          kpisAvailable: !!testKpis,
          forecastingAvailable: !!testForecast,
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        },
        message: 'Analytics service is running correctly'
      });
    } catch (error) {
      console.error('❌ Analytics health check failed:', error);
      res.status(500).json({
        success: false,
        message: 'Analytics service health check failed: ' + error.message,
        data: {
          status: 'unhealthy',
          error: error.message
        }
      });
    }
  }
}

export default new AnalyticsController();