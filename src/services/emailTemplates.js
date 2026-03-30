// src/services/emailTemplates.js
// Branded HTML email templates for the Procurement ERP System
// All templates use navy (#0A1628) header, gold (#B8960A) accents, white body, gray footer.
// Inline styles only — no external CSS. Mobile responsive via max-width.

const BASE = (content) => `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
  ${content}
  <div style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb">
    <p style="color:#9ca3af;font-size:11px;margin:0">© ${new Date().getFullYear()} KUN Real Estate — Procurement ERP System. This is an automated message, please do not reply.</p>
  </div>
</div>`;

const HEADER = (title, subtitle = '') => `
<div style="background:#0A1628;padding:28px 32px">
  <h1 style="color:#B8960A;margin:0 0 4px;font-size:22px">${title}</h1>
  ${subtitle ? `<p style="color:#94a3b8;margin:0;font-size:14px">${subtitle}</p>` : ''}
</div>`;

const BTN = (href, label, color = '#B8960A') =>
  `<a href="${href}" style="display:inline-block;background:${color};color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">${label}</a>`;

// ─── 1. Account Activated ──────────────────────────────────────────────────────

export const accountActivatedTemplate = ({ userName, role, systemUrl }) =>
  BASE(`
    ${HEADER('Account Activated', 'Welcome to the KUN Procurement ERP System')}
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px">Hi ${userName},</p>
      <p style="color:#374151">Your account has been approved and activated. You can now log in as <strong>${role}</strong> and access the procurement portal.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:20px 0">
        <p style="color:#16a34a;margin:0;font-weight:600">✓ Account is now active</p>
      </div>
      <div style="text-align:center;margin-top:24px">${BTN(systemUrl + '/login', 'Log In Now')}</div>
    </div>`);

// ─── 2. Vendor Approved ────────────────────────────────────────────────────────

