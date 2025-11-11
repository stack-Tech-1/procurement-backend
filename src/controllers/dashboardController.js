// backend/src/controllers/dashboardController.js
import { dashboardService } from '../services/dashboardService.js';
import { ROLES } from '../constants/roles.js';

export const getDashboardData = async (req, res) => {
  try {
    const { roleId } = req.user;
    let dashboardData;

    console.log(`📊 Loading dashboard for role: ${roleId}, user: ${req.user.id}`);

    switch (roleId) {
      case ROLES.EXECUTIVE:
        dashboardData = await dashboardService.getExecutiveDashboard();
        break;
      case ROLES.PROCUREMENT_MANAGER:
        dashboardData = await dashboardService.getManagerDashboard(req.user.id);
        break;
      case ROLES.PROCUREMENT_OFFICER:
        dashboardData = await dashboardService.getOfficerDashboard(req.user.id);
        break;
      case ROLES.VENDOR:
        dashboardData = { message: "Vendor dashboard data" };
        break;
      default:
        return res.status(400).json({ 
          success: false,
          error: "Unknown role" 
        });
    }

    res.json({
      success: true,
      data: dashboardData,
      userRole: roleId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard data',
      error: error.message
    });
  }
};