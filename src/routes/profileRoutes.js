import express from 'express';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import prisma from '../config/prismaClient.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { logAction } from '../services/auditService.js';

const router = express.Router();

// ── Avatar upload (disk storage) ────────────────────────────────────────────
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/avatars';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `avatar-${req.user.id}-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only jpg, png, and webp images are allowed.'));
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function validatePasswordStrength(password) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function calcProfileCompletion(user) {
  const fields = [
    user.name,
    user.employeeId,
    user.jobTitle,
    user.department,
    user.phoneNumber,
    user.avatarUrl,
    user.twoFactorEnabled,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}

const profileSelect = {
  id: true,
  name: true,
  email: true,
  roleId: true,
  employeeId: true,
  jobTitle: true,
  department: true,
  phoneNumber: true,
  avatarUrl: true,
  twoFactorEnabled: true,
  twoFactorMethod: true,
  lastPasswordChange: true,
  lastLoginDate: true,
  createdAt: true,
  isActive: true,
  isSuspended: true,
  mustChangePassword: true,
  failedLoginAttempts: true,
  preferredLanguage: true,
  preferredTheme: true,
  notificationPrefs: true,
  timezone: true,
  profileCompletedAt: true,
  accessScope: true,
};

// ── GET /api/profile/me ──────────────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        ...profileSelect,
        role: { select: { id: true, name: true } },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, action: true, module: true, createdAt: true, ipAddress: true },
        },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const profileCompletion = calcProfileCompletion(user);
    const missing = [];
    if (!user.employeeId) missing.push('Add employee ID');
    if (!user.jobTitle) missing.push('Add job title');
    if (!user.department) missing.push('Add department');
    if (!user.phoneNumber) missing.push('Add phone number');
    if (!user.avatarUrl) missing.push('Upload profile photo');
    if (!user.twoFactorEnabled) missing.push('Enable two-factor authentication');

    res.json({ ...user, profileCompletion, missing });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// ── PUT /api/profile/me ──────────────────────────────────────────────────────
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const { name, jobTitle, phoneNumber, preferredLanguage, preferredTheme, timezone, notificationPrefs } = req.body;
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(name !== undefined && { name }),
        ...(jobTitle !== undefined && { jobTitle }),
        ...(phoneNumber !== undefined && { phoneNumber }),
        ...(preferredLanguage !== undefined && { preferredLanguage }),
        ...(preferredTheme !== undefined && { preferredTheme }),
        ...(timezone !== undefined && { timezone }),
        ...(notificationPrefs !== undefined && { notificationPrefs }),
      },
      select: profileSelect,
    });
    await logAction({ userId: req.user.id, action: 'PROFILE_UPDATED', module: 'PROFILE', ipAddress: req.ipAddress, userAgent: req.userAgent });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── POST /api/profile/avatar ─────────────────────────────────────────────────
router.post('/avatar', authenticateToken, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Delete old avatar file if local
    const existing = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatarUrl: true } });
    if (existing?.avatarUrl?.startsWith('uploads/')) {
      fs.unlink(existing.avatarUrl, () => {});
    }

    const avatarUrl = req.file.path.replace(/\\/g, '/');
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl } });
    res.json({ avatarUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// ── DELETE /api/profile/avatar ───────────────────────────────────────────────
router.delete('/avatar', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatarUrl: true } });
    if (user?.avatarUrl?.startsWith('uploads/')) {
      fs.unlink(user.avatarUrl, () => {});
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: null } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove avatar' });
  }
});

// ── POST /api/profile/change-password ────────────────────────────────────────
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All password fields are required.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match.' });
    }
    if (!validatePasswordStrength(newPassword)) {
      return res.status(400).json({ error: 'Password must be 8+ characters with uppercase, lowercase, number, and special character.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });

    const sameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (sameAsCurrent) return res.status(400).json({ error: 'New password cannot be the same as the current password.' });

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashed, mustChangePassword: false, lastPasswordChange: new Date() },
    });
    await logAction({ userId: req.user.id, action: 'PASSWORD_CHANGED', module: 'PROFILE', ipAddress: req.ipAddress, userAgent: req.userAgent });
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ── GET /api/profile/2fa/setup ───────────────────────────────────────────────
router.get('/2fa/setup', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, twoFactorEnabled: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.twoFactorEnabled) return res.status(400).json({ error: '2FA is already enabled.' });

    const appName = process.env.APP_NAME || 'KUN ProcureTrack';
    const secret = speakeasy.generateSecret({
      name: `${appName} (${user.email})`,
      length: 20,
    });

    // Temporarily store secret (not enabled until verified)
    await prisma.user.update({
      where: { id: req.user.id },
      data: { twoFactorSecret: secret.base32, twoFactorEnabled: false },
    });

    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32,
      qrCodeDataUrl,
      manualEntryKey: secret.base32,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to setup 2FA' });
  }
});

