import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/prismaClient.js";
import { notificationService } from '../services/notificationService.js';
import { emailService } from '../services/emailService.js';
import { accountActivatedTemplate } from '../services/emailTemplates.js';
import { logAction } from '../services/auditService.js';

const VALID_VENDOR_TYPES = ["Contractor", "Supplier", "Manufacturer", "Distributor", "Service Provider", "Consultant", "Subcontractor"];
const VALID_DEPARTMENTS = ["Procurement", "Contracts", "Finance", "Technical", "Admin"];

function validatePasswordStrength(password) {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return false;
  return true;
}

async function verifyRecaptcha(token) {
  const params = new URLSearchParams();
  params.append("secret", process.env.RECAPTCHA_SECRET_KEY);
  params.append("response", token);

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    body: params,
  });
  const data = await response.json();
  return data.success === true && (data.score === undefined || data.score >= 0.5);
}

const REGISTRATION_TOKENS = {
  EXECUTIVE: process.env.EXECUTIVE_REGISTRATION_TOKEN,
  PROCUREMENT_MANAGER: process.env.PROCUREMENT_MANAGER_TOKEN,
  PROCUREMENT_OFFICER: process.env.PROCUREMENT_OFFICER_TOKEN,
  VENDOR: null // No token needed for vendors
};


/**
 * Register new user
 */
