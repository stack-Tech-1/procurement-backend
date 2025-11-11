import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/prismaClient.js";

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
    const { name, email, password, accessCode, vendorType, department, jobTitle } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered." });
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
          companyLegalName: name || "Unnamed Vendor",
          contactEmail: email,
          vendorType: vendorType || "Goods",
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

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: "Invalid email or password" });

    // NEW CHECK: Prevent inactive users (Pending Staff) from logging in
    if (!user.isActive) {
        return res.status(403).json({ error: "Account is pending admin approval." });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(400).json({ error: "Invalid email or password" });

    // ✅ UPDATE: Set lastLoginDate before generating token
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { 
        lastLoginDate: new Date() 
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
        lastLoginDate: true
      }
    });

    // create token
    const token = jwt.sign(
      { id: user.id, roleId: user.roleId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: updatedUser
    });
    
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: "Failed to login" });
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

    res.json({
      message: `${approvedUser.name} has been approved successfully.`,
      user: approvedUser,
    });
  } catch (error) {
    console.error("Error approving user:", error);
    res.status(500).json({ error: "Failed to approve user" });
  }
};
