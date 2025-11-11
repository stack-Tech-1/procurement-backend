// backend/src/controllers/healthController.js
import prisma from '../config/prismaClient.js';

export const healthController = {
  
  async healthCheck(req, res) {
    try {
      // Test database connection
      await prisma.$queryRaw`SELECT 1`;
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
        uptime: process.uptime()
      });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error.message
      });
    }
  },

  async deepHealthCheck(req, res) {
    try {
      const [dbCheck, stats] = await Promise.all([
        prisma.$queryRaw`SELECT 1`,
        prisma.$queryRaw`
          SELECT 
            COUNT(*) as total_users,
            (SELECT COUNT(*) FROM vendors) as total_vendors,
            (SELECT COUNT(*) FROM tasks) as total_tasks
        `
      ]);

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
        stats: stats[0],
        uptime: process.uptime()
      });
    } catch (error) {
      console.error('Deep health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error.message
      });
    }
  }
};