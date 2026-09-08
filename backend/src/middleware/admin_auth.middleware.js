const config = require('../config/env');
const { verifyAdminToken } = require('../auth/jwt');
const logger = require('../utils/logger');

/**
 * CANONICAL Admin Authentication Middleware (sec 5). This is the ONE implementation used
 * by every admin controller. `admin.middleware.js` is only a compatibility re-export.
 *
 * Authentication paths:
 *  1. Admin JWT (Authorization: Bearer <token>) with explicit type === "ADMIN" (sec 8).
 *  2. HttpOnly `admin_session` cookie carrying the same admin JWT.
 *  3. Isolated emergency break-glass header — DISABLED by default (sec 6). It only works
 *     when ADMIN_BREAK_GLASS_ENABLED=true with a dedicated ADMIN_BREAK_GLASS_SECRET, and
 *     every use is logged loudly. The legacy X-Admin-Secret master bypass is gone.
 *
 * Unauthenticated requests receive 401 (sec 32).
 */
function adminMiddleware(req, res, next) {
  // 1. Emergency break-glass (default OFF). Not a normal login path.
  if (config.adminBreakGlass.enabled && config.adminBreakGlass.secret) {
    const breakGlassHeader = req.headers['x-admin-break-glass'];
    if (breakGlassHeader && breakGlassHeader === config.adminBreakGlass.secret) {
      req.admin = {
        id: req.headers['x-admin-id'] || 'break_glass',
        username: 'Break-Glass Emergency Admin',
        role: 'SUPER_ADMIN',
        isBreakGlass: true,
      };
      logger.warn('ADMIN BREAK-GLASS emergency access used', { path: req.originalUrl, ip: req.ip });
      return next();
    }
  }

  // 2. Admin JWT session token (Authorization: Bearer ...)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = verifyAdminToken(token);
      if (decoded && decoded.type === 'ADMIN') {
        req.admin = {
          id: decoded.sub || decoded.adminId,
          username: decoded.username || 'admin',
          role: decoded.role || 'SUPPORT_ADMIN',
        };
        return next();
      }
      logger.warn('Admin token rejected: missing type=ADMIN claim', { path: req.originalUrl });
    } catch (err) {
      logger.warn('Admin JWT verification failed', { error: err.message });
    }
  }

  // 3. Cookie fallback if using HttpOnly cookies
  if (req.cookies && req.cookies.admin_session) {
    try {
      const decoded = verifyAdminToken(req.cookies.admin_session);
      if (decoded && decoded.type === 'ADMIN') {
        req.admin = {
          id: decoded.sub || decoded.adminId,
          username: decoded.username || 'admin',
          role: decoded.role || 'SUPPORT_ADMIN',
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
 * Role-Based Access Control (RBAC) Enforcer Middleware (sec 53).
 * SUPER_ADMIN has master access; otherwise the admin's role must be explicitly allowed.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        status: 'error',
        code: 'ADMIN_UNAUTHORIZED',
        message: 'Unauthorized: Valid admin login session required.',
      });
    }

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
