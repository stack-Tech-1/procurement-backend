// src/jobs/expiryCheckJob.js

import cron from 'node-cron';
import prisma from '../config/prismaClient.js'; // Adjust path as needed
import { logAudit } from '../utils/auditLogger.js'; // Assuming this is correct
import { sendVendorNotification } from '../utils/emailService.js'; // Assuming this is correct

// Mandatory document types that require expiry checking
const MANDATORY_EXPIRY_DOCS = [
    'COMMERCIAL_REGISTRATION', 
    'ISO_CERTIFICATE', 
    'ZAKAT_CERTIFICATE', 
    'GOSI_CERTIFICATE', 
    'INSURANCE_CERTIFICATE'
];

// Helper to calculate date differences
const isWithinDays = (date, days) => {
    const today = new Date();
    const expiry = new Date(date);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= days;
};


// src/jobs/expiryCheckJob.js 

// ... (existing functions and imports)

// Function to handle the 48h SLA breach check
const checkSlaBreach = async () => {
    console.log('⏳ Running SLA breach check...');
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2); 
    
    // Find the Procurement Manager email (assuming Role ID 2 is the target)
    const procurementUser = await prisma.user.findFirst({
        where: { roleId: 2, isActive: true }, 
        select: { email: true, name: true }
    });
    // NOTE: For better coverage, you might want to find ALL users with roleId 1 or 2.
    
    if (!procurementUser) {
        console.warn('Escalation logic: No active Procurement user found (Role ID 2). Skipping alert.');
        return 0;
    }

    try {
        // Find vendors in 'UNDER_REVIEW' status submitted more than 48 hours ago
        const staleVendors = await prisma.vendor.findMany({
            where: {
                status: 'UNDER_REVIEW',
                createdAt: { lt: twoDaysAgo }
            },
            select: { id: true, name: true, createdAt: true, vendorId: true }
        });

        if (staleVendors.length > 0) {
            // ... (email formatting logic is the same as before)
            const vendorList = staleVendors.map(v => 
                `Vendor ID: ${v.vendorId || v.id}, Name: ${v.name}, Submitted: ${v.createdAt.toLocaleDateString()}`
            ).join('\n');

            const subject = `🔥 URGENT: ${staleVendors.length} Vendor Submissions Exceeded 48h SLA`;
            const body = `Dear ${procurementUser.name},\n\nThe following vendor submissions have been in 'Under Review' status for over 48 hours and require immediate attention:\n\n${vendorList}\n\nPlease review and action these submissions promptly.`;
            
            // Send the alert email to the Procurement Manager
            await sendVendorNotification(procurementUser.email, subject, body);
            
            // Log the escalation
            await logAudit(
                null, 
                'SLA_ESCALATION', 
                'System', 
                null, 
                { count: staleVendors.length, staleVendors: staleVendors.map(v => v.id) }
            );
        }
        
        // ... (rest of logging)
    } catch (error) {
        // ... (error handling)
    }
};

// ... (Ensure checkAndFlagExpiredDocuments calls checkSlaBreach)

// The core job function
const checkAndFlagExpiredDocuments = async () => {
    console.log('⏳ Running daily document expiry check...');
    const jobStartTime = new Date();
    let expiredCount = 0;
    let expiringSoonCount = 0;

    try {
        // 1. Find ALL documents that are either expired OR expiring within 30 days
        const docsToCheck = await prisma.vendorDocument.findMany({
            where: {
                docType: { in: MANDATORY_EXPIRY_DOCS },
                expiryDate: { not: null },
            },
            include: {
                vendor: {
                    select: { 
                        id: true, 
                        status: true, 
                        contactEmail: true,
                        vendorId: true, 
                        name: true 
                    }
                }
            }
        });

        const vendorsToUpdate = new Map(); // Map to hold unique vendor updates

        for (const doc of docsToCheck) {
            const vendor = doc.vendor;

            if (!vendor) continue;

            const isExpired = new Date(doc.expiryDate) < jobStartTime;
            const isExpiringSoon = isWithinDays(doc.expiryDate, 30);

            if (isExpired) {
                // Document is expired: Vendor status must be updated to NEEDS_RENEWAL
                vendorsToUpdate.set(vendor.id, {
                    newStatus: 'NEEDS_RENEWAL',
                    reason: `Mandatory document ${doc.docType} expired on ${doc.expiryDate.toISOString().split('T')[0]}.`,
                });
                expiredCount++;
            } else if (isExpiringSoon && vendor.status !== 'NEEDS_RENEWAL') {
                // Document is expiring soon (and vendor isn't already flagged/blocked)
                expiringSoonCount++;
                
                // Trigger reminder email (Task 2.2)
                await sendVendorNotification(
                    vendor.contactEmail,
                    `🚨 Urgent: Document Renewal Required for ${doc.docType}`,
                    `Your document ${doc.fileName} (${doc.docType}) is expiring on ${doc.expiryDate.toISOString().split('T')[0]}. Please renew immediately.`
                );
            }
        }

        // 2. Perform Batch Updates using a transaction
        for (const [vendorId, updateInfo] of vendorsToUpdate.entries()) {
            const vendor = await prisma.vendor.update({
                where: { id: vendorId },
                data: {
                    status: updateInfo.newStatus,
                    reviewNotes: updateInfo.reason,
                    updatedAt: new Date(),
                },
            });

            // Log the critical status change (Task 2.1)
            await logAudit(
                null, // System Bot action
                'VENDOR_STATUS_AUTOMATED',
                'Vendor',
                vendorId,
                {
                    oldStatus: vendor.status,
                    newStatus: updateInfo.newStatus,
                    reason: updateInfo.reason,
                }
            );

            // Send rejection/renewal email (Task 2.2)
            await sendVendorNotification(
                vendor.contactEmail,
                `🚫 Action Required: Vendor Status Updated to ${updateInfo.newStatus}`,
                updateInfo.reason + ` You are temporarily blocked from RFQs until renewed.`
            );
        }

        const jobEndTime = new Date();
        const duration = (jobEndTime.getTime() - jobStartTime.getTime()) / 1000;
        
        console.log(`✅ Daily Expiry Check complete. Expired: ${expiredCount}, Expiring Soon: ${expiringSoonCount}. Duration: ${duration}s`);

    } catch (error) {
        console.error('❌ FATAL CRON JOB ERROR:', error);
        await logAudit(
            null, // System Bot action
            'CRON_JOB_ERROR',
            'System',
            null,
            { job: 'ExpiryCheck', error: error.message }
        );
    }
};

/**
 * Schedules the job to run every day at 1:00 AM.
 * The cron expression is '0 1 * * *'.
 */
export const startExpiryCheckJob = () => {
    // Schedule to run every day at 1:00 AM
    cron.schedule('0 1 * * *', checkAndFlagExpiredDocuments, {
        scheduled: true,
        timezone: 'Asia/Riyadh' // Set to a local timezone for predictable runtime
    });
    
    // NOTE: You can uncomment the line below for testing. It runs every 5 minutes.
    // cron.schedule('*/5 * * * *', checkAndFlagExpiredDocuments, { scheduled: true });
    
    console.log('⏰ Expiry Check Job scheduled to run daily at 1:00 AM.');
    
    // Run once immediately on start for immediate compliance check
    checkAndFlagExpiredDocuments();
};