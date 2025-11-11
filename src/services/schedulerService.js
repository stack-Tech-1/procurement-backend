// backend/src/services/schedulerService.js
import cron from 'node-cron';
import { notificationService } from './notificationService.js';
import { taskService } from './taskService.js';
import prisma from '../config/prismaClient.js';


export const schedulerService = {

  startScheduledJobs() {
    console.log('⏰ Starting scheduled notification jobs...');

    // Check document expiry every day at 8:00 AM
    cron.schedule('0 8 * * *', async () => {
      try {
        console.log('⏰ Running document expiry check...');
        const count = await notificationService.checkDocumentExpiryAlerts();
        console.log(`✅ Document expiry check completed: ${count} alerts sent`);
      } catch (error) {
        console.error('❌ Document expiry check failed:', error);
      }
    });

    // Check pending approvals every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      try {
        console.log('⏰ Running pending approvals check...');
        const count = await notificationService.checkPendingApprovals();
        console.log(`✅ Pending approvals check completed: ${count} alerts sent`);
      } catch (error) {
        console.error('❌ Pending approvals check failed:', error);
      }
    });

    // Check overdue tasks every day at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
      try {
        console.log('⏰ Running overdue tasks check...');
        const count = await this.checkOverdueTaskAlerts();
        console.log(`✅ Overdue tasks check completed: ${count} alerts sent`);
      } catch (error) {
        console.error('❌ Overdue tasks check failed:', error);
      }
    });

     // Check overdue tasks every day at 10:00 AM
     cron.schedule('0 10 * * *', async () => {
        try {
          console.log('⏰ Running overdue task escalation...');
          const count = await taskService.getOverdueTasksForEscalation();
          console.log(`✅ Task escalation completed: ${count} critical tasks escalated`);
        } catch (error) {
          console.error('❌ Task escalation failed:', error);
        }
      });
        
    console.log('✅ All scheduled jobs started successfully');
  },

  async checkOverdueTaskAlerts() {
    const overdueTasks = await prisma.task.findMany({
      where: {
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        dueDate: { lt: new Date() }
      },
      include: {
        assignedUser: true,
        assignedByUser: true
      }
    });

    let alertCount = 0;

    for (const task of overdueTasks) {
      // Notify assigned user
      await notificationService.createNotification({
        userId: task.assignedTo,
        title: `Overdue Task: ${task.title}`,
        body: `This task was due on ${task.dueDate.toLocaleDateString()}`,
        type: 'WARNING',
        priority: 'HIGH',
        actionUrl: `/dashboard/tasks`,
        metadata: {
          taskId: task.id,
          dueDate: task.dueDate,
          priority: task.priority
        },
        sendEmail: true
      });

      // Notify manager if task is high priority
      if (task.priority === 'HIGH' || task.priority === 'URGENT') {
        await notificationService.createNotification({
          userId: task.assignedById,
          title: `Overdue High Priority Task: ${task.title}`,
          body: `Task assigned to ${task.assignedUser?.name} is overdue`,
          type: 'WARNING',
          priority: 'HIGH',
          actionUrl: `/dashboard/tasks`,
          metadata: {
            taskId: task.id,
            assignedTo: task.assignedUser?.name,
            dueDate: task.dueDate
          },
          sendEmail: true
        });
        
        alertCount += 2;
      } else {
        alertCount += 1;
      }
    }

    return alertCount;
  }
};