import jwt from "jsonwebtoken";
import prisma from "../config/prismaClient.js";
// backend/src/middleware/roleMiddleware.js
import { ROLES } from '../constants/roles.js';

// backend/src/middleware/roleMiddleware.js
export const authorizeRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roleId) {
      return res.status(401).json({ error: "User role not found" });
    }

    // Check if user's role is in allowed roles
    if (!allowedRoles.includes(req.user.roleId)) {
      return res.status(403).json({ 
        error: "Access denied. Insufficient permissions.",
        requiredRoles: allowedRoles.map(id => ROLES[id]),
        userRole: ROLES[req.user.roleId]
      });
    }

    next();
  };
};


// Convenience middleware for common role combinations
export const requireExecutive = authorizeRole([ROLES.EXECUTIVE]);
export const requireManagerOrExecutive = authorizeRole([ROLES.EXECUTIVE, ROLES.PROCUREMENT_MANAGER]);
export const requireProcurementStaff = authorizeRole([ROLES.EXECUTIVE, ROLES.PROCUREMENT_MANAGER, ROLES.PROCUREMENT_OFFICER]);

// Special middleware for IPC status updates based on workflow
export const authorizeIPCStatusUpdate = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { status } = req.body;
  const userRole = req.user.roleId;

  // Define which roles can perform which status transitions
  const statusPermissions = {
    // Procurement team can start review and send to technical
    PROCUREMENT_REVIEW: [1, 3, 4, 5, 6], // Admin, Procurement Managers, Engineers, etc.
    TECHNICAL_APPROVED: [1, 3, 4, 5, 6], // Same roles for technical approval
    FINANCE_REVIEW: [1, 3, 4, 5, 6], // Procurement can send to finance
    APPROVED: [1, 7], // Admin and Finance can approve
    PAID: [1, 7], // Admin and Finance can mark as paid
    REJECTED: [1, 3, 4, 5, 6, 7] // Multiple roles can reject
  };

  // If no specific status or status not in permissions, allow (for general updates)
  if (!status || !statusPermissions[status]) {
    return next();
  }

  // Check if user has permission for this specific status update
  if (!statusPermissions[status].includes(userRole)) {
    return res.status(403).json({
      error: `Access denied. You don't have permission to update status to ${status}`,
      requiredRoles: statusPermissions[status],
      userRole: userRole
    });
  }

  next();
};
