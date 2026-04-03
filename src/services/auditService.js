import prisma from '../config/prismaClient.js';

/**
 * Enhanced audit logger — writes to AuditLog with full context.
 * Never throws — audit logging must not break the main flow.
 */
export const logAction = async ({
  userId,
  action,
  module,
  entityId,
  entityType,
  oldValues,
  newValues,
  ipAddress,
  userAgent,
}) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        entity: entityType || null,
        entityId: entityId || null,
        data: null,
        module: module || null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        oldValues: oldValues || null,
        newValues: newValues || null,
      },
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
};

/**
 * Convenience wrapper that reads userId/ip/ua from an Express request object.
 */
export const logUserAction = async (
  req,
  action,
  module,
  entityId,
  entityType,
  oldValues,
  newValues
) => {
  await logAction({
    userId: req.user?.id,
    action,
    module,
    entityId,
    entityType,
    oldValues,
    newValues,
    ipAddress: req.ipAddress,
    userAgent: req.userAgent,
  });
};
