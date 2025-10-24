import prisma from '../config/prismaClient.js';

/**
 * Logs an action to the AuditLog table.
 * @param {number | null} userId - ID of the user performing the action.
 * @param {string} action - Description of the action (e.g., 'VENDOR_APPROVED', 'LOGIN').
 * @param {string} entity - The model name (e.g., 'Vendor', 'User').
 * @param {number | null} entityId - The ID of the affected entity.
 * @param {object | null} data - JSON payload detailing the change (old/new values).
 */
export async function logAudit(userId, action, entity, entityId, data = null) {
    try {
        await prisma.auditLog.create({
            data: {
                userId: userId,
                action: action,
                entity: entity,
                entityId: entityId,
                data: data,
            },
        });
    } catch (error) {
        console.error('Failed to write to AuditLog:', error);
        // Log silently to avoid breaking main process
    }
}