import prisma from '../config/prismaClient.js';
import { emailService } from '../services/emailService.js';

let lastDailyRun = null;
let lastWeeklyRun = null;

// ─── Email templates ──────────────────────────────────────────────────────────

function buildDailySummaryEmail(name, { pendingApprovals, overdueTasks, dueTodayTasks, expiringVendorDocs, date }) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const dateStr = date.toLocaleDateString('en-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const dueTodayRows = dueTodayTasks.map(t => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#111827">${t.title}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280">${t.assignedUser?.name || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280">${new Date(t.dueDate).toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit' })}</td>
    </tr>`).join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#0A1628;padding:28px 32px">
        <h1 style="color:#B8960A;margin:0 0 4px;font-size:22px">Daily Procurement Summary</h1>
        <p style="color:#94a3b8;margin:0;font-size:14px">Good morning, ${name} — ${dateStr}</p>
      </div>

      <div style="padding:32px">

        <!-- KPI Row -->
        <div style="display:flex;gap:12px;margin-bottom:28px">
          <div style="flex:1;background:#fef2f2;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:28px;font-weight:bold;color:#dc2626">${pendingApprovals}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px">Pending Approvals</div>
          </div>
          <div style="flex:1;background:#fef2f2;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:28px;font-weight:bold;color:#dc2626">${overdueTasks}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px">Overdue Tasks</div>
          </div>
          <div style="flex:1;background:#fffbeb;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:28px;font-weight:bold;color:#d97706">${dueTodayTasks.length}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px">Due Today</div>
          </div>
          <div style="flex:1;background:#fef3c7;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:28px;font-weight:bold;color:#b45309">${expiringVendorDocs}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px">Docs Expiring (7d)</div>
          </div>
        </div>

        <!-- Pending Approvals CTA -->
        ${pendingApprovals > 0 ? `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between">
          <span style="color:#dc2626;font-weight:600">${pendingApprovals} item${pendingApprovals !== 1 ? 's' : ''} awaiting your approval</span>
          <a href="${baseUrl}/dashboard/manager/approvals" style="background:#dc2626;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:bold">Review Now</a>
        </div>` : '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:20px;color:#16a34a;font-size:13px">✓ No pending approvals — your queue is clear.</div>'}

        <!-- Tasks Due Today -->
        ${dueTodayTasks.length > 0 ? `
        <h3 style="color:#111827;font-size:16px;margin:0 0 12px;border-bottom:1px solid #e5e7eb;padding-bottom:8px">Tasks Due Today</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">TASK</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">ASSIGNED TO</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">DUE TIME</th>
            </tr>
          </thead>
          <tbody>${dueTodayRows}</tbody>
        </table>` : ''}

        <!-- Doc Expiry Warning -->
        ${expiringVendorDocs > 0 ? `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin-bottom:20px">
          <span style="color:#b45309;font-weight:600">⚠ ${expiringVendorDocs} vendor document${expiringVendorDocs !== 1 ? 's' : ''} expiring within 7 days</span><br>
          <a href="${baseUrl}/dashboard/procurement/vendors" style="color:#B8960A;font-size:13px;margin-top:4px;display:inline-block">View vendor documents →</a>
        </div>` : ''}

        <!-- Footer CTA -->
        <div style="text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid #e5e7eb">
          <a href="${baseUrl}/dashboard" style="display:inline-block;background:#0A1628;color:#B8960A;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold">Go to Dashboard</a>
          <p style="color:#9ca3af;font-size:11px;margin-top:16px">This summary is sent daily by the Procurement ERP System.</p>
        </div>
      </div>
    </div>`;
}