export const register = async (req, res) => {
  try {
    console.log("Incoming registration request:", req.body);
    const { name, email, password, accessCode, vendorType, companyName, crNumber, employeeId, department, jobTitle, captchaToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    if (!validatePasswordStrength(password)) {
      return res.status(400).json({ error: "Password does not meet requirements. Must be at least 8 characters with uppercase, lowercase, number, and special character." });
    }

    if (!captchaToken) {
      return res.status(400).json({ error: "CAPTCHA verification failed. Please try again." });
    }
    const captchaPassed = await verifyRecaptcha(captchaToken);
    if (!captchaPassed) {
      return res.status(400).json({ error: "CAPTCHA verification failed. Please try again." });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: "This email is already registered. Please login instead." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let roleId = 4; // Default Vendor
    let status = "ACTIVE";
    const code = accessCode?.trim();

    // Enhanced role assignment with new tokens
    if (code === REGISTRATION_TOKENS.EXECUTIVE) {
      roleId = 1; // Executive
      status = "ACTIVE";
      console.log("✅ Executive registration detected");
    } else if (code === REGISTRATION_TOKENS.PROCUREMENT_MANAGER) {
      roleId = 2; // Procurement Manager
      status = "ACTIVE";
      console.log("✅ Procurement Manager registration detected");
    } else if (code === REGISTRATION_TOKENS.PROCUREMENT_OFFICER) {
      roleId = 3; // Procurement Officer
      status = "PENDING"; // Officers need approval
      console.log("✅ Procurement Officer registration detected");
    } else if (!code) {
      roleId = 4; // Vendor (no token needed)
      status = "ACTIVE";
      console.log("ℹ️ Vendor registration (no access code)");
    } else {
      return res.status(400).json({ error: "Invalid access code." });
    }

    // Vendor-specific validation
    if (roleId === 4) {
      if (!companyName || !companyName.trim()) {
        return res.status(400).json({ error: "Company name is required for vendor registration." });
      }
      if (!crNumber || !crNumber.trim()) {
        return res.status(400).json({ error: "CR number is required for vendor registration." });
      }
      if (!vendorType || !VALID_VENDOR_TYPES.includes(vendorType)) {
        return res.status(400).json({ error: `Vendor type must be one of: ${VALID_VENDOR_TYPES.join(", ")}.` });
      }
    }

    // Staff-specific validation
    if (roleId !== 4) {
      if (!employeeId || !employeeId.trim()) {
        return res.status(400).json({ error: "Employee ID is required for staff registration." });
      }
      if (!jobTitle || !jobTitle.trim()) {
        return res.status(400).json({ error: "Job title is required for staff registration." });
      }
      if (!department || !VALID_DEPARTMENTS.includes(department)) {
        return res.status(400).json({ error: `Department must be one of: ${VALID_DEPARTMENTS.join(", ")}.` });
      }
    }

    // Create user with additional fields
    const user = await prisma.user.create({
      data: { 
        name: name || "Unnamed User",
        email,
        password: hashedPassword,
        roleId,
        status,
        department: department || null,
        jobTitle: jobTitle || null
      },
    });

    // Create vendor profile only for vendor role
    if (roleId === 4) {
      const vendor = await prisma.vendor.create({
        data: {
          companyLegalName: companyName.trim(),
          contactEmail: email,
          vendorType: vendorType,
          crNumber: crNumber.trim(),
          status: "NEW",
          user: { connect: { id: user.id } },
        },
      });
      console.log("✅ Vendor profile created and linked to user ID:", user.id);
    }

    // Generate token
    const token = status === "ACTIVE"
      ? jwt.sign(
          { id: user.id, roleId: user.roleId, status: user.status },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        )
      : null;

    res.status(201).json({
      message: status === "PENDING"
        ? "Registration successful. Awaiting admin approval."
        : "Registration successful.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.roleId,
        status: user.status,
        department: user.department,
        jobTitle: user.jobTitle
      },
      token,
    });
  } catch (error) {
    console.error("❌ Error registering user:", error);
    res.status(500).json({ error: "Failed to register user" });
  }
};


/**
 * Login user
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.connection?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: "Invalid email or password" });

    // Prevent inactive / pending users from logging in
    if (!user.isActive) {
      return res.status(403).json({ error: "Account is pending admin approval." });
    }

    // Check brute-force lock
    if (user.failedLoginAttempts >= 10 && user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return res.status(403).json({ error: "Account locked due to too many failed attempts. Try again in 15 minutes." });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      const newCount = (user.failedLoginAttempts || 0) + 1;
      const lockData = newCount >= 10 ? { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } : {};
      await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: newCount, ...lockData } });
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // Successful login — reset counters and update lastLoginDate
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginDate: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        status: true,
        isActive: true,
        employeeId: true,
        jobTitle: true,
        department: true,
        lastLoginDate: true,
        mustChangePassword: true,
      },
    });

    // Audit login
    await logAction({ userId: user.id, action: 'LOGIN', module: 'AUTH', ipAddress, userAgent });

    const token = jwt.sign(
      { id: user.id, roleId: user.roleId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: updatedUser,
    });

  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: "Failed to login" });
  }
};

/**
 * Change password (used for forced password change after admin reset)
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword are required" });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ error: "Current password is incorrect" });

    if (!validatePasswordStrength(newPassword)) {
      return res.status(400).json({ error: "Password does not meet requirements. Must be at least 8 characters with uppercase, lowercase, number, and special character." });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashed, mustChangePassword: false, lastPasswordChange: new Date() },
    });

    await logAction({
      userId: req.user.id,
      action: 'PASSWORD_CHANGED',
      module: 'AUTH',
      ipAddress: req.ipAddress,
      userAgent: req.userAgent,
    });

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
};


/**
 * Get all pending users (for admin review)
 */
export const getPendingUsers = async (req, res) => {
  try {
    const pendingUsers = await prisma.user.findMany({
      where: { status: "PENDING" },
      include: { role: true }, // include role details
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json(pendingUsers);
  } catch (error) {
    console.error("Error fetching pending users:", error);
    res.status(500).json({ error: "Failed to fetch pending users" });
  }
};

/**
 * Approve a pending user
 */
export const approveUser = async (req, res) => {
  try {
    const { id } = req.params;

    // find the user
    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.status !== "PENDING") {
      return res.status(400).json({ error: "User is not pending approval" });
    }

    // update user to ACTIVE
    const approvedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { status: "ACTIVE" },
    });

    // Notify and email the approved user
    try {
      await notificationService.createNotification({
        userId: approvedUser.id,
        title: 'Account Activated',
        body: 'Your procurement system account has been approved and is now active. You can now log in.',
        type: 'INFO',
        priority: 'HIGH',
        actionUrl: '/dashboard'
      });
      if (approvedUser.email) {
        await emailService.sendEmail({
          to: approvedUser.email,
          subject: 'Your Account is Now Active — Procurement ERP',
          html: accountActivatedTemplate({
            userName: approvedUser.name || 'User',
            role: approvedUser.roleId === 3 ? 'Procurement Officer' : approvedUser.roleId === 2 ? 'Procurement Manager' : 'Staff',
            systemUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
          })
        });
      }
    } catch (notifErr) {
      console.error('Failed to send account activation notification:', notifErr.message);
    }

    res.json({
      message: `${approvedUser.name} has been approved successfully.`,
      user: approvedUser,
    });
  } catch (error) {
    console.error("Error approving user:", error);
    res.status(500).json({ error: "Failed to approve user" });
  }
};
