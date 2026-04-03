import express from "express";
import { register, login, getPendingUsers, approveUser, changePassword } from "../controllers/authController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import prisma from "../config/prismaClient.js";
import jwt from "jsonwebtoken";
import speakeasy from "speakeasy";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/pending", getPendingUsers);
router.put("/approve/:id", approveUser);

// Change password (forced after admin reset)
router.post("/change-password", authenticateToken, changePassword);

// Validate invitation token (public endpoint)
router.get("/invitation/:token", async (req, res) => {
  try {
    const inv = await prisma.userInvitation.findUnique({ where: { token: req.params.token } });
    if (!inv || inv.usedAt || new Date(inv.expiresAt) < new Date()) {
      return res.status(400).json({ error: "Invalid or expired invitation link." });
    }
    const role = await prisma.role.findUnique({ where: { id: inv.roleId } });
    res.json({ success: true, email: inv.email, roleId: inv.roleId, roleName: role?.name });
  } catch (err) {
    res.status(500).json({ error: "Failed to validate invitation" });
  }
});

// Mark invitation as used after successful registration
router.patch("/invitation/:token/use", async (req, res) => {
  try {
    await prisma.userInvitation.updateMany({
      where: { token: req.params.token, usedAt: null },
      data: { usedAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark invitation as used" });
  }
});


// Add this route to your backend auth routes
// Update your verify-captcha route for v2
router.post('/verify-captcha', async (req, res) => {
  try {
    const { captchaToken } = req.body;
    
    console.log("Verifying CAPTCHA token:", captchaToken ? "Token exists" : "No token");
    
    // Development bypass (temporary)
    if (process.env.NODE_ENV === 'development') {
      if (captchaToken === 'test-token-localhost' || 
          captchaToken.includes('test') ||
          captchaToken === 'development-bypass') {
        console.log("Development: CAPTCHA bypassed");
        return res.json({ 
          success: true, 
          score: 0.9,
          message: 'Development bypass' 
        });
      }
    }
    
    // Real verification
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: captchaToken
      })
    });
    
    const data = await response.json();
    console.log("Google CAPTCHA response:", data);
    
    // v2 doesn't have score, just success boolean
    if (data.success) {
      res.json({ 
        success: true,
        hostname: data.hostname,
        challenge_ts: data.challenge_ts 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'CAPTCHA verification failed',
        errors: data['error-codes'] || []
      });
    }
  } catch (error) {
    console.error('CAPTCHA verification error:', error);
    res.status(500).json({ 
      error: 'CAPTCHA verification error',
      message: error.message 
    });
  }
});

// ── POST /api/auth/2fa/verify-login ─────────────────────────────────────────
// Accepts tempToken + 6-digit TOTP code, returns full JWT
router.post('/2fa/verify-login', async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) return res.status(400).json({ error: 'tempToken and code are required.' });

    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired challenge token.' });
    }

    if (decoded.type !== '2fa_challenge') {
      return res.status(401).json({ error: 'Invalid challenge token.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, email: true, roleId: true, status: true, isActive: true,
        employeeId: true, jobTitle: true, department: true, lastLoginDate: true,
        mustChangePassword: true, avatarUrl: true, preferredLanguage: true, preferredTheme: true,
        twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ error: 'User not found or 2FA not configured.' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code.toString().replace(/\s/g, ''),
      window: 2,
    });

    if (!verified) {
      return res.status(401).json({ error: 'Invalid 2FA code. Please try again.' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginDate: new Date() } });

    const fullToken = jwt.sign({ id: user.id, roleId: user.roleId }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const { twoFactorSecret: _, ...safeUser } = user;
    res.json({ token: fullToken, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify 2FA login' });
  }
});

export default router;



