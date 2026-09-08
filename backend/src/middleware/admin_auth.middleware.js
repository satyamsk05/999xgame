const config = require('../config/env');
const { verifyToken } = require('../auth/jwt');
const logger = require('../utils/logger');

/**
 * Robust Admin Authentication Middleware supporting JWT tokens & system break-glass secret
 */
function adminMiddleware(req, res, next) {
  // 1. Check Break-Glass System Secret (Primary for dev / emergency background scripts)
  const adminSecretHeader = req.headers['x-admin-secret'];
  if (adminSecretHeader && adminSecretHeader === config.adminSecret) {
    req.admin = {
      id: req.headers['x-admin-id'] || 'admin_sys',
      username: 'System Break-Glass Admin',
      role: 'SUPER_ADMIN',
      isBreakGlass: true,
    };
    return next();
  }

  // 2. Check Admin JWT Session Token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = verifyToken(token);
      if (decoded && (decoded.isAdmin || decoded.adminId || decoded.role)) {
        req.admin = {
          id: decoded.adminId || decoded.userId || 'admin_user',
          username: decoded.username || 'admin',
          role: decoded.role || 'SUPER_ADMIN',
        };
        return next();
      }
    } catch (err) {
      logger.warn('Admin JWT verification failed', { error: err.message });
    }
  }

  // 3. Cookie fallback if using HttpOnly cookies
  if (req.cookies && req.cookies.admin_session) {
    try {
      const decoded = verifyToken(req.cookies.admin_session);
      if (decoded && (decoded.adminId || decoded.role)) {
        req.admin = {
          id: decoded.adminId,
          username: decoded.username,
          role: decoded.role || 'SUPER_ADMIN',
        };
        return next();
      }
    } catch (_) {}
  }

  logger.warn('Unauthorized Admin Access Attempt', { path: req.originalUrl, ip: req.ip });
  return res.status(401).json({
    status: 'error',
    code: 'ADMIN_UNAUTHORIZED',
    message: 'Unauthorized: Valid admin login session required.',
  });
}

/**
 * Role-Based Access Control (RBAC) Enforcer Middleware
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    // SUPER_ADMIN has master access to all features
    if (req.admin.role === 'SUPER_ADMIN') {
      return next();
    }

    if (!allowedRoles.includes(req.admin.role)) {
      logger.warn('Admin Forbidden Access (RBAC Violation)', {
        adminId: req.admin.id,
        role: req.admin.role,
        requiredRoles: allowedRoles,
        path: req.originalUrl,
      });
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN_ROLE',
        message: `Forbidden: This action requires role [${allowedRoles.join(', ')}]. Your role is [${req.admin.role}].`,
      });
    }

    next();
  };
}

module.exports = {
  adminMiddleware,
  requireRole,
};