export const vendorApprovedTemplate = ({ vendorName, vendorClass, notes, systemUrl }) =>
  BASE(`
    ${HEADER('Vendor Application Approved', 'Congratulations!')}
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px">Dear ${vendorName},</p>
      <p style="color:#374151">We are pleased to inform you that your vendor application has been <strong>approved</strong>.</p>
      ${vendorClass ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin:20px 0"><p style="color:#1e40af;margin:0">Vendor Classification: <strong>Class ${vendorClass}</strong></p></div>` : ''}
      ${notes ? `<div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:20px 0"><p style="color:#374151;margin:0;font-size:13px"><strong>Notes:</strong> ${notes}</p></div>` : ''}
      <p style="color:#374151">You are now eligible to participate in RFQs and receive purchase orders through the system.</p>
      <div style="text-align:center;margin-top:24px">${BTN(systemUrl + '/dashboard/vendor', 'Access Vendor Portal')}</div>
    </div>`);

// ─── 3. Vendor Rejected ────────────────────────────────────────────────────────

export const vendorRejectedTemplate = ({ vendorName, reason, systemUrl }) =>
  BASE(`
    ${HEADER('Vendor Application Update')}
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px">Dear ${vendorName},</p>
      <p style="color:#374151">After careful review, we regret to inform you that your vendor application has not been approved at this time.</p>
      ${reason ? `<div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;padding:16px 20px;margin:20px 0"><p style="color:#374151;margin:0;font-size:13px"><strong>Reason:</strong> ${reason}</p></div>` : ''}
      <p style="color:#374151;font-size:13px">If you believe this decision was made in error or would like to appeal, please contact our procurement team.</p>
      <div style="text-align:center;margin-top:24px">${BTN(systemUrl + '/dashboard/vendor', 'Contact Us', '#6b7280')}</div>
    </div>`);

// ─── 4. Document Expiry ────────────────────────────────────────────────────────

export const documentExpiryTemplate = ({ vendorName, documentType, expiryDate, daysLeft, updateUrl }) => {
  const urgencyColor = daysLeft <= 1 ? '#dc2626' : daysLeft <= 7 ? '#ea580c' : '#d97706';
  const urgencyLabel = daysLeft <= 1 ? '🔴 CRITICAL' : daysLeft <= 7 ? '🟠 HIGH PRIORITY' : '🟡 REMINDER';
  return BASE(`
    ${HEADER('Document Expiry Alert', urgencyLabel)}
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px">Dear ${vendorName},</p>
      <p style="color:#374151">The following document requires immediate attention:</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin:20px 0">
        <p style="margin:0 0 8px;font-weight:bold;color:#111827;font-size:16px">${documentType}</p>
        <p style="margin:0 0 4px;color:#6b7280;font-size:13px">Expiry Date: <strong>${expiryDate}</strong></p>
        <p style="margin:0;color:${urgencyColor};font-weight:bold;font-size:13px">${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining</p>
      </div>
      <p style="color:#374151;font-size:13px">Please upload the renewed document through the procurement portal immediately to avoid disruption to your vendor status.</p>
      <div style="text-align:center;margin-top:24px">${BTN(updateUrl, 'Upload Document Now')}</div>
    </div>`);
};

// ─── 5. Task Assigned ──────────────────────────────────────────────────────────

export const taskAssignedTemplate = ({ userName, taskTitle, taskType, dueDate, managerName, systemUrl }) =>
  BASE(`
    ${HEADER('New Task Assigned', 'You have a new task to complete')}
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px">Hi ${userName},</p>
      <p style="color:#374151">A new task has been assigned to you by <strong>${managerName || 'your manager'}</strong>:</p>
      <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;padding:16px 20px;margin:20px 0">
        <p style="margin:0 0 8px;font-weight:bold;color:#111827;font-size:16px">${taskTitle}</p>
        <p style="margin:0 0 4px;color:#6b7280;font-size:13px">Type: ${(taskType || '').replace(/_/g, ' ')}</p>
        <p style="margin:0;color:#374151;font-size:13px">Due: <strong>${dueDate}</strong></p>
      </div>
      <div style="text-align:center;margin-top:24px">${BTN(systemUrl + '/dashboard/tasks', 'View Task')}</div>
    </div>`);

// ─── 6. Task Overdue ───────────────────────────────────────────────────────────

export const taskOverdueTemplate = ({ userName, taskTitle, daysOverdue, managerName, taskUrl }) =>
  BASE(`
    ${HEADER('⚠ Task Overdue')}
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px">Hi ${userName},</p>
      <p style="color:#374151">The following task has passed its due date and requires immediate attention:</p>
      <div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;padding:16px 20px;margin:20px 0">
        <p style="margin:0 0 8px;font-weight:bold;color:#111827;font-size:16px">${taskTitle}</p>
        <p style="margin:0;color:#dc2626;font-weight:bold;font-size:13px">${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue</p>
      </div>
      ${managerName ? `<p style="color:#374151;font-size:13px">Please update your manager <strong>${managerName}</strong> on the status of this task.</p>` : ''}
      <div style="text-align:center;margin-top:24px">${BTN(taskUrl || '#', 'View Task', '#dc2626')}</div>
    </div>`);

// ─── 7. Task Completed ─────────────────────────────────────────────────────────

export const taskCompletedTemplate = ({ managerName, userName, taskTitle, completedDate, taskUrl }) =>
  BASE(`
    ${HEADER('✓ Task Completed')}
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px">Hi ${managerName},</p>
      <p style="color:#374151"><strong>${userName}</strong> has completed the following task:</p>
      <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;padding:16px 20px;margin:20px 0">
        <p style="margin:0 0 8px;font-weight:bold;color:#111827;font-size:16px">${taskTitle}</p>
        <p style="margin:0;color:#16a34a;font-size:13px">Completed on: ${completedDate}</p>
      </div>
      <div style="text-align:center;margin-top:24px">${BTN(taskUrl || '#', 'View Task', '#16a34a')}</div>
    </div>`);

// ─── 8. PO Issued ─────────────────────────────────────────────────────────────

export const poIssuedTemplate = ({ vendorName, poNumber, projectName, totalValue, currency, deliveryDate, systemUrl }) =>
  BASE(`
    ${HEADER('Purchase Order Issued', `PO #${poNumber}`)}
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px">Dear ${vendorName},</p>
      <p style="color:#374151">A Purchase Order has been issued to your company:</p>
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:20px 0">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:140px">PO Number</td><td style="padding:6px 0;font-weight:bold;color:#111827">${poNumber}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Project</td><td style="padding:6px 0;color:#374151">${projectName || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Total Value</td><td style="padding:6px 0;font-weight:bold;color:#111827">${(totalValue || 0).toLocaleString()} ${currency || 'SAR'}</td></tr>
          ${deliveryDate ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Delivery Date</td><td style="padding:6px 0;color:#374151">${deliveryDate}</td></tr>` : ''}
        </table>
      </div>
      <p style="color:#374151;font-size:13px">Please review the PO details and confirm your acceptance through the procurement portal.</p>
      <div style="text-align:center;margin-top:24px">${BTN(systemUrl + '/dashboard/vendor/purchase-orders', 'View Purchase Order')}</div>
    </div>`);

// ─── 9. RFQ Invitation ────────────────────────────────────────────────────────

export const rfqInvitationTemplate = ({ vendorName, rfqNumber, projectName, deadline, systemUrl }) =>
  BASE(`
    ${HEADER('RFQ Invitation', `Request for Quotation #${rfqNumber}`)}
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px">Dear ${vendorName},</p>
      <p style="color:#374151">You have been invited to submit a quotation for the following project:</p>
      <div style="background:#fffbeb;border-radius:8px;padding:16px 20px;margin:20px 0">
        <p style="margin:0 0 8px;font-weight:bold;color:#111827;font-size:16px">${projectName || rfqNumber}</p>
        <p style="margin:0 0 4px;color:#6b7280;font-size:13px">RFQ Number: <strong>${rfqNumber}</strong></p>
        ${deadline ? `<p style="margin:0;color:#d97706;font-weight:bold;font-size:13px">Submission Deadline: ${deadline}</p>` : ''}
      </div>
      <p style="color:#374151;font-size:13px">Please submit your quotation before the deadline to be considered for this opportunity.</p>
      <div style="text-align:center;margin-top:24px">${BTN(systemUrl + '/dashboard/vendor/rfq', 'Submit Quotation')}</div>
    </div>`);

// ─── 10. IPC Status ───────────────────────────────────────────────────────────

export const ipcStatusTemplate = ({ vendorName, ipcNumber, status, amount, remarks, systemUrl }) => {
  const isPositive = ['APPROVED', 'PAID'].includes(status);
  return BASE(`
    ${HEADER(`IPC Status Updated — ${status}`, `IPC #${ipcNumber}`)}
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px">Dear ${vendorName},</p>
      <p style="color:#374151">The status of your Interim Payment Certificate has been updated:</p>
      <div style="background:${isPositive ? '#f0fdf4' : '#fef2f2'};border-left:4px solid ${isPositive ? '#16a34a' : '#dc2626'};border-radius:4px;padding:16px 20px;margin:20px 0">
        <p style="margin:0 0 8px;font-weight:bold;color:#111827">IPC #${ipcNumber}</p>
        <p style="margin:0 0 4px;color:${isPositive ? '#16a34a' : '#dc2626'};font-weight:bold;font-size:14px">Status: ${status}</p>
        ${amount ? `<p style="margin:4px 0 0;color:#374151;font-size:13px">Amount: <strong>${Number(amount).toLocaleString()} SAR</strong></p>` : ''}
      </div>
      ${remarks ? `<div style="background:#f9fafb;border-radius:8px;padding:12px 16px;margin:16px 0"><p style="color:#374151;font-size:13px;margin:0"><strong>Notes:</strong> ${remarks}</p></div>` : ''}
      <div style="text-align:center;margin-top:24px">${BTN((systemUrl || 'http://localhost:3000') + '/dashboard/vendor/ipc', 'View IPC Details')}</div>
    </div>`);
};

// ─── 11. Pending Approval ─────────────────────────────────────────────────────

export const pendingApprovalTemplate = ({ managerName, itemType, itemNumber, requestedBy, value, systemUrl }) =>
  BASE(`
    ${HEADER('Action Required: Pending Approval')}
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px">Hi ${managerName},</p>
      <p style="color:#374151">An item requires your approval:</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin:20px 0">
        <p style="margin:0 0 8px;font-weight:bold;color:#111827;font-size:16px">${itemType} — ${itemNumber}</p>
        <p style="margin:0 0 4px;color:#6b7280;font-size:13px">Requested by: <strong>${requestedBy || 'Staff'}</strong></p>
        ${value ? `<p style="margin:0;color:#374151;font-size:13px">Value: <strong>${Number(value).toLocaleString()} SAR</strong></p>` : ''}
      </div>
      <div style="text-align:center;margin-top:24px">${BTN(systemUrl + '/dashboard/manager/approvals', 'Review & Approve')}</div>
    </div>`);

// ─── 12. Weekly Manager Summary ───────────────────────────────────────────────

export const weeklyManagerSummaryTemplate = ({ managerName, pendingApprovals, overdueTasks, expiringDocuments, newVendors, weeklyStats }) => {
  const systemUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return BASE(`
    ${HEADER('Weekly Procurement Report', new Date().toLocaleDateString('en-SA', { month: 'long', year: 'numeric' }))}
    <div style="padding:32px">
      <p style="color:#374151">Hi ${managerName}, here is your weekly procurement overview:</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin:20px 0">
        <div style="flex:1;min-width:120px;background:#fef2f2;border-radius:8px;padding:16px;text-align:center">
          <div style="font-size:28px;font-weight:bold;color:#dc2626">${pendingApprovals}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px">Pending Approvals</div>
        </div>
        <div style="flex:1;min-width:120px;background:#fef2f2;border-radius:8px;padding:16px;text-align:center">
          <div style="font-size:28px;font-weight:bold;color:#dc2626">${overdueTasks}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px">Overdue Tasks</div>
        </div>
        <div style="flex:1;min-width:120px;background:#fffbeb;border-radius:8px;padding:16px;text-align:center">
          <div style="font-size:28px;font-weight:bold;color:#d97706">${expiringDocuments}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px">Expiring Docs</div>
        </div>
        <div style="flex:1;min-width:120px;background:#eff6ff;border-radius:8px;padding:16px;text-align:center">
          <div style="font-size:28px;font-weight:bold;color:#2563eb">${newVendors}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px">New Vendors</div>
        </div>
      </div>
      ${weeklyStats ? `
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:16px 0">
        <h3 style="color:#111827;font-size:14px;margin:0 0 12px">This Week's Activity</h3>
        <div style="display:flex;gap:24px">
          <div><span style="color:#6b7280;font-size:13px">Tasks Completed: </span><strong style="color:#16a34a">${weeklyStats.tasksCompleted || 0}</strong></div>
          <div><span style="color:#6b7280;font-size:13px">POs Issued: </span><strong style="color:#2563eb">${weeklyStats.poIssued || 0}</strong></div>
        </div>
      </div>` : ''}
      <div style="text-align:center;margin-top:24px">${BTN(systemUrl + '/dashboard', 'Go to Dashboard')}</div>
    </div>`);
};
