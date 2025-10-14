import jwt from "jsonwebtoken";
import prisma from "../config/prismaClient.js";

// Middleware to check if user has the required role
export const authorizeRole = (roles) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers["authorization"];
      if (!authHeader) return res.status(401).json({ error: "No token provided." });

      const token = authHeader.split(" ")[1];
      if (!token) return res.status(401).json({ error: "No token provided." });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({ where: { id: decoded.id } });

      if (!user) return res.status(401).json({ error: "User not found." });

      if (!roles.includes(user.roleId)) {
        return res.status(403).json({ error: "Access denied." });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error("Authorization error:", error);
      return res.status(401).json({ error: "Invalid or expired token." });
    }
  };
};
