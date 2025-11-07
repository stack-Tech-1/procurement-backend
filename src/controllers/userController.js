import prisma from "../config/prismaClient.js";
import bcrypt from "bcrypt";

const ADMIN_CODE = process.env.ADMIN_REGISTRATION_TOKEN;
const STAFF_CODE = process.env.STAFF_REGISTRATION_TOKEN;


// -----------------------------
// CREATE USER
// -----------------------------
export const createUser = async (req, res) => {
  try {
      const { 
          name, 
          email, 
          password, 
          roleId, 
          accessCode, 
          intendedRoleName,
          // ✅ NEW FIELDS FOR STAFF/ADMIN
          employeeId,
          jobTitle,
          department,
      } = req.body;

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
      let isStaff = false; // Flag to check if we need to validate staff-specific fields

      if (accessCode === ADMIN_CODE) {
          roleName = "Admin";
          isStaff = true;
      } else if (accessCode === STAFF_CODE) {
          roleName = intendedRoleName || "Procurement";
          status = "PENDING";
          isStaff = true;
      } else if (roleId) {
          const role = await prisma.role.findUnique({ where: { id: Number(roleId) } });
          if (!role) return res.status(400).json({ error: "Invalid roleId." });
          roleName = role.name;
          // Assuming any non-Vendor role is considered staff for field requirements
          if (roleName !== 'Vendor') isStaff = true;
      }

      // ✅ NEW: Validation for mandatory staff fields
      if (isStaff && (!employeeId || !jobTitle || !department)) {
          return res.status(400).json({ error: "Employee ID, Job Title, and Department are required for staff registration." });
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
              // ✅ NEW FIELDS
              employeeId: employeeId || null, 
              jobTitle: jobTitle || null,
              department: department || null,
          },
          select: {
              id: true,
              name: true,
              email: true,
              roleId: true,
              status: true,
              employeeId: true, // Return new fields
              jobTitle: true,
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
      // Handle unique constraint violation for email or employeeId
      if (error.code === 'P2002') {
           const target = error.meta?.target?.includes('employeeId') ? 'Employee ID' : 'Email';
           return res.status(409).json({ error: `${target} already exists.` });
      }
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
  }
};

// -----------------------------
// APPROVE / UPDATE USER (ADMIN METADATA UPDATE)
// -----------------------------
export const updateUser = async (req, res) => {
  // ⚠️ NOTE: Add authorization check here or ensure it's handled in the router/middleware
  if (req.user.roleId !== 1) { // Assuming 1 = Admin
      return res.status(403).json({ error: "Access denied. Only Admins can manage user metadata." });
  }

  try {
      const { id } = req.params;
      const { 
          status, 
          roleId, 
          isActive, 
          // ✅ NEW FIELDS FOR UPDATE
          name,
          employeeId,
          jobTitle,
          department,
          lastLoginDate, // Assuming this is set by the system, but included if admin needs to override
      } = req.body;

      const user = await prisma.user.findUnique({ where: { id: Number(id) } });
      if (!user) {
          return res.status(404).json({ error: "User not found." });
      }

      let updatedData = {};
      
      // 1. Status/Activation Update Logic
      if (status === "ACTIVE" && user.status === "PENDING") {
          updatedData.status = "ACTIVE";
          updatedData.isActive = true;
      }
      // Explicit toggle for isActive (suspend/reactivate)
      if (typeof isActive === "boolean") updatedData.isActive = isActive;

      // 2. Metadata Update Logic (Only if provided in the request body)
      if (name) updatedData.name = name;
      if (roleId) updatedData.roleId = Number(roleId);
      if (employeeId) updatedData.employeeId = employeeId;
      if (jobTitle) updatedData.jobTitle = jobTitle;
      if (department) updatedData.department = department;
      if (lastLoginDate) updatedData.lastLoginDate = new Date(lastLoginDate);
      if (status && status !== user.status) updatedData.status = status;

      if (Object.keys(updatedData).length === 0) {
          return res.status(400).json({ error: "No valid fields provided for update." });
      }

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
              // ✅ NEW FIELDS
              employeeId: true,
              jobTitle: true,
              department: true,
              lastLoginDate: true,
          },
      });
      
      // You would typically log an audit here for the update action.

      res.json({
          message:
              status === "ACTIVE" && user.status === "PENDING"
                  ? "User approved successfully."
                  : "User updated successfully.",
          user: updatedUser,
      });
  } catch (error) {
       if (error.code === 'P2002') {
           // Handle unique constraint violation for employeeId
           return res.status(409).json({ error: 'Employee ID already exists for another user.' });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
  }
};


