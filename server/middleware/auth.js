const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token = req.cookies?.emerald_token;

  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. No token found.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'emerald_secret_fallback_key');
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User session expired or user no longer exists.' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

const requireRole = (allowedRoles = ['owner', 'staff']) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  // Support legacy 'admin' as alias for 'owner'
  const userRole = req.user.role === 'admin' ? 'owner' : req.user.role;
  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({
      success: false,
      message: `Forbidden: requires one of the following roles: [${allowedRoles.join(', ')}]`
    });
  }
  next();
};

const requireOwner = requireRole(['owner']);
const adminOnly = requireRole(['owner', 'staff']);

module.exports = {
  protect,
  requireRole,
  requireOwner,
  adminOnly
};