// ── POST /api/profile/2fa/verify ─────────────────────────────────────────────
router.post('/2fa/verify', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Verification code is required.' });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user?.twoFactorSecret) return res.status(400).json({ error: 'Please initiate 2FA setup first.' });
    if (user.twoFactorEnabled) return res.status(400).json({ error: '2FA is already enabled.' });

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: token.toString().replace(/\s/g, ''),
      window: 2,
    });
    if (!verified) return res.status(400).json({ error: 'Invalid verification code. Please try again.' });

    // Generate 8 backup codes
    const plainCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Hash and store backup codes
    await prisma.backupCode.deleteMany({ where: { userId: req.user.id } });
    await prisma.backupCode.createMany({
      data: plainCodes.map(code => ({
        userId: req.user.id,
        codeHash: bcrypt.hashSync(code, 10),
      })),
    });

    // Enable 2FA
    await prisma.user.update({
      where: { id: req.user.id },
      data: { twoFactorEnabled: true, twoFactorMethod: 'AUTHENTICATOR' },
    });

    await logAction({ userId: req.user.id, action: '2FA_ENABLED', module: 'PROFILE', ipAddress: req.ipAddress, userAgent: req.userAgent });
    res.json({ success: true, backupCodes: plainCodes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify 2FA code' });
  }
});

// ── POST /api/profile/2fa/disable ────────────────────────────────────────────
router.post('/2fa/disable', authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required to disable 2FA.' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Incorrect password.' });

    await prisma.backupCode.deleteMany({ where: { userId: req.user.id } });
    await prisma.user.update({
      where: { id: req.user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorMethod: null },
    });

    await logAction({ userId: req.user.id, action: '2FA_DISABLED', module: 'PROFILE', ipAddress: req.ipAddress, userAgent: req.userAgent });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// ── POST /api/profile/2fa/backup-code (public — used during login) ────────────
router.post('/2fa/backup-code', async (req, res) => {
  try {
    const { email, password, backupCode } = req.body;
    if (!email || !password || !backupCode) {
      return res.status(400).json({ error: 'Email, password and backup code are required.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: 'Invalid credentials.' });

    const pwValid = await bcrypt.compare(password, user.password);
    if (!pwValid) return res.status(400).json({ error: 'Invalid credentials.' });

    const codes = await prisma.backupCode.findMany({
      where: { userId: user.id, usedAt: null },
    });

    let matchedCode = null;
    for (const c of codes) {
      const match = await bcrypt.compare(backupCode.replace(/\s/g, '').toUpperCase(), c.codeHash);
      if (match) { matchedCode = c; break; }
    }

    if (!matchedCode) return res.status(400).json({ error: 'Invalid or already used backup code.' });

    await prisma.backupCode.update({ where: { id: matchedCode.id }, data: { usedAt: new Date() } });
    await logAction({ userId: user.id, action: 'BACKUP_CODE_USED', module: 'AUTH', ipAddress: req.headers['x-forwarded-for'] || req.connection?.remoteAddress });

    const jwt = await import('jsonwebtoken');
    const token = jwt.default.sign({ id: user.id, roleId: user.roleId }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const { password: _, twoFactorSecret: __, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process backup code' });
  }
});

// ── GET /api/profile/2fa/backup-codes/count ──────────────────────────────────
router.get('/2fa/backup-codes/count', authenticateToken, async (req, res) => {
  try {
    const count = await prisma.backupCode.count({ where: { userId: req.user.id, usedAt: null } });
    res.json({ remaining: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get backup code count' });
  }
});

// ── PUT /api/profile/notifications ───────────────────────────────────────────
router.put('/notifications', authenticateToken, async (req, res) => {
  try {
    const prefs = req.body;
    await prisma.user.update({
      where: { id: req.user.id },
      data: { notificationPrefs: prefs },
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

export default router;