// [UPDATED FUNCTION] Get a list of all users for admin view
export const getAllUsers = async (req, res) => {
  // Only allow Admin (1) or Procurement Manager (2) to access
  if (req.user.roleId !== 1 && req.user.roleId !== 2) {
      return res.status(403).json({ error: 'Access denied. Insufficient privileges.' });
  }

  try {
      const users = await prisma.user.findMany({
          select: {
              id: true,
              uuid: true,
              name: true,
              email: true,
              roleId: true,
              isActive: true,
              createdAt: true,
              updatedAt: true,
              employeeId: true, 
              jobTitle: true,
              department: true,
              lastLoginDate: true, // ✅ NOW INCLUDED
              role: {
                  select: {
                      name: true,
                  },
              },
          },
          orderBy: {
              createdAt: 'desc',
          },
      });

      // Format users
      const formattedUsers = users.map(user => ({
          ...user,
          roleName: user.role.name,
          role: undefined // Remove the nested object
      }));

      res.json(formattedUsers);
  } catch (error) {
      console.error('Error fetching all users:', error);
      res.status(500).json({ error: 'Failed to fetch user list.' });
  }
};

// [NEW FUNCTION] Activate or Deactivate a user
export const toggleUserStatus = async (req, res) => {
  // Only allow Admin (1) to toggle user status
  if (req.user.roleId !== 1) {
      return res.status(403).json({ error: 'Access denied. Only Admin can toggle user status.' });
  }

  const { id } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'Invalid value for isActive.' });
  }

  try {
      const user = await prisma.user.update({
          where: { id: parseInt(id) },
          data: { isActive },
          select: { id: true, name: true, email: true, isActive: true },
      });

      await logAudit(
          req.user.id,
          'USER_STATUS_TOGGLE',
          'User',
          user.id,
          { action: isActive ? 'Activated' : 'Deactivated', email: user.email }
      );

      res.json({ message: `User ${user.email} status set to ${isActive ? 'Active' : 'Inactive'}`, user });
  } catch (error) {
      console.error('Error toggling user status:', error);
      res.status(500).json({ error: 'Failed to toggle user status.' });
  }
};



// Get role permissions
export const getRolePermissions = async (req, res) => {
  try {
    // This would come from your database - using mock data for now
    const rolePermissions = {
      1: { // Admin - Full access
        vendors: { view: true, create: true, edit: true, approve: true },
        rfqs: { view: true, create: true, edit: true, approve: true },
        contracts: { view: true, create: true, edit: true, approve: true },
        purchase_orders: { view: true, create: true, edit: true, approve: true },
        reports: { view: true, export: true },
        user_management: { view: true, edit: true, delete: true }
      },
      2: { // Procurement Manager - Review + Approval level
        vendors: { view: true, create: true, edit: true, approve: true },
        rfqs: { view: true, create: true, edit: true, approve: true },
        contracts: { view: true, create: false, edit: false, approve: true },
        purchase_orders: { view: true, create: false, edit: false, approve: true },
        reports: { view: true, export: true },
        user_management: { view: false, edit: false, delete: false }
      },
      3: { // Procurement Officer - Full operational access
        vendors: { view: true, create: true, edit: true, approve: false },
        rfqs: { view: true, create: true, edit: true, approve: false },
        contracts: { view: true, create: false, edit: false, approve: false },
        purchase_orders: { view: true, create: true, edit: true, approve: false },
        reports: { view: true, export: false },
        user_management: { view: false, edit: false, delete: false }
      },
      4: { // Vendor - Limited access
        vendors: { view: false, create: false, edit: false, approve: false },
        rfqs: { view: true, create: false, edit: false, approve: false },
        contracts: { view: true, create: false, edit: false, approve: false },
        purchase_orders: { view: false, create: false, edit: false, approve: false },
        reports: { view: false, export: false },
        user_management: { view: false, edit: false, delete: false }
      }
    };

    res.json(rolePermissions);
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    res.status(500).json({ error: 'Failed to fetch role permissions' });
  }
};

// Update role permissions
export const updateRolePermissions = async (req, res) => {
  try {
    const { roleId, permissions } = req.body;

    // Here you would save to database
    // For now, we'll just log and return success
    console.log(`Updating permissions for role ${roleId}:`, permissions);

    // TODO: Save to database
    // await prisma.rolePermissions.upsert({ ... });

    res.json({ message: 'Permissions updated successfully', permissions });
  } catch (error) {
    console.error('Error updating role permissions:', error);
    res.status(500).json({ error: 'Failed to update role permissions' });
  }
};


// Update user profile
export const updateUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeId, jobTitle, department } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        employeeId,
        jobTitle,
        department,
        updatedAt: new Date()
      },
      select: {
        id: true,
        name: true,
        email: true,
        roleId: true,
        isActive: true,
        employeeId: true,
        jobTitle: true,
        department: true,
        lastLoginDate: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
};




// In your userController.js
export const getUserAuditLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const { dateRange, actionType, entity } = req.query;
    
    // Your logic to fetch audit logs from database
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        userId: parseInt(id),
        // Add filtering based on query params
        ...(actionType && { action: actionType }),
        ...(entity && { entity: entity }),
        // Add date range filtering
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.json(auditLogs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};