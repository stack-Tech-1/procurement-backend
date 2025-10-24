import jwt from "jsonwebtoken";
import prisma from "../config/prismaClient.js";

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  console.log("🔑 Token received:", token); // Log the token for debugging

  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch the user from DB (to get role and other info)
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, email: true, roleId: true },
    });

    if (!user) return res.status(401).json({ error: "User not found" });

    // Map roleId → role name for easier checks
    let role = "USER";
    if (user.roleId === 1) role = "ADMIN";
    else if (user.roleId === 2) role = "VENDOR";

    
  req.user = { id: user.id, email: user.email, role, roleId: user.roleId } 

    next();
  } catch (err) {
    console.error("JWT validation error:", err);
    res.status(403).json({ error: "Invalid or expired token" });
  }
};
