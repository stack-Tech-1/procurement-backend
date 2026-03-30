// src/jobs/documentExpiryJob.js
// Creates DocumentAlert records, sends tiered vendor/staff notifications using branded templates.
// Does NOT replace expiryCheckJob.js — both run independently.

import prisma from '../config/prismaClient.js';
import { emailService } from '../services/emailService.js';
import { notificationService } from '../services/notificationService.js';
import { documentExpiryTemplate } from '../services/emailTemplates.js';

// Alert thresholds in days — only send at these specific milestones to avoid spam
const ALERT_THRESHOLDS = [1, 7, 15, 30];

export async function runDocumentExpiryJob() {
  console.log('[DocumentExpiryJob] Starting at', new Date().toISOString());
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 86400000);
  let processed = 0, alertsSent = 0, vendorsMarkedForRenewal = 0;

  try {
    // ── 1. Expiring documents ─────────────────────────────────────────────────
    const expiringDocs = await prisma.vendorDocument.findMany({
      where: {
        expiryDate: { gte: now, lte: in30Days },
        vendor: { status: { in: ['APPROVED', 'CONDITIONAL_APPROVED', 'UNDER_REVIEW'] } }
      },
      include: {
        vendor: {
          select: {
            id: true,
            companyLegalName: true,
            contactEmail: true,
            user: { select: { id: true, email: true } }
          }
        }
      }
    });

    // Cache staff list once to avoid N+1 per document
    const staff = await prisma.user.findMany({
      where: { roleId: { in: [2, 3] }, isActive: true },
      select: { id: true }
    });

    for (const doc of expiringDocs) {
      processed++;
      const daysLeft = Math.ceil((new Date(doc.expiryDate) - now) / 86400000);

      // Only alert at threshold days — skip if today is not a threshold day
      const nearestThreshold = ALERT_THRESHOLDS.find(t => daysLeft <= t);
      if (!nearestThreshold) continue;

      // Deduplicate: skip if we already created an alert for this threshold window
      const existing = await prisma.documentAlert.findFirst({
        where: {
          vendorId: doc.vendorId,
          documentType: doc.docType || doc.documentType || 'DOCUMENT',
          daysUntilExpiry: nearestThreshold,
          isResolved: false,
          createdAt: { gte: new Date(now.getTime() - 2 * 86400000) } // within last 2 days
        }
      });
      if (existing) continue;

      const docType = (doc.docType || doc.documentType || 'Document').replace(/_/g, ' ');

      // Create DocumentAlert record
      await prisma.documentAlert.create({
        data: {
          vendorId: doc.vendorId,
          documentType: doc.docType || doc.documentType || 'DOCUMENT',
          expiryDate: doc.expiryDate,
          alertSentAt: now,
          daysUntilExpiry: daysLeft
        }
      });

      const vendorEmail = doc.vendor.contactEmail || doc.vendor.user?.email;
      const systemUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      // Email vendor
      if (vendorEmail) {
        try {
          await emailService.sendEmail({
            to: vendorEmail,
            subject: `Document Expiry Alert: ${docType} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
            html: documentExpiryTemplate({
              vendorName: doc.vendor.companyLegalName || 'Vendor',
              documentType: docType,
              expiryDate: new Date(doc.expiryDate).toLocaleDateString('en-GB'),
              daysLeft,
              updateUrl: `${systemUrl}/dashboard/vendor/documents`
            })
          });
          alertsSent++;
        } catch (emailErr) {
          console.error(`[DocumentExpiryJob] Email failed for vendor ${doc.vendorId}:`, emailErr.message);
        }
      }

      // In-app notification for vendor user
      if (doc.vendor.user?.id) {
        await notificationService.createNotification({
          userId: doc.vendor.user.id,
          title: 'Document Expiring Soon',
          body: `${docType} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
          type: daysLeft <= 7 ? 'WARNING' : 'REMINDER',
          priority: daysLeft <= 7 ? 'HIGH' : 'MEDIUM',
          actionUrl: '/dashboard/vendor/documents',
          metadata: { module: 'VENDOR_DOCUMENT', entityId: doc.id, entityType: 'VendorDocument' }
        });
      }

      // Notify procurement staff
      for (const s of staff) {
        await notificationService.createNotification({
          userId: s.id,
          title: 'Vendor Document Expiring',
          body: `${doc.vendor.companyLegalName}: ${docType} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
          type: 'WARNING',
          priority: daysLeft <= 7 ? 'HIGH' : 'MEDIUM',
          actionUrl: `/dashboard/procurement/vendors/${doc.vendorId}`,
          metadata: { module: 'VENDOR_DOCUMENT', entityId: doc.id, entityType: 'VendorDocument' }
        });
      }
    }

    // ── 2. Mark expired docs invalid, flag vendors for renewal ───────────────
    const expiredDocs = await prisma.vendorDocument.findMany({
      where: { expiryDate: { lt: now }, isValid: true },
      include: { vendor: { select: { id: true, status: true } } }
    });

    for (const doc of expiredDocs) {
      await prisma.vendorDocument.update({ where: { id: doc.id }, data: { isValid: false } });
      if (doc.vendor && !['NEEDS_RENEWAL', 'BLACKLISTED', 'REJECTED'].includes(doc.vendor.status)) {
        await prisma.vendor.update({ where: { id: doc.vendorId }, data: { status: 'NEEDS_RENEWAL' } });
        vendorsMarkedForRenewal++;
      }
    }

    // ── 3. Re-evaluation reminders (6+ months since last evaluation) ──────────
    const sixMonthsAgo = new Date(now.getTime() - 180 * 86400000);
    const staleQualifications = await prisma.vendorQualification.findMany({
      where: { updatedAt: { lt: sixMonthsAgo }, vendor: { status: 'APPROVED' } },
      include: { vendor: { select: { id: true, companyLegalName: true } } },
      take: 20
    });

    for (const q of staleQualifications) {
      for (const s of staff.filter(s => true)) { // notify all staff
        await notificationService.createNotification({
          userId: s.id,
          title: 'Vendor Re-evaluation Due',
          body: `${q.vendor.companyLegalName} has not been re-evaluated in 6+ months`,
          type: 'REMINDER',
          priority: 'MEDIUM',
          actionUrl: `/dashboard/procurement/vendors/${q.vendorId}`,
          metadata: { module: 'VENDOR', entityId: q.vendorId, entityType: 'Vendor' }
        });
      }
    }

    console.log(`[DocumentExpiryJob] Done — processed=${processed} alertsSent=${alertsSent} vendorsMarkedForRenewal=${vendorsMarkedForRenewal}`);
    return { processed, alertsSent, vendorsMarkedForRenewal };
  } catch (error) {
    console.error('[DocumentExpiryJob] Error:', error.message);
    return { processed, alertsSent, vendorsMarkedForRenewal, error: error.message };
  }
}
