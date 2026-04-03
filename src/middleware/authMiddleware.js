// backend/src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import prisma from '../config/prismaClient.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach IP address and user agent for audit logging
    req.ipAddress =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      null;
    req.userAgent = req.headers['user-agent'] || null;

    // Check account lock and suspension status
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { isSuspended: true, lockedUntil: true },
    });

    if (user?.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return res.status(403).json({ error: 'Account temporarily locked. Please try again later.' });
    }

    if (user?.isSuspended) {
      return res.status(403).json({ error: 'Account suspended. Contact your administrator.' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};
