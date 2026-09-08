const crypto = require('crypto');
const config = require('../config/env');
const { verifyAdminToken } = require('../auth/jwt');
const logger = require('../utils/logger');

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch (_) {
      return null;
    }
  }
  return null;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * CANONICAL Admin Authentication Middleware.
 *
 * Authentication paths:
 *  1. Admin JWT in Authorization: Bearer <token>.
 *  2. HttpOnly admin_session cookie carrying the same admin JWT.
 *  3. Optional emergency break-glass header, disabled by default.
 */
function adminMiddleware(req, res, next) {
  if (config.adminBreakGlass.enabled && config.adminBreakGlass.secret) {
    const breakGlassHeader = req.headers['x-admin-break-glass'];
    if (safeEqual(breakGlassHeader, config.adminBreakGlass.secret)) {
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

  const authHeader = req.headers.authorization;
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    try {
      const decoded = verifyAdminToken(token);
      if (decoded && decoded.type === 'ADMIN' && (decoded.sub || decoded.adminId)) {
        req.admin = {
          id: decoded.sub || decoded.adminId,
          username: decoded.username || 'admin',
          role: decoded.role || 'SUPPORT_ADMIN',
        };
        return next();
      }
      logger.warn('Admin token rejected: missing required ADMIN identity claims', { path: req.originalUrl });
    } catch (err) {
      logger.warn('Admin JWT verification failed', { error: err.message });
    }
  }

  const cookieToken = getCookie(req, 'admin_session');
  if (cookieToken) {
    try {
      const decoded = verifyAdminToken(cookieToken);
      if (decoded && decoded.type === 'ADMIN' && (decoded.sub || decoded.adminId)) {
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

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ status: 'error', code: 'ADMIN_UNAUTHORIZED', message: 'Unauthorized: Valid admin login session required.' });
    }
    if (req.admin.role === 'SUPER_ADMIN') return next();
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

module.exports = { adminMiddleware, requireRole };
