import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import multer from 'multer';
import ExcelJS from 'exceljs';
import prisma from '../../config/prismaClient.js';
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { authorizeRole } from '../../middleware/roleMiddleware.js';
import { emailService } from '../../services/emailService.js';
import { logAction, logUserAction } from '../../services/auditService.js';

const router = express.Router();
const requireAdmin = [authenticateToken, authorizeRole([1])];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const generateTempPassword = () => {
  const base = crypto.randomBytes(8).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  return base + 'A1!';
};

function validatePasswordStrength(password) {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return false;
  return true;
}

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get('/stats', ...requireAdmin, async (req, res) => {
  try {
    const [totalUsers, activeUsers, suspendedUsers, twoFactorCount, recentLogins] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isSuspended: true } }),
      prisma.user.count({ where: { twoFactorEnabled: true } }),
      prisma.auditLog.findMany({
        where: { action: 'LOGIN' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);

    const inactiveLast30Days = await prisma.user.count({
      where: {
        isActive: true,
        lastLoginDate: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });

    res.json({
      success: true,
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      suspendedUsers,
      twoFactorEnabledCount: twoFactorCount,
      twoFactorEnabledPercent: totalUsers > 0 ? Math.round((twoFactorCount / totalUsers) * 100) : 0,
      inactiveLast30Days,
      recentLogins,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── List Users ───────────────────────────────────────────────────────────────
router.get('/', ...requireAdmin, async (req, res) => {
  try {
    const {
      role, status, department, search, isActive, isSuspended,
      twoFactorEnabled, page = 1, pageSize = 20,
    } = req.query;

    const where = {};
    if (role) where.roleId = parseInt(role);
    if (status) where.status = status;
    if (department) where.department = department;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (isSuspended !== undefined) where.isSuspended = isSuspended === 'true';
    if (twoFactorEnabled !== undefined) where.twoFactorEnabled = twoFactorEnabled === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, roleId: true, employeeId: true,
          jobTitle: true, department: true, status: true, isActive: true,
          isSuspended: true, twoFactorEnabled: true, lastLoginDate: true,
          accessScope: true, createdAt: true, mustChangePassword: true,
          role: { select: { name: true } },
          auditLogs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true, action: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const usersWithActivity = users.map(u => ({
      ...u,
      lastActivity: u.auditLogs[0] || null,
      auditLogs: undefined,
    }));

    res.json({ success: true, users: usersWithActivity, total });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ─── Get Single User ──────────────────────────────────────────────────────────
router.get('/:id', ...requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Count actions by module
    const moduleCounts = await prisma.auditLog.groupBy({
      by: ['module'],
      where: { userId: id, module: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { module: 'desc' } },
    });

    const { password, twoFactorSecret, passwordResetToken, ...safeUser } = user;
    res.json({
      success: true,
      user: safeUser,
      activityByModule: moduleCounts.map(m => ({ module: m.module, count: m._count._all })),
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ─── Create User ──────────────────────────────────────────────────────────────
router.post('/', ...requireAdmin, async (req, res) => {
  try {
    const { name, email, password, roleId, employeeId, jobTitle, department, phoneNumber, accessScope, sendWelcomeEmail } = req.body;
    if (!name || !email || !password || !roleId) {
      return res.status(400).json({ error: 'name, email, password, and roleId are required' });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    if (!validatePasswordStrength(password)) {
      return res.status(400).json({ error: 'Password does not meet strength requirements' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name, email, password: hashed, roleId: parseInt(roleId),
        employeeId: employeeId || null, jobTitle: jobTitle || null,
        department: department || null, phoneNumber: phoneNumber || null,
        accessScope: accessScope || 'ALL_PROJECTS', status: 'ACTIVE', isActive: true,
        lastPasswordChange: new Date(),
      },
      select: {
        id: true, name: true, email: true, roleId: true, employeeId: true,
        jobTitle: true, department: true, status: true, isActive: true,
      },
    });

    if (sendWelcomeEmail !== false) {
      try {
        await emailService.sendEmail({
          to: email,
          subject: 'Welcome to KUN ProcureTrack',
          html: `<p>Hello ${name},</p><p>Your account has been created. You can login at <a href="${process.env.FRONTEND_URL}">${process.env.FRONTEND_URL}</a>.</p>`,
        });
      } catch (emailErr) {
        console.error('Welcome email failed:', emailErr.message);
      }
    }

    await logUserAction(req, 'USER_CREATED', 'USER_MANAGEMENT', user.id, 'User', null, { name, email, roleId });
    res.status(201).json({ success: true, user });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ─── Update User Profile ──────────────────────────────────────────────────────
router.put('/:id', ...requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const { name, jobTitle, department, phoneNumber, accessScope, notes } = req.body;
    const old = await prisma.user.findUnique({ where: { id }, select: { name: true, jobTitle: true, department: true, phoneNumber: true, accessScope: true, notes: true } });
    if (!old) return res.status(404).json({ error: 'User not found' });

    const updated = await prisma.user.update({
      where: { id },
      data: { name, jobTitle, department, phoneNumber, accessScope, notes },
      select: { id: true, name: true, email: true, jobTitle: true, department: true, phoneNumber: true, accessScope: true, notes: true },
    });

    await logUserAction(req, 'USER_UPDATED', 'USER_MANAGEMENT', id, 'User', old, { name, jobTitle, department, phoneNumber, accessScope });
    res.json({ success: true, user: updated });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ─── Change Role ──────────────────────────────────────────────────────────────
router.patch('/:id/role', ...requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const { roleId } = req.body;
    if (!roleId) return res.status(400).json({ error: 'roleId is required' });

    const user = await prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newRole = await prisma.role.findUnique({ where: { id: parseInt(roleId) } });
    if (!newRole) return res.status(400).json({ error: 'Role not found' });

    await prisma.user.update({ where: { id }, data: { roleId: parseInt(roleId) } });

    await logUserAction(req, 'ROLE_CHANGED', 'USER_MANAGEMENT', id, 'User',
      { roleId: user.roleId, roleName: user.role?.name },
      { roleId: parseInt(roleId), roleName: newRole.name }
    );

    try {
      await emailService.sendEmail({
        to: user.email,
        subject: 'Your KUN ProcureTrack Role Has Changed',
        html: `<p>Hello ${user.name},</p><p>Your role has been updated from <strong>${user.role?.name}</strong> to <strong>${newRole.name}</strong>.</p>`,
      });
    } catch (e) { console.error('Role change email failed:', e.message); }

    res.json({ success: true });
  } catch (err) {
    console.error('Change role error:', err);
    res.status(500).json({ error: 'Failed to change role' });
  }
});

// ─── Activate / Deactivate ────────────────────────────────────────────────────
router.patch('/:id/status', ...requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive (boolean) is required' });

    const user = await prisma.user.findUnique({ where: { id }, select: { email: true, name: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await prisma.user.update({ where: { id }, data: { isActive } });

    const action = isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED';
    await logUserAction(req, action, 'USER_MANAGEMENT', id, 'User');

    try {
      await emailService.sendEmail({
        to: user.email,
        subject: `Your KUN ProcureTrack account has been ${isActive ? 'activated' : 'deactivated'}`,
        html: `<p>Hello ${user.name},</p><p>Your account has been ${isActive ? 'activated' : 'deactivated'} by an administrator.</p>`,
      });
    } catch (e) { console.error('Status email failed:', e.message); }

    res.json({ success: true });
  } catch (err) {
    console.error('Status change error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ─── Suspend ──────────────────────────────────────────────────────────────────
router.patch('/:id/suspend', ...requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const { reason, suspendedUntil } = req.body;
    if (!reason) return res.status(400).json({ error: 'reason is required' });

    const user = await prisma.user.findUnique({ where: { id }, select: { email: true, name: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await prisma.user.update({
      where: { id },
      data: { isSuspended: true, suspendedReason: reason, suspendedUntil: suspendedUntil ? new Date(suspendedUntil) : null },
    });

    await logUserAction(req, 'USER_SUSPENDED', 'USER_MANAGEMENT', id, 'User', null, { reason, suspendedUntil });

    try {
      await emailService.sendEmail({
        to: user.email,
        subject: 'Your KUN ProcureTrack account has been suspended',
        html: `<p>Hello ${user.name},</p><p>Your account has been suspended. Reason: <strong>${reason}</strong>.</p><p>Please contact your administrator for more information.</p>`,
      });
    } catch (e) { console.error('Suspend email failed:', e.message); }

    res.json({ success: true });
  } catch (err) {
    console.error('Suspend error:', err);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});

// ─── Unsuspend ────────────────────────────────────────────────────────────────
router.patch('/:id/unsuspend', ...requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { email: true, name: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await prisma.user.update({ where: { id }, data: { isSuspended: false, suspendedReason: null, suspendedUntil: null } });
    await logUserAction(req, 'USER_UNSUSPENDED', 'USER_MANAGEMENT', id, 'User');

    res.json({ success: true });
  } catch (err) {
    console.error('Unsuspend error:', err);
    res.status(500).json({ error: 'Failed to unsuspend user' });
  }
});

// ─── Reset Password ───────────────────────────────────────────────────────────
router.patch('/:id/reset-password', ...requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { email: true, name: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tempPassword = generateTempPassword();
    const hashed = await bcrypt.hash(tempPassword, 12);

    await prisma.user.update({
      where: { id },
      data: { password: hashed, mustChangePassword: true, lastPasswordChange: null },
    });

    await logUserAction(req, 'PASSWORD_RESET_BY_ADMIN', 'USER_MANAGEMENT', id, 'User');

    try {
      await emailService.sendEmail({
        to: user.email,
        subject: 'Your KUN ProcureTrack Password Has Been Reset',
        html: `<p>Hello ${user.name},</p><p>Your password has been reset by an administrator. Your temporary password is:</p><p><strong>${tempPassword}</strong></p><p>You will be required to change it upon your next login.</p>`,
      });
    } catch (e) { console.error('Password reset email failed:', e.message); }

    res.json({ success: true, message: 'Temporary password sent to user email' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ─── Toggle 2FA ───────────────────────────────────────────────────────────────
router.patch('/:id/toggle-2fa', ...requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const { twoFactorEnabled } = req.body;
    if (typeof twoFactorEnabled !== 'boolean') return res.status(400).json({ error: 'twoFactorEnabled (boolean) is required' });

    const updateData = { twoFactorEnabled };
    if (!twoFactorEnabled) {
      updateData.twoFactorSecret = null;
      updateData.twoFactorMethod = null;
    }

    await prisma.user.update({ where: { id }, data: updateData });
    await logUserAction(req, '2FA_TOGGLED', 'USER_MANAGEMENT', id, 'User', null, { twoFactorEnabled });

    res.json({ success: true });
  } catch (err) {
    console.error('Toggle 2FA error:', err);
    res.status(500).json({ error: 'Failed to toggle 2FA' });
  }
});

// ─── Bulk Actions ─────────────────────────────────────────────────────────────
router.post('/bulk', ...requireAdmin, async (req, res) => {
  try {
    const { userIds, action } = req.body;
    if (!Array.isArray(userIds) || !userIds.length || !action) {
      return res.status(400).json({ error: 'userIds (array) and action are required' });
    }
    const validActions = ['activate', 'deactivate', 'suspend', 'reset-password'];
    if (!validActions.includes(action)) return res.status(400).json({ error: 'Invalid action' });

    let successCount = 0;
    let failedCount = 0;

    for (const uid of userIds) {
      try {
        const id = parseInt(uid);
        if (action === 'activate') {
          await prisma.user.update({ where: { id }, data: { isActive: true } });
          await logUserAction(req, 'USER_ACTIVATED', 'USER_MANAGEMENT', id, 'User');
        } else if (action === 'deactivate') {
          await prisma.user.update({ where: { id }, data: { isActive: false } });
          await logUserAction(req, 'USER_DEACTIVATED', 'USER_MANAGEMENT', id, 'User');
        } else if (action === 'suspend') {
          await prisma.user.update({ where: { id }, data: { isSuspended: true, suspendedReason: 'Bulk suspension by admin' } });
          await logUserAction(req, 'USER_SUSPENDED', 'USER_MANAGEMENT', id, 'User');
        } else if (action === 'reset-password') {
          const user = await prisma.user.findUnique({ where: { id }, select: { email: true, name: true } });
          const tempPassword = generateTempPassword();
          const hashed = await bcrypt.hash(tempPassword, 12);
          await prisma.user.update({ where: { id }, data: { password: hashed, mustChangePassword: true } });
          await logUserAction(req, 'PASSWORD_RESET_BY_ADMIN', 'USER_MANAGEMENT', id, 'User');
          if (user?.email) {
            await emailService.sendEmail({
              to: user.email,
              subject: 'Your KUN ProcureTrack Password Has Been Reset',
              html: `<p>Hello ${user.name},</p><p>Temporary password: <strong>${tempPassword}</strong></p>`,
            }).catch(() => {});
          }
        }
        successCount++;
      } catch (e) {
        console.error(`Bulk action failed for user ${uid}:`, e.message);
        failedCount++;
      }
    }

    res.json({ success: true, successCount, failedCount });
  } catch (err) {
    console.error('Bulk action error:', err);
    res.status(500).json({ error: 'Failed to execute bulk action' });
  }
});

// ─── Import Users ─────────────────────────────────────────────────────────────
router.post('/import', ...requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File is required' });
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'No worksheet found in file' });

    // Build header map from first row
    const headers = {};
    ws.getRow(1).eachCell((cell, colNumber) => {
      headers[cell.value?.toString().toLowerCase().trim()] = colNumber;
    });

    const errors = [];
    let created = 0;
    let skipped = 0;

    for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++) {
      const row = ws.getRow(rowNum);
      const get = (key) => {
        const col = headers[key];
        return col ? row.getCell(col).value?.toString().trim() : null;
      };

      const email = get('email');
      const name = get('name');
      const roleId = parseInt(get('roleid') || get('role_id') || get('role'));

      if (!email || !name || !roleId) {
        errors.push({ row: rowNum, reason: 'Missing required fields: name, email, or roleId' });
        skipped++;
        continue;
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        errors.push({ row: rowNum, reason: `Email ${email} already exists` });
        skipped++;
        continue;
      }

      const tempPassword = generateTempPassword();
      const hashed = await bcrypt.hash(tempPassword, 12);

      await prisma.user.create({
        data: {
          name, email, password: hashed, roleId,
          employeeId: get('employeeid') || get('employee_id') || null,
          jobTitle: get('jobtitle') || get('job_title') || null,
          department: get('department') || null,
          status: 'ACTIVE', isActive: true, mustChangePassword: true,
        },
      });

      await emailService.sendEmail({
        to: email,
        subject: 'Welcome to KUN ProcureTrack',
        html: `<p>Hello ${name},</p><p>Your account has been created. Temporary password: <strong>${tempPassword}</strong></p>`,
      }).catch(() => {});

      created++;
    }

    await logUserAction(req, 'BULK_IMPORT', 'USER_MANAGEMENT', null, 'User', null, { created, skipped });
    res.json({ success: true, created, skipped, errors });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Failed to import users' });
  }
});

// ─── Export Users ─────────────────────────────────────────────────────────────
router.get('/export', ...requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { role: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'KUN ProcureTrack';
    const ws = wb.addWorksheet('Users');

    // Header row
    ws.addRow(['ID', 'Name', 'Email', 'Role', 'Department', 'Job Title', 'Employee ID', 'Active', 'Suspended', '2FA', 'Last Login', 'Created At']);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1628' } };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const u of users) {
      ws.addRow([
        u.id, u.name, u.email, u.role?.name, u.department, u.jobTitle,
        u.employeeId, u.isActive ? 'Yes' : 'No', u.isSuspended ? 'Yes' : 'No',
        u.twoFactorEnabled ? 'Yes' : 'No',
        u.lastLoginDate ? new Date(u.lastLoginDate).toLocaleDateString() : '—',
        new Date(u.createdAt).toLocaleDateString(),
      ]);
    }

    ws.columns.forEach(col => { col.width = 18; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export users' });
  }
});

// ─── User Activity ────────────────────────────────────────────────────────────
router.get('/:id/activity', ...requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const page = parseInt(req.query.page || 1);
    const pageSize = 20;
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where: { userId: id } }),
    ]);
    res.json({ success: true, logs, total });
  } catch (err) {
    console.error('Activity error:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// ─── Invitations ──────────────────────────────────────────────────────────────
router.post('/invitations', ...requireAdmin, async (req, res) => {
  try {
    const { email, roleId } = req.body;
    if (!email || !roleId) return res.status(400).json({ error: 'email and roleId are required' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const invitation = await prisma.userInvitation.create({
      data: { email, roleId: parseInt(roleId), token, expiresAt, createdById: req.user.id },
    });

    const inviteLink = `${process.env.FRONTEND_URL}/signup?invitation=${token}`;
    try {
      await emailService.sendEmail({
        to: email,
        subject: 'You have been invited to KUN ProcureTrack',
        html: `<p>You have been invited to join KUN ProcureTrack.</p><p><a href="${inviteLink}">Click here to accept the invitation</a></p><p>This link expires in 48 hours.</p>`,
      });
    } catch (e) { console.error('Invitation email failed:', e.message); }

    await logUserAction(req, 'INVITATION_SENT', 'USER_MANAGEMENT', invitation.id, 'UserInvitation', null, { email, roleId });
    res.json({ success: true, invitation, inviteLink });
  } catch (err) {
    console.error('Create invitation error:', err);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

router.get('/invitations', ...requireAdmin, async (req, res) => {
  try {
    const invitations = await prisma.userInvitation.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { name: true, email: true } } },
    });
    const now = new Date();
    const withStatus = invitations.map(inv => ({
      ...inv,
      status: inv.usedAt ? 'used' : new Date(inv.expiresAt) < now ? 'expired' : 'pending',
    }));
    res.json({ success: true, invitations: withStatus });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

router.delete('/invitations/:id', ...requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    await prisma.userInvitation.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke invitation' });
  }
});

// ─── Audit Logs ───────────────────────────────────────────────────────────────
router.get('/audit-logs', ...requireAdmin, async (req, res) => {
  try {
    const { userId, action, module, dateFrom, dateTo, page = 1 } = req.query;
    const pageSize = 50;
    const where = {};
    if (userId) where.userId = parseInt(userId);
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (module) where.module = module;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ success: true, logs, total });
  } catch (err) {
    console.error('Audit logs error:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

router.get('/audit-logs/export', ...requireAdmin, async (req, res) => {
  try {
    const { userId, action, module, dateFrom, dateTo } = req.query;
    const where = {};
    if (userId) where.userId = parseInt(userId);
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (module) where.module = module;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, email: true } } },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'KUN ProcureTrack';
    const ws = wb.addWorksheet('Audit Log');
    ws.addRow(['Timestamp', 'User Name', 'User Email', 'Action', 'Module', 'Entity', 'Entity ID', 'IP Address', 'User Agent']);
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1628' } };

    for (const log of logs) {
      ws.addRow([
        new Date(log.createdAt).toLocaleString(),
        log.user?.name || 'System',
        log.user?.email || '—',
        log.action,
        log.module || '—',
        log.entity || '—',
        log.entityId || '—',
        log.ipAddress || '—',
        log.userAgent || '—',
      ]);
    }
    ws.columns.forEach(col => { col.width = 20; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Audit log export error:', err);
    res.status(500).json({ error: 'Failed to export audit log' });
  }
});

export default router;
