import prisma from "../config/prismaClient.js";
import bcrypt from "bcrypt";

const ADMIN_CODE = process.env.ADMIN_REGISTRATION_TOKEN;
const STAFF_CODE = process.env.STAFF_REGISTRATION_TOKEN;


// -----------------------------
// CREATE USER
// -----------------------------
export const createUser = async (req, res) => {
  try {
    const { name, email, password, roleId, accessCode, intendedRoleName } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "User with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let roleName = "Vendor";
    let status = "ACTIVE";

    if (accessCode === ADMIN_CODE) {
      roleName = "Admin";
    } else if (accessCode === STAFF_CODE) {
      roleName = intendedRoleName || "Procurement";
      status = "PENDING";
    } else if (roleId) {
      const role = await prisma.role.findUnique({ where: { id: Number(roleId) } });
      if (!role) return res.status(400).json({ error: "Invalid roleId." });
      roleName = role.name;
    }

    const targetRole = await prisma.role.findUnique({ where: { name: roleName } });
    if (!targetRole) {
      return res.status(400).json({ error: `Role "${roleName}" not found in the database.` });
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        roleId: targetRole.id,
        status,
        isActive: status === "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        status: true,
      },
    });

    res.status(201).json({
      message:
        status === "PENDING"
          ? "User created successfully and is pending admin approval."
          : "User created successfully.",
      user,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
};

// -----------------------------
// GET USERS
// -----------------------------
export const getUsers = async (req, res) => {
  try {
    const { status } = req.query;

    // Optional ?status=PENDING or ?status=ACTIVE filter
    const whereClause = status ? { status } : {};

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        isActive: true,
        role: { select: { name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// -----------------------------
// APPROVE / UPDATE USER
// -----------------------------
//if (req.user.roleId !== 1) { // assuming 1 = Admin in your Roles table
  //return res.status(403).json({ error: "Only Admins can approve users." });
//}


export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, roleId, isActive } = req.body;

    const user = await prisma.user.findUnique({ where: { id: Number(id) } });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // When admin approves a pending user
    let updatedData = {};
    if (status === "ACTIVE" && user.status === "PENDING") {
      updatedData.status = "ACTIVE";
      updatedData.isActive = true;
    }

    // Allow updating role if needed
    if (roleId) updatedData.roleId = Number(roleId);

    // Explicit toggle for isActive (suspend/reactivate)
    if (typeof isActive === "boolean") updatedData.isActive = isActive;

    const updatedUser = await prisma.user.update({
      where: { id: Number(id) },
      data: updatedData,
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        status: true,
        isActive: true,
      },
    });

    res.json({
      message:
        status === "ACTIVE" && user.status === "PENDING"
          ? "User approved successfully."
          : "User updated successfully.",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
};
