import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/prismaClient.js";

// --- SECURITY CONSTANTS ---
const ADMIN_TOKEN = process.env.ADMIN_REGISTRATION_TOKEN;
const STAFF_TOKEN = process.env.STAFF_REGISTRATION_TOKEN;


/**
 * Register new user
 */
export const register = async (req, res) => {
  try {
    console.log("Incoming registration request:", req.body);
    // Destructure accessCode and potentially vendorType
    const { name, email, password, accessCode, vendorType } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let roleId = 3; // Default Vendor
    let status = "ACTIVE";
    const code = accessCode?.trim();

    if (code === ADMIN_TOKEN) {
      roleId = 1;
      status = "ACTIVE";
      console.log("✅ Admin registration detected");
    } else if (code === STAFF_TOKEN) {
      roleId = 2;
      status = "PENDING";
      console.log("✅ Staff registration detected");
    } else {
      console.log("ℹ️ Vendor registration (no valid access code)");
    }

    // ✅ Create user first
    const user = await prisma.user.create({
      data: { 
        name: name || "Unnamed User",
        email,
        password: hashedPassword,
        roleId,
        status,
      },
    });

    // ✅ If vendor, create linked vendor profile
    if (roleId === 3) {
      const vendor = await prisma.vendor.create({
        data: {
          name: name || "Unnamed Vendor",
          contactEmail: email,
          status: "NEW",
          // 🛑 FIX: Add the missing vendorType argument.
          // Assuming 'Goods' is a safe default or you pass it from the request body.
          vendorType: vendorType || "Goods", 
          user: { connect: { id: user.id } }, // ✅ connect vendor to user
        },
      });
      console.log("✅ Vendor profile created and linked to user ID:", user.id);
    }

    // ✅ Token
    const token =
      status === "ACTIVE"
        ? jwt.sign(
            { id: user.id, roleId: user.roleId, status: user.status },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
          )
        : null;

    res.status(201).json({
      message:
        status === "PENDING"
          ? "Registration successful. Awaiting admin approval."
          : "Registration successful.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.roleId,
        status: user.status,
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

    // create token
    const token = jwt.sign(
      { id: user.id, roleId: user.roleId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        roleId: user.roleId,
        status: user.status 
      },
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