function buildWeeklySummaryEmail(name, { totalSpend, totalActiveVendors, pendingApprovals, overdueTasks, date }) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const dateStr = date.toLocaleDateString('en-SA', { month: 'long', year: 'numeric' });
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#0A1628;padding:28px 32px">
        <h1 style="color:#B8960A;margin:0 0 4px;font-size:22px">Weekly Executive Summary</h1>
        <p style="color:#94a3b8;margin:0;font-size:14px">${dateStr}</p>
      </div>
      <div style="padding:32px">
        <p style="color:#374151">Hi ${name}, here is your weekly procurement overview:</p>
        <div style="display:flex;gap:12px;margin:20px 0">
          <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:22px;font-weight:bold;color:#16a34a">SAR ${(totalSpend || 0).toLocaleString()}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px">Approved PO Spend (Month)</div>
          </div>
          <div style="flex:1;background:#eff6ff;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:22px;font-weight:bold;color:#2563eb">${totalActiveVendors}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px">Active Vendors</div>
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:24px">
          <div style="flex:1;background:#fef2f2;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:22px;font-weight:bold;color:#dc2626">${pendingApprovals}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px">Pending Approvals</div>
          </div>
          <div style="flex:1;background:#fef2f2;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:22px;font-weight:bold;color:#dc2626">${overdueTasks}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px">Overdue Tasks</div>
          </div>
        </div>
        <div style="text-align:center">
          <a href="${baseUrl}/dashboard" style="display:inline-block;background:#0A1628;color:#B8960A;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold">Go to Dashboard</a>
        </div>
        <p style="color:#9ca3af;font-size:11px;margin-top:20px;text-align:center">Sent every Monday by the Procurement ERP System.</p>
      </div>
    </div>`;
}

// ─── Main job ─────────────────────────────────────────────────────────────────

export async function runDailySummaryJob() {
  const now = new Date();

  // Guard: only run once per day (23h window)
  if (lastDailyRun && (now - lastDailyRun) < 23 * 60 * 60 * 1000) return;
  lastDailyRun = now;

  console.log('⏰ [DailySummaryJob] Running at', now.toISOString());

  try {
    const managers = await prisma.user.findMany({
      where: { roleId: 2, isActive: true },
      select: { id: true, name: true, email: true },
    });

    for (const manager of managers) {
      // Pending approvals where this manager is the approver
      const pendingApprovals = await prisma.approvalStep.count({
        where: { approverId: manager.id, status: 'PENDING' },
      });

      // Overdue tasks managed by this manager
      const overdueTasks = await prisma.task.count({
        where: { assignedById: manager.id, status: 'OVERDUE' },
      });

      // Tasks due today for manager's team
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
      const dueTodayTasks = await prisma.task.findMany({
        where: {
          assignedById: manager.id,
          dueDate: { gte: todayStart, lte: todayEnd },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        include: { assignedUser: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      });

      // Vendor docs expiring in 7 days
      const in7Days = new Date(now.getTime() + 7 * 86400000);
      const expiringVendorDocs = await prisma.vendorDocument.count({
        where: {
          expiryDate: { gte: now, lte: in7Days },
          vendor: { status: { in: ['APPROVED', 'UNDER_REVIEW'] } },
        },
      });

      if (manager.email) {
        await emailService.sendEmail({
          to: manager.email,
          subject: `Daily Procurement Summary — ${now.toLocaleDateString('en-SA')}`,
          html: buildDailySummaryEmail(manager.name || 'Manager', {
            pendingApprovals,
            overdueTasks,
            dueTodayTasks,
            expiringVendorDocs,
            date: now,
          }),
        });
        console.log(`[DailySummaryJob] Sent daily summary to ${manager.email}`);
      }
    }

    // ── Weekly executive summary (Mondays only) ───────────────────────────────
    const isMonday = now.getDay() === 1;
    if (isMonday && (!lastWeeklyRun || (now - lastWeeklyRun) > 6 * 24 * 60 * 60 * 1000)) {
      lastWeeklyRun = now;

      const executives = await prisma.user.findMany({
        where: { roleId: 1, isActive: true },
        select: { id: true, name: true, email: true },
      });

      // Aggregate spend: sum of approved POs this month
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const approvedPOSpend = await prisma.purchaseOrder.aggregate({
        _sum: { totalAmount: true },
        where: {
          status: 'APPROVED',
          createdAt: { gte: monthStart },
        },
      }).catch(() => ({ _sum: { totalAmount: 0 } }));

      const totalActiveVendors = await prisma.vendor.count({
        where: { status: 'APPROVED', isQualified: true },
      });

      const pendingApprovals = await prisma.approvalStep.count({
        where: { status: 'PENDING' },
      });

      const overdueTasks = await prisma.task.count({
        where: { status: 'OVERDUE' },
      });

      for (const exec of executives) {
        if (exec.email) {
          await emailService.sendEmail({
            to: exec.email,
            subject: `Weekly Procurement Summary — ${now.toLocaleDateString('en-SA', { month: 'long', year: 'numeric' })}`,
            html: buildWeeklySummaryEmail(exec.name || 'Executive', {
              totalSpend: approvedPOSpend._sum?.totalAmount || 0,
              totalActiveVendors,
              pendingApprovals,
              overdueTasks,
              date: now,
            }),
          });
          console.log(`[DailySummaryJob] Sent weekly summary to ${exec.email}`);
        }
      }
    }

    console.log('[DailySummaryJob] Complete');
  } catch (error) {
    console.error('[DailySummaryJob] Error:', error);
  }
}
