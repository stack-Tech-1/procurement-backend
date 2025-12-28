import express from "express";
import fetch from "node-fetch";
import { register, login } from "../controllers/authController.js";
import { getPendingUsers, approveUser } from "../controllers/authController.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/pending", getPendingUsers);
router.put("/approve/:id", approveUser);


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



