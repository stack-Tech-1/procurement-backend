import prisma from "../config/prismaClient.js";

// --- 1. AUDIT LOGGING HELPER ---
/**
 * Logs an action to the AuditLog table.
 * @param {number} userId - The ID of the user performing the action.
 * @param {string} actionType - The type of action (e.g., 'VENDOR_STATUS_UPDATE').
 * @param {string} entityType - The model entity affected (e.g., 'Vendor', 'User', 'Contract').
 * @param {number} entityId - The ID of the affected entity.
 * @param {object} details - JSON object containing before/after state or additional context.
 */
export const logAudit = async (userId, actionType, entityType, entityId, details = {}) => {
    // If userId is null (e.g., System Action), we can hardcode an Admin ID or use null
    const finalUserId = userId || 1; // Assuming Admin has ID 1, or implement better system user

    try {
        await prisma.auditLog.create({
            data: {
                userId: finalUserId,
                actionType,
                entityType,
                entityId,
                details, // Prisma handles JSON object for 'Json' type field
            },
        });
        // console.log(`[AUDIT] Logged action: ${actionType} on ${entityType}:${entityId}`);
    } catch (error) {
        // IMPORTANT: Log audit failures but do not block the main transaction/response
        console.error(`🚨 Failed to write Audit Log for ${actionType}:`, error);
    }
};

// --- 2. VENDOR ID GENERATION HELPER ---
/**
 * Generates a new, unique, sequential vendor ID (e.g., V-000001).
 * NOTE: This is simplistic. In a real system, you might use database sequences 
 * or a dedicated ID service for high concurrency/transaction integrity.
 * This implementation relies on finding the latest ID and incrementing it.
 */
export const generateNewVendorId = async () => {
    try {
        // Find the last vendor created that has a vendorId assigned
        const lastVendor = await prisma.vendor.findFirst({
            where: {
                vendorId: {
                    not: null,
                    startsWith: 'V-',
                }
            },
            orderBy: {
                // Order by primary key to ensure we get the physically last inserted record
                id: 'desc', 
            },
            select: {
                vendorId: true,
            },
        });

        let nextNumber = 1;

        if (lastVendor?.vendorId) {
            // Extract the number part (e.g., 'V-000123' -> 123)
            const parts = lastVendor.vendorId.split('-');
            if (parts.length === 2) {
                const lastNumber = parseInt(parts[1], 10);
                if (!isNaN(lastNumber)) {
                    nextNumber = lastNumber + 1;
                }
            }
        }

        // Format the new ID (e.g., V-000001)
        return `V-${nextNumber.toString().padStart(6, '0')}`;
    } catch (error) {
        console.error('🚨 Error generating new Vendor ID:', error);
        // Fallback to a timestamp-based unique ID if database fails
        return `V-ERR-${Date.now()}`;
    }
};

// --- 3. VENDOR NOTIFICATION HELPER ---
/**
 * Placeholder function for sending email notifications to vendors.
 * In a production environment, this would integrate with an email service (e.g., SendGrid, AWS SES).
 * @param {string} email - The vendor's email address.
 * @param {string} subject - The email subject.
 * @param {string} body - The email body content.
 */
export const sendVendorNotification = async (email, subject, body) => {
    // ⚠️ TODO: Integrate with actual email service (e.g., Nodemailer, SendGrid, etc.)
    console.log("--- EMAIL MOCK SERVICE ---");
    console.log(`TO: ${email}`);
    console.log(`SUBJECT: ${subject}`);
    console.log(`BODY: ${body.substring(0, 100)}...`);
    console.log("---------------------------");

    // Mock success response
    return { success: true, message: `Notification sent to ${email}` };
};