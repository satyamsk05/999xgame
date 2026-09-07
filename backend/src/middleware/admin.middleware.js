const config = require('../config/env');
const { verifyToken } = require('../auth/jwt');
const logger = require('../utils/logger');

function adminMiddleware(req, res, next) {
  // 1. Check for Admin Secret Header (Primary for server-to-server / admin portal)
  const adminSecretHeader = req.headers['x-admin-secret'];
  if (adminSecretHeader && adminSecretHeader === config.adminSecret) {
    req.admin = {
      id: req.headers['x-admin-id'] || 'admin_sys',
      role: 'SUPER_ADMIN',
    };
    return next();
  }

  // 2. Check for Admin JWT Token in Authorization Header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = verifyToken(token);
      if (decoded && decoded.isAdmin) {
        req.admin = {
          id: decoded.userId || decoded.id || 'admin_sys',
          role: 'ADMIN',
        };
        return next();
      }
    } catch (_) {}
  }

  logger.warn('Admin Access Denied', { path: req.originalUrl, ip: req.ip });
  return res.status(403).json({
    status: 'error',
    message: 'Forbidden: Valid admin credentials required (X-Admin-Secret header or Admin JWT)',
  });
}

module.exports = adminMiddleware;
