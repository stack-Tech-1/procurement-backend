// src/jobs/weeklyReportJob.js
// Runs every Monday at 8 AM.
// Sends weekly procurement summary emails to all active managers (roleId=2).

import prisma from '../config/prismaClient.js';
import { emailService } from '../services/emailService.js';
import { weeklyManagerSummaryTemplate } from '../services/emailTemplates.js';

export async function runWeeklyReportJob() {
  console.log('[WeeklyReportJob] Running at', new Date().toISOString());
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 86400000);
  const in30Days = new Date(now.getTime() + 30 * 86400000);

  try {
    const managers = await prisma.user.findMany({
      where: { roleId: 2, isActive: true },
      select: { id: true, name: true, email: true }
    });

    for (const manager of managers) {
      try {
        const [pendingApprovals, overdueTasks, expiringDocuments, newVendors, tasksCompleted, poIssued] = await Promise.all([
          prisma.approvalStep.count({ where: { approverId: manager.id, status: 'PENDING' } }),
          prisma.task.count({ where: { assignedById: manager.id, status: 'OVERDUE' } }),
          prisma.vendorDocument.count({
            where: {
              expiryDate: { gte: now, lte: in30Days },
              vendor: { status: { in: ['APPROVED', 'UNDER_REVIEW'] } }
            }
          }),
          prisma.vendor.count({ where: { createdAt: { gte: weekStart } } }),
          prisma.task.count({
            where: { assignedById: manager.id, status: 'COMPLETED', completedAt: { gte: weekStart } }
          }),
          prisma.purchaseOrder.count({ where: { status: 'ISSUED', createdAt: { gte: weekStart } } })
        ]);

        if (!manager.email) continue;

        await emailService.sendEmail({
          to: manager.email,
          subject: `Weekly Procurement Report — ${now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
          html: weeklyManagerSummaryTemplate({
            managerName: manager.name || 'Manager',
            pendingApprovals,
            overdueTasks,
            expiringDocuments,
            newVendors,
            weeklyStats: { tasksCompleted, poIssued }
          })
        });

        console.log(`[WeeklyReportJob] Sent to ${manager.email}`);
      } catch (managerErr) {
        console.error(`[WeeklyReportJob] Failed for manager ${manager.id}:`, managerErr.message);
      }
    }

    console.log('[WeeklyReportJob] Done');
  } catch (error) {
    console.error('[WeeklyReportJob] Error:', error.message);
  }
}
