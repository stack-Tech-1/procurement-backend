// backend/src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  console.log('🔐 Auth Middleware Debug:', {
    hasAuthHeader: !!authHeader,
    tokenReceived: !!token,
    tokenPrefix: authHeader?.split(' ')[0]
  });

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    
    console.log('✅ Token verified successfully:', {
      userId: decoded.id,
      userEmail: decoded.email,
      userRole: decoded.roleId
    });
    
    next();
  } catch (error) {
    console.log('❌ Token verification failed:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    return res.status(403).json({ error: 'Invalid token' });
  }
};