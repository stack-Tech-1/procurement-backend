// backend/src/services/notificationService.js
import prisma from '../config/prismaClient.js';
import { emailService } from './emailService.js';

// Enhanced retry wrapper function
async function withRetry(operation, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      // Retry on database connection errors
      if ((error.code === 'P1001' || error.code === 'P1017') && i < maxRetries - 1) {
        console.log(`🔄 Database connection lost, retry ${i + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
}

export const notificationService = {
  
    // Create and send notification WITH RETRY
    async createNotification(notificationData) {
      return await withRetry(async () => {
        try {
          const notification = await prisma.notification.create({
            data: {
              userId: notificationData.userId,
              title: notificationData.title,
              body: notificationData.body,
              type: notificationData.type || 'INFO',
              priority: notificationData.priority || 'MEDIUM',
              actionUrl: notificationData.actionUrl,
              metadata: notificationData.metadata
            },
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                  roleId: true
                }
              }
            }
          });
  
          // Send email for high priority notifications (no retry needed for email)
          if (notificationData.priority === 'HIGH' || notificationData.sendEmail) {
            await this.sendEmailNotification(notification).catch(emailError => {
              console.error('Email sending failed but notification was created:', emailError);
              // Don't throw - notification is already created
            });
          }
  
          return notification;
        } catch (error) {
          console.error('Error creating notification:', error);
          throw error;
        }
      });
    },

  // Send email notification (no retry needed - already handled in emailService)
  async sendEmailNotification(notification) {
    try {
      const emailTemplate = this.getEmailTemplate(notification);
      
      await emailService.sendEmail({
        to: notification.user.email,
        subject: emailTemplate.subject,
        html: emailTemplate.html,
        text: emailTemplate.text
      });

      console.log(`📧 Email notification sent to ${notification.user.email}`);
    } catch (error) {
      console.error('Error sending email notification:', error);
      // Don't throw error - notification should still be created in DB
    }
  },


   // Get notification statistics with retry
   async getNotificationStats(userId) {
    return await withRetry(async () => {
      const [total, unread, highPriority] = await Promise.all([
        prisma.notification.count({ where: { userId } }),
        prisma.notification.count({ where: { userId, read: false } }),
        prisma.notification.count({ 
          where: { 
            userId, 
            read: false,
            priority: 'HIGH' 
          } 
        })
      ]);

      return {
        total,
        unread,
        highPriority,
        read: total - unread
      };
    });
  },

  // Get user notifications with retry
  async getUserNotifications(userId, filters = {}) {
    return await withRetry(async () => {
      const where = { userId };
      
      if (filters.unreadOnly) where.read = false;
      if (filters.type) where.type = filters.type;

      return await prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 50
      });
    });
  },

  // Mark as read with retry
  async markAsRead(notificationId) {
    return await withRetry(async () => {
      return await prisma.notification.update({
        where: { id: notificationId },
        data: { read: true, readAt: new Date() }
      });
    });
  },

  // Mark all as read with retry
  async markAllAsRead(userId) {
    return await withRetry(async () => {
      return await prisma.notification.updateMany({
        where: { 
          userId, 
          read: false 
        },
        data: { 
          read: true, 
          readAt: new Date() 
        }
      });
    });
  },

  // Automated alerts with retry
  async checkDocumentExpiryAlerts() {
    return await withRetry(async () => {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const expiringDocuments = await prisma.vendorDocument.findMany({
        where: {
          expiryDate: {
            lte: thirtyDaysFromNow,
            gte: new Date()
          },
          isValid: true
        },
        include: {
          vendor: {
            include: {
              user: true,
              assignedReviewer: {
                select: { id: true, email: true, name: true }
              }
            }
          }
        }
      });

      let alertCount = 0;
      for (const doc of expiringDocuments) {
        const daysUntilExpiry = Math.ceil((doc.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
        
        let userId = doc.vendor.assignedReviewer?.id;
        if (!userId) {
          // Fallback to procurement manager
          const manager = await prisma.user.findFirst({
            where: { roleId: 2 } // PROCUREMENT_MANAGER
          });
          userId = manager?.id;
        }

        if (userId) {
          await this.createNotification({
            userId,
            title: `Document Expiry Alert - ${doc.docType}`,
            body: `${doc.vendor.companyLegalName}'s ${doc.docType} expires in ${daysUntilExpiry} days`,
            type: 'WARNING',
            priority: daysUntilExpiry <= 7 ? 'HIGH' : 'MEDIUM',
            actionUrl: `/dashboard/procurement/vendors/${doc.vendor.id}`,
            metadata: {
              vendorId: doc.vendor.id,
              documentId: doc.id,
              documentType: doc.docType,
              expiryDate: doc.expiryDate,
              daysUntilExpiry
            },
            sendEmail: daysUntilExpiry <= 7
          });
          alertCount++;
        }
      }

      return alertCount;
    });
  },
  
    // Automated alert: Pending approvals WITH RETRY
    async checkPendingApprovals() {
      return await withRetry(async () => {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const pendingApprovals = await prisma.approval.findMany({
          where: { 
            status: 'PENDING',
            createdAt: {
              lte: twentyFourHoursAgo // Older than 24 hours
            }
          },
          include: {
            approver: {
              select: {
                id: true,
                name: true,
                email: true,
                isActive: true
              }
            }
          }
        });
  
        let notificationCount = 0;
        
        for (const approval of pendingApprovals) {
          // Only send notifications if approver is active
          if (approval.approver && approval.approver.isActive) {
            try {
              await this.createNotification({
                userId: approval.approverId,
                title: `Pending Approval Reminder`,
                body: `Approval for ${approval.entityType} #${approval.entityId} is pending for more than 24 hours`,
                type: 'REMINDER',
                priority: 'MEDIUM',
                actionUrl: `/dashboard/admin/approvals`,
                metadata: {
                  approvalId: approval.id,
                  entityType: approval.entityType,
                  entityId: approval.entityId,
                  pendingSince: approval.createdAt,
                  approverName: approval.approver.name
                }
              });
              notificationCount++;
            } catch (error) {
              console.error(`Failed to create notification for approval ${approval.id}:`, error);
              // Continue with other approvals even if one fails
            }
          }
        }
  
        console.log(`📋 Sent ${notificationCount} pending approval reminders`);
        return notificationCount;
      });
    },
  
    // Automated alert: Overdue tasks WITH RETRY
    async checkOverdueTaskAlerts() {
      return await withRetry(async () => {
        const overdueTasks = await prisma.task.findMany({
          where: {
            status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
            dueDate: { lt: new Date() } // Past due date
          },
          include: {
            assignedUser: {
              select: { id: true, name: true, email: true, isActive: true }
            },
            assignedByUser: {
              select: { id: true, name: true, email: true }
            }
          }
        });
  
        let notificationCount = 0;
  
        for (const task of overdueTasks) {
          const daysOverdue = Math.ceil((new Date() - task.dueDate) / (1000 * 60 * 60 * 24));
          
          // Notify assigned user
          if (task.assignedUser && task.assignedUser.isActive) {
            try {
              await this.createNotification({
                userId: task.assignedTo,
                title: `Overdue Task: ${task.title}`,
                body: `This task was due ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} ago`,
                type: 'WARNING',
                priority: daysOverdue > 3 ? 'HIGH' : 'MEDIUM',
                actionUrl: `/dashboard/tasks`,
                metadata: {
                  taskId: task.id,
                  dueDate: task.dueDate,
                  daysOverdue: daysOverdue,
                  priority: task.priority
                },
                sendEmail: daysOverdue > 3 // Send email for tasks overdue > 3 days
              });
              notificationCount++;
            } catch (error) {
              console.error(`Failed to create overdue task notification for user ${task.assignedTo}:`, error);
            }
          }
  
          // Escalate to manager if task is critical or very overdue
          if ((task.priority === 'HIGH' || task.priority === 'URGENT' || daysOverdue > 5) && 
              task.assignedById !== task.assignedTo) {
            try {
              await this.createNotification({
                userId: task.assignedById,
                title: `Overdue Task Escalation: ${task.title}`,
                body: `Task assigned to ${task.assignedUser?.name || 'team member'} is ${daysOverdue} days overdue`,
                type: 'WARNING',
                priority: 'HIGH',
                actionUrl: `/dashboard/tasks`,
                metadata: {
                  taskId: task.id,
                  assignedTo: task.assignedUser?.name,
                  dueDate: task.dueDate,
                  daysOverdue: daysOverdue,
                  priority: task.priority
                },
                sendEmail: true // Always email managers for escalations
              });
              notificationCount++;
            } catch (error) {
              console.error(`Failed to create escalation notification for manager ${task.assignedById}:`, error);
            }
          }
        }
  
        console.log(`⏰ Sent ${notificationCount} overdue task alerts`);
        return notificationCount;
      });
    },
  
    // Automated alert: Vendor qualification reviews WITH RETRY
    async checkVendorReviewAlerts() {
      return await withRetry(async () => {
        const vendorsNeedingReview = await prisma.vendor.findMany({
          where: {
            OR: [
              { status: 'UNDER_REVIEW' },
              { 
                status: 'APPROVED',
                nextReviewDate: { 
                  lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Due in next 7 days
                }
              }
            ]
          },
          include: {
            assignedReviewer: {
              select: { id: true, name: true, email: true, isActive: true }
            },
            lastReviewedBy: {
              select: { name: true }
            }
          }
        });
  
        let notificationCount = 0;
  
        for (const vendor of vendorsNeedingReview) {
          let userId = vendor.assignedReviewer?.id;
          
          // If no assigned reviewer, find a procurement manager
          if (!userId) {
            const manager = await prisma.user.findFirst({
              where: { 
                roleId: 2, // PROCUREMENT_MANAGER
                isActive: true 
              }
            });
            userId = manager?.id;
          }
  
          if (userId) {
            try {
              let title, body, priority;
              
              if (vendor.status === 'UNDER_REVIEW') {
                title = `Vendor Review Required: ${vendor.companyLegalName}`;
                body = `New vendor submission requires qualification review`;
                priority = 'MEDIUM';
              } else {
                const daysUntilReview = Math.ceil((vendor.nextReviewDate - new Date()) / (1000 * 60 * 60 * 24));
                title = `Vendor Re-evaluation Due: ${vendor.companyLegalName}`;
                body = `Vendor re-evaluation due in ${daysUntilReview} days`;
                priority = daysUntilReview <= 3 ? 'HIGH' : 'MEDIUM';
              }
  
              await this.createNotification({
                userId,
                title,
                body,
                type: 'REMINDER',
                priority,
                actionUrl: `/dashboard/procurement/vendors/${vendor.id}`,
                metadata: {
                  vendorId: vendor.id,
                  vendorName: vendor.companyLegalName,
                  status: vendor.status,
                  nextReviewDate: vendor.nextReviewDate,
                  lastReviewedBy: vendor.lastReviewedBy?.name
                },
                sendEmail: priority === 'HIGH'
              });
              notificationCount++;
            } catch (error) {
              console.error(`Failed to create vendor review notification for vendor ${vendor.id}:`, error);
            }
          }
        }
  
        console.log(`🏢 Sent ${notificationCount} vendor review alerts`);
        return notificationCount;
      });
    },
  
    // Bulk notification for system announcements
    async sendBulkNotification(userIds, notificationData) {
      return await withRetry(async () => {
        let successCount = 0;
        let errorCount = 0;
  
        for (const userId of userIds) {
          try {
            await this.createNotification({
              userId,
              title: notificationData.title,
              body: notificationData.body,
              type: notificationData.type || 'INFO',
              priority: notificationData.priority || 'MEDIUM',
              actionUrl: notificationData.actionUrl,
              metadata: notificationData.metadata
            });
            successCount++;
          } catch (error) {
            console.error(`Failed to send bulk notification to user ${userId}:`, error);
            errorCount++;
            // Continue with other users even if one fails
          }
        }
  
        console.log(`📢 Bulk notification completed: ${successCount} successful, ${errorCount} failed`);
        return { successCount, errorCount };
      });
    },
  
    // Clean up old notifications (keep only last 90 days)
    async cleanupOldNotifications() {
      return await withRetry(async () => {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
        const result = await prisma.notification.deleteMany({
          where: {
            createdAt: {
              lt: ninetyDaysAgo
            },
            read: true // Only delete read notifications
          }
        });
  
        console.log(`🧹 Cleaned up ${result.count} old notifications`);
        return result.count;
      });
    },
  
    // Enhanced Email template generator
    getEmailTemplate(notification) {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const supportEmail = process.env.SUPPORT_EMAIL || 'support@procurement.com';
      
      const templates = {
        WARNING: {
          subject: `⚠️ Action Required: ${notification.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
              <div style="background: #d97706; color: white; padding: 15px; border-radius: 6px 6px 0 0; text-align: center;">
                <h2 style="margin: 0;">⚠️ Action Required</h2>
              </div>
              <div style="padding: 20px;">
                <p style="font-size: 16px; line-height: 1.5;">${notification.body}</p>
                ${notification.actionUrl ? `
                  <div style="text-align: center; margin: 25px 0;">
                    <a href="${baseUrl}${notification.actionUrl}" 
                       style="background: #d97706; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                      Take Action
                    </a>
                  </div>
                ` : ''}
                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
                <p style="color: #666; font-size: 12px;">
                  This is an automated notification from the Procurement System.<br>
                  If you need assistance, please contact <a href="mailto:${supportEmail}">${supportEmail}</a>.
                </p>
              </div>
            </div>
          `,
          text: `${notification.title}\n\n${notification.body}\n\n${notification.actionUrl ? `Take action: ${baseUrl}${notification.actionUrl}\n\n` : ''}This is an automated notification from the Procurement System.`
        },
        REMINDER: {
          subject: `🔔 Reminder: ${notification.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
              <div style="background: #2563eb; color: white; padding: 15px; border-radius: 6px 6px 0 0; text-align: center;">
                <h2 style="margin: 0;">🔔 Reminder</h2>
              </div>
              <div style="padding: 20px;">
                <p style="font-size: 16px; line-height: 1.5;">${notification.body}</p>
                ${notification.actionUrl ? `
                  <div style="text-align: center; margin: 25px 0;">
                    <a href="${baseUrl}${notification.actionUrl}" 
                       style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                      View Details
                    </a>
                  </div>
                ` : ''}
                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
                <p style="color: #666; font-size: 12px;">
                  This is an automated reminder from the Procurement System.
                </p>
              </div>
            </div>
          `,
          text: `Reminder: ${notification.title}\n\n${notification.body}\n\n${notification.actionUrl ? `View details: ${baseUrl}${notification.actionUrl}\n\n` : ''}This is an automated reminder from the Procurement System.`
        },
        INFO: {
          subject: `📋 ${notification.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
              <div style="background: #059669; color: white; padding: 15px; border-radius: 6px 6px 0 0; text-align: center;">
                <h2 style="margin: 0;">📋 System Update</h2>
              </div>
              <div style="padding: 20px;">
                <p style="font-size: 16px; line-height: 1.5;">${notification.body}</p>
                ${notification.actionUrl ? `
                  <div style="text-align: center; margin: 25px 0;">
                    <a href="${baseUrl}${notification.actionUrl}" 
                       style="background: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                      View Details
                    </a>
                  </div>
                ` : ''}
                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
                <p style="color: #666; font-size: 12px;">
                  This is an automated update from the Procurement System.
                </p>
              </div>
            </div>
          `,
          text: `${notification.title}\n\n${notification.body}\n\n${notification.actionUrl ? `View details: ${baseUrl}${notification.actionUrl}\n\n` : ''}This is an automated update from the Procurement System.`
        }
      };
  
      return templates[notification.type] || templates.INFO;
    }
  };