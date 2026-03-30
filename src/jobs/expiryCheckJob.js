// src/jobs/expiryCheckJob.js

import cron from 'node-cron';
import prisma from '../config/prismaClient.js'; // Adjust path as needed
import { logAudit } from '../utils/auditLogger.js'; // Assuming this is correct
import { sendVendorNotification } from '../utils/emailService.js'; // Assuming this is correct
import { emailService } from '../services/emailService.js';

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
                        // 🔑 Update: Change 'name' to 'companyLegalName'
                        select: { id: true, companyLegalName: true, createdAt: true, vendorId: true } 
                    });
            
                    if (staleVendors.length > 0) {
                        
                        // 🔑 Update: Use v.companyLegalName in the list formatting
                        const vendorList = staleVendors.map(v => 
                            `Vendor ID: ${v.vendorId || v.id}, Name: ${v.companyLegalName}, Submitted: ${v.createdAt.toLocaleDateString()}`
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
                                            // 🔑 Fix the invalid field here:
                                            companyLegalName: true // Changed from 'name'
                                        }
                                    }
                                }
                            });
                    
                            const vendorsToUpdate = new Map(); // Map to hold unique vendor updates
                    
                            for (const doc of docsToCheck) {
                                const vendor = doc.vendor;
                                
                                // 🔑 Update: When accessing the name of the vendor later in the loop:
                                const vendorName = vendor.companyLegalName; 
                    // ...

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

// ─── Tiered expiry check with vendor emails + manager consolidation ───────────

/**
 * Checks vendor documents by urgency tier and sends targeted emails.
 * Tier 1: ≤1 day  → CRITICAL alert to vendor
 * Tier 2: ≤7 days → HIGH alert to vendor
 * Tier 3: ≤30 days → MEDIUM reminder to vendor
 * After all: consolidated manager email listing all expiring vendors.
 */
export const checkDocumentExpiryTiered = async () => {
    console.log('⏳ Running tiered document expiry check...');
    const now = new Date();
    const in1Day  = new Date(now.getTime() + 1  * 86400000);
    const in7Days  = new Date(now.getTime() + 7  * 86400000);
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    try {
        const expiringDocs = await prisma.vendorDocument.findMany({
            where: {
                expiryDate: { gte: now, lte: in30Days },
                vendor: { status: { in: ['APPROVED', 'UNDER_REVIEW'] } },
            },
            include: {
                vendor: {
                    select: {
                        id: true,
                        companyLegalName: true,
                        contactEmail: true,
                        status: true,
                        user: { select: { email: true } },
                    },
                },
            },
            orderBy: { expiryDate: 'asc' },
        });

        // Mark expired docs isValid=false
        await prisma.vendorDocument.updateMany({
            where: { expiryDate: { lt: now }, isValid: true },
            data: { isValid: false },
        });

        const managerAlerts = []; // collect for consolidated email

        for (const doc of expiringDocs) {
            const daysLeft = Math.ceil((new Date(doc.expiryDate) - now) / 86400000);
            const vendorEmail = doc.vendor.contactEmail || doc.vendor.user?.email;
            const vendorName = doc.vendor.companyLegalName || 'Your company';

            let tier, alertLabel;
            if (daysLeft <= 1)       { tier = 'CRITICAL'; alertLabel = '🔴 CRITICAL — Expires Tomorrow'; }
            else if (daysLeft <= 7)  { tier = 'HIGH';     alertLabel = '🟠 HIGH — Expires in 7 Days'; }
            else                     { tier = 'MEDIUM';   alertLabel = '🟡 Reminder — Expiring Soon'; }

            if (vendorEmail) {
                const subject = `${alertLabel}: ${doc.docType.replace(/_/g, ' ')} — ${vendorName}`;
                const body = `Dear ${vendorName},\n\nYour document "${doc.docType.replace(/_/g, ' ')}" (File: ${doc.fileName || 'N/A'}) expires on ${new Date(doc.expiryDate).toLocaleDateString('en-SA')} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining).\n\nPriority: ${tier}\n\nPlease upload the renewed document through the procurement portal immediately to avoid disruption.\n\nProcurement ERP System`;
                await sendVendorNotification(vendorEmail, subject, body);
            }

            managerAlerts.push({
                vendorName,
                docType: doc.docType.replace(/_/g, ' '),
                expiryDate: new Date(doc.expiryDate).toLocaleDateString('en-SA'),
                daysLeft,
                tier,
            });
        }

        // Send consolidated email to all active managers
        if (managerAlerts.length > 0) {
            const managers = await prisma.user.findMany({
                where: { roleId: 2, isActive: true },
                select: { email: true, name: true },
            });

            const tableRows = managerAlerts.map(a => `
                <tr>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${a.vendorName}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${a.docType}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${a.expiryDate}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">${a.daysLeft}d</td>
                  <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-weight:bold;color:${a.tier === 'CRITICAL' ? '#dc2626' : a.tier === 'HIGH' ? '#ea580c' : '#b45309'}">${a.tier}</td>
                </tr>`).join('');

            const html = `
                <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto">
                  <div style="background:#0A1628;padding:20px 28px">
                    <h2 style="color:#B8960A;margin:0">Document Expiry Report — ${new Date().toLocaleDateString('en-SA')}</h2>
                  </div>
                  <div style="padding:24px">
                    <p style="color:#374151">${managerAlerts.length} vendor document${managerAlerts.length !== 1 ? 's' : ''} require attention:</p>
                    <table style="width:100%;border-collapse:collapse">
                      <thead>
                        <tr style="background:#f9fafb">
                          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">VENDOR</th>
                          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">DOCUMENT</th>
                          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">EXPIRY DATE</th>
                          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">DAYS LEFT</th>
                          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280">PRIORITY</th>
                        </tr>
                      </thead>
                      <tbody>${tableRows}</tbody>
                    </table>
                    <div style="margin-top:20px;text-align:center">
                      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/procurement/vendors" style="background:#0A1628;color:#B8960A;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:bold">View Vendors</a>
                    </div>
                  </div>
                </div>`;

            for (const manager of managers) {
                if (manager.email) {
                    await emailService.sendEmail({
                        to: manager.email,
                        subject: `Document Expiry Report — ${managerAlerts.length} vendor doc${managerAlerts.length !== 1 ? 's' : ''} need attention`,
                        html,
                    });
                }
            }
        }

        console.log(`✅ Tiered expiry check complete. ${managerAlerts.length} docs flagged.`);
    } catch (error) {
        console.error('❌ Tiered expiry check error:', error);
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
    
    // Tiered expiry check runs daily at 8:30 AM (after the base check)
    cron.schedule('30 8 * * *', checkDocumentExpiryTiered, {
        scheduled: true,
        timezone: 'Asia/Riyadh'
    });

    // NOTE: You can uncomment the line below for testing. It runs every 5 minutes.
    // cron.schedule('*/5 * * * *', checkAndFlagExpiredDocuments, { scheduled: true });

    console.log('⏰ Expiry Check Job scheduled to run daily at 1:00 AM (base) + 8:30 AM (tiered alerts).');

    // Run once immediately on start for immediate compliance check
    checkAndFlagExpiredDocuments();
};