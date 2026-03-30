import prisma from '../config/prismaClient.js';
import { emailService } from '../services/emailService.js';
import { notificationService } from '../services/notificationService.js';

// ─── URL helpers ─────────────────────────────────────────────────────────────

function getModuleUrl(taskType, entityId) {
  const id = entityId || '';
  switch (taskType) {
    case 'VENDOR_REVIEW':        return `/dashboard/procurement/vendors/${id}`;
    case 'RFQ_EVALUATION':       return `/dashboard/procurement/rfq/${id}`;
    case 'CONTRACT_REVIEW':      return `/dashboard/procurement/contracts/${id}`;
    case 'IPC_PROCESSING':       return `/dashboard/procurement/ipcs/${id}`;
    case 'DOCUMENT_VERIFICATION':return `/dashboard/procurement/vendors/${id}`;
    default:                     return '/dashboard/tasks';
  }
}

// ─── Email templates ──────────────────────────────────────────────────────────

function buildOverdueEmail(task, daysOverdue, moduleUrl) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#0A1628;padding:24px 32px">
        <h1 style="color:#B8960A;margin:0;font-size:20px">⚠ Task Overdue</h1>
      </div>
      <div style="padding:32px">
        <p style="color:#374151;font-size:15px">Hi ${task.assignedUser?.name || 'Team Member'},</p>
        <p style="color:#374151">The following task has passed its due date and requires immediate attention:</p>
        <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px 20px;border-radius:4px;margin:20px 0">
          <p style="margin:0 0 8px;font-weight:bold;color:#111827;font-size:16px">${task.title}</p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px">Due date: ${new Date(task.dueDate).toLocaleDateString('en-SA', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
          <p style="margin:0;color:#dc2626;font-weight:bold;font-size:13px">${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue</p>
        </div>
        <a href="${baseUrl}${moduleUrl}" style="display:inline-block;background:#B8960A;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:8px">View Task</a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">This is an automated notification from the Procurement ERP System.</p>
      </div>
    </div>`;
}

function buildManagerEscalationEmail(task, assigneeName, daysOverdue, moduleUrl) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#0A1628;padding:24px 32px">
        <h1 style="color:#B8960A;margin:0;font-size:20px">🚨 Escalation Alert</h1>
      </div>
      <div style="padding:32px">
        <p style="color:#374151;font-size:15px">A team task requires your attention:</p>
        <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px 20px;border-radius:4px;margin:20px 0">
          <p style="margin:0 0 6px;font-weight:bold;color:#111827">${task.title}</p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px">Assigned to: <strong>${assigneeName}</strong></p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px">Due date: ${new Date(task.dueDate).toLocaleDateString('en-SA')}</p>
          <p style="margin:0;color:#dc2626;font-weight:bold;font-size:13px">${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue — Priority: ${task.priority}</p>
        </div>
        <a href="${baseUrl}${moduleUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Take Action</a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">This escalation was triggered automatically by the Procurement ERP System.</p>
      </div>
    </div>`;
}

function buildReminderEmail(task) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const moduleUrl = getModuleUrl(task.taskType, task.relatedEntityId);
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#0A1628;padding:24px 32px">
        <h1 style="color:#B8960A;margin:0;font-size:20px">⏰ Task Due Tomorrow</h1>
      </div>
      <div style="padding:32px">
        <p style="color:#374151;font-size:15px">Hi ${task.assignedUser?.name || 'Team Member'},</p>
        <p style="color:#374151">This is a reminder that the following task is due tomorrow:</p>
        <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px 20px;border-radius:4px;margin:20px 0">
          <p style="margin:0 0 6px;font-weight:bold;color:#111827;font-size:16px">${task.title}</p>
          <p style="margin:0;color:#6b7280;font-size:13px">Due: ${new Date(task.dueDate).toLocaleDateString('en-SA', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
        </div>
        <a href="${baseUrl}${moduleUrl}" style="display:inline-block;background:#B8960A;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Open Task</a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">This is an automated reminder from the Procurement ERP System.</p>
      </div>
    </div>`;
}

// ─── Main job ─────────────────────────────────────────────────────────────────

export async function runTaskEscalationJob() {
  console.log('⏰ [TaskEscalationJob] Running at', new Date().toISOString());
  const now = new Date();

  try {
    // ── Step 1: Find newly overdue tasks (not yet escalated) ──────────────────
    const overdueTasks = await prisma.task.findMany({
      where: {
        dueDate: { lt: now },
        status: { notIn: ['COMPLETED', 'CANCELLED', 'OVERDUE'] },
        isEscalated: false,
      },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
        assignedByUser: { select: { id: true, name: true, email: true } },
      },
    });

    console.log(`[TaskEscalationJob] Found ${overdueTasks.length} newly overdue task(s)`);

    // Fetch all active managers once (avoids N queries)
    const managers = await prisma.user.findMany({
      where: { roleId: 2, isActive: true },
      select: { id: true, name: true, email: true },
    });

    for (const task of overdueTasks) {
      const daysOverdue = Math.ceil((now - task.dueDate) / 86400000);
      const moduleUrl = getModuleUrl(task.taskType, task.relatedEntityId);

      // 1a. Mark task as OVERDUE + escalated
      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'OVERDUE', isEscalated: true, escalatedAt: now },
      });

      // 1b. Email assigned user
      if (task.assignedUser?.email) {
        await emailService.sendEmail({
          to: task.assignedUser.email,
          subject: `⚠ Task Overdue: ${task.title}`,
          html: buildOverdueEmail(task, daysOverdue, moduleUrl),
        });
      }

      // 1c. Email + notify each manager
      for (const manager of managers) {
        if (manager.email) {
          await emailService.sendEmail({
            to: manager.email,
            subject: `Escalation Alert: ${task.assignedUser?.name}'s task is overdue`,
            html: buildManagerEscalationEmail(task, task.assignedUser?.name || 'Unknown', daysOverdue, moduleUrl),
          });
        }
        await notificationService.createNotification({
          userId: manager.id,
          title: `Escalated: ${task.title}`,
          body: `${task.assignedUser?.name}'s task is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`,
          type: 'WARNING',
          priority: 'HIGH',
          actionUrl: '/dashboard/manager/team',
          metadata: { taskId: task.id, assigneeName: task.assignedUser?.name, daysOverdue },
        });
      }
    }

    // ── Step 2: 24-hour reminders ─────────────────────────────────────────────
    const in24h = new Date(now.getTime() + 24 * 3600 * 1000);
    const dueSoonTasks = await prisma.task.findMany({
      where: {
        dueDate: { gte: now, lte: in24h },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        reminderSent: false,
      },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
      },
    });

    console.log(`[TaskEscalationJob] Found ${dueSoonTasks.length} task(s) due within 24h`);

    for (const task of dueSoonTasks) {
      if (task.assignedUser?.email) {
        await emailService.sendEmail({
          to: task.assignedUser.email,
          subject: `⏰ Reminder: Task due tomorrow — ${task.title}`,
          html: buildReminderEmail(task),
        });
      }
      await prisma.task.update({ where: { id: task.id }, data: { reminderSent: true } });
    }

    console.log(`[TaskEscalationJob] Complete — escalated: ${overdueTasks.length}, reminded: ${dueSoonTasks.length}`);
  } catch (error) {
    console.error('[TaskEscalationJob] Error:', error);
  }
}
