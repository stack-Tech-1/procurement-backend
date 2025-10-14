// src/controllers/adminController.js
import prisma from "../config/prismaClient.js";

/**
 * Approve a pending user.
 * PUT /api/admin/approve/:id
 * Body: { newRoleName?: "Procurement" }
 */
export const approveUser = async (req, res) => {
  try {
    const adminUser = req.user;
    if (!adminUser) return res.status(401).json({ error: "Unauthorized" });

    // Optional: verify admin role using roleId or fetch role name
    // (Assumes authorizeRole middleware already restricts to Admins)

    const { id } = req.params;
    const { newRoleName } = req.body;

    // Get user
    const user = await prisma.user.findUnique({ where: { id: Number(id) } });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.status !== "PENDING") {
      return res.status(400).json({ error: "User is not pending approval" });
    }

    let roleId = user.roleId;

    if (newRoleName) {
      const role = await prisma.role.findUnique({ where: { name: newRoleName } });
      if (!role) return res.status(400).json({ error: `Role "${newRoleName}" not found` });
      roleId = role.id;
    }

    const updated = await prisma.user.update({
      where: { id: Number(id) },
      data: {
        status: "ACTIVE",
        isActive: true,
        roleId,
      },
      select: { id: true, name: true, email: true, roleId: true, status: true },
    });

    res.json({ message: "User approved", user: updated });
  } catch (err) {
    console.error("Error approving user:", err);
    res.status(500).json({ error: "Failed to approve user" });
  }
};
