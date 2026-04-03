import express from 'express';
import prisma from '../../config/prismaClient.js';
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { authorizeRole } from '../../middleware/roleMiddleware.js';
import { logAction } from '../../services/auditService.js';
import { clearSettingsCache } from '../../utils/getSystemSetting.js';

const router = express.Router();
const requireAdmin = [authenticateToken, authorizeRole([1])];

const DEFAULT_SETTINGS = [
  // SECURITY
  { key: 'session_timeout_hours', value: '12', category: 'SECURITY', description: 'Auto-logout after X hours of inactivity' },
  { key: 'max_login_attempts', value: '10', category: 'SECURITY', description: 'Lock account after X failed login attempts' },
  { key: 'lockout_duration_minutes', value: '15', category: 'SECURITY', description: 'Account lockout duration in minutes' },
  { key: 'password_expiry_days', value: '90', category: 'SECURITY', description: 'Force password reset after X days' },
  { key: 'require_2fa_admin', value: 'true', category: 'SECURITY', description: 'Require 2FA for Admin accounts' },
  { key: 'require_2fa_manager', value: 'true', category: 'SECURITY', description: 'Require 2FA for Manager accounts' },
  { key: 'inactivity_lockout_days', value: '60', category: 'SECURITY', description: 'Auto-deactivate accounts inactive for X days' },
  // WORKFLOW
  { key: 'po_approval_threshold_low', value: '50000', category: 'WORKFLOW', description: 'PO value below this requires only Officer approval (SAR)' },
  { key: 'po_approval_threshold_high', value: '500000', category: 'WORKFLOW', description: 'PO value above this requires Director approval (SAR)' },
  { key: 'rfq_min_vendors', value: '3', category: 'WORKFLOW', description: 'Minimum vendors required per RFQ' },
  { key: 'vendor_renewal_months', value: '6', category: 'WORKFLOW', description: 'Vendor qualification re-evaluation period in months' },
  { key: 'task_escalation_days', value: '1', category: 'WORKFLOW', description: 'Auto-escalate tasks overdue by X days' },
  // DOCUMENTS
  { key: 'doc_alert_days_critical', value: '7', category: 'DOCUMENTS', description: 'Alert when document expires within X days (critical)' },
  { key: 'doc_alert_days_warning', value: '30', category: 'DOCUMENTS', description: 'Alert when document expires within X days (warning)' },
  { key: 'doc_alert_days_notice', value: '60', category: 'DOCUMENTS', description: 'Alert when document expires within X days (notice)' },
  // NOTIFICATIONS
  { key: 'weekly_report_day', value: '1', category: 'NOTIFICATIONS', description: 'Day to send weekly report (1=Monday, 7=Sunday)' },
  { key: 'weekly_report_hour', value: '8', category: 'NOTIFICATIONS', description: 'Hour to send weekly report (24h format)' },
  { key: 'daily_digest_enabled', value: 'true', category: 'NOTIFICATIONS', description: 'Send daily digest emails to managers' },
  // SYSTEM
  { key: 'system_name', value: 'KUN ProcureTrack', category: 'SYSTEM', description: 'System display name' },
  { key: 'default_currency', value: 'SAR', category: 'SYSTEM', description: 'Default currency for all transactions' },
  { key: 'default_language', value: 'en', category: 'SYSTEM', description: 'Default system language' },
  { key: 'default_timezone', value: 'Asia/Riyadh', category: 'SYSTEM', description: 'Default system timezone' },
  { key: 'pagination_page_size', value: '20', category: 'SYSTEM', description: 'Default number of rows per page in tables' },
  { key: 'file_upload_max_mb', value: '5', category: 'SYSTEM', description: 'Maximum file upload size in MB' },
  { key: 'allowed_file_types', value: 'pdf,jpg,jpeg,png,xlsx,docx', category: 'SYSTEM', description: 'Allowed file upload extensions' },
];

async function seedDefaultsIfEmpty() {
  const count = await prisma.systemSetting.count();
  if (count === 0) {
    await prisma.systemSetting.createMany({ data: DEFAULT_SETTINGS });
  }
}

// ── GET /api/admin/settings ──────────────────────────────────────────────────
router.get('/', ...requireAdmin, async (req, res) => {
  try {
    await seedDefaultsIfEmpty();
    const settings = await prisma.systemSetting.findMany({
      include: { updatedBy: { select: { id: true, name: true } } },
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });

    // Group by category
    const grouped = {};
    for (const s of settings) {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    }
    res.json({ settings, grouped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// ── GET /api/admin/settings/:key ─────────────────────────────────────────────
router.get('/:key', ...requireAdmin, async (req, res) => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: req.params.key } });
    if (!setting) return res.status(404).json({ error: 'Setting not found' });
    res.json(setting);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get setting' });
  }
});

// ── PUT /api/admin/settings ──────────────────────────────────────────────────
router.put('/', ...requireAdmin, async (req, res) => {
  try {
    const updates = req.body; // Array of { key, value } or single object
    const list = Array.isArray(updates) ? updates : [updates];

    const changed = [];
    for (const { key, value } of list) {
      if (!key || value === undefined) continue;
      const existing = await prisma.systemSetting.findUnique({ where: { key } });
      const oldValue = existing?.value;
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value), updatedById: req.user.id },
        create: {
          key,
          value: String(value),
          category: existing?.category || 'SYSTEM',
          description: existing?.description,
          updatedById: req.user.id,
        },
      });
      if (oldValue !== String(value)) {
        changed.push({ key, oldValue, newValue: String(value) });
      }
    }

    if (changed.length > 0) {
      await logAction({
        userId: req.user.id,
        action: 'SETTINGS_UPDATED',
        module: 'SYSTEM',
        ipAddress: req.ipAddress,
        userAgent: req.userAgent,
        newValues: { changes: changed },
      });
    }

    clearSettingsCache();

    const all = await prisma.systemSetting.findMany({
      include: { updatedBy: { select: { id: true, name: true } } },
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
    res.json({ success: true, settings: all });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ── POST /api/admin/settings/clear-cache ─────────────────────────────────────
router.post('/clear-cache', ...requireAdmin, (req, res) => {
  clearSettingsCache();
  res.json({ success: true, message: 'Settings cache cleared.' });
});

export default router;