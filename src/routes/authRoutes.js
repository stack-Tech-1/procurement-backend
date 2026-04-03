import express from "express";
import { register, login, getPendingUsers, approveUser, changePassword } from "../controllers/authController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import prisma from "../config/prismaClient.js";

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

  export default router;



