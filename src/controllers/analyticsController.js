// backend/src/controllers/analyticsController.js
import analyticsService from '../services/analyticsService.js';

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