const crypto = require('crypto');
const config = require('../config/env');
const { verifyAdminToken } = require('../auth/jwt');
const { get, isRedisReady } = require('../database/redis');
const logger = require('../utils/logger');

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch (_) { return null; }
  }
  return null;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isStateChangingMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());
}

function validateCookieCsrf(req, cookieToken) {
  if (!isStateChangingMethod(req.method)) return true;

  // Cookie authentication is vulnerable to cross-site request forgery because
  // browsers attach cookies automatically. Require an explicit custom header
  // containing the same bearer token for all state-changing cookie-auth calls.
  // A cross-origin attacker cannot read the HttpOnly session cookie and therefore
  // cannot construct this header.
  const csrfToken = req.headers['x-admin-csrf-token'];
  return safeEqual(csrfToken, cookieToken);
}

async function authenticateToken(req, token, viaCookie) {
  const decoded = verifyAdminToken(token);
  if (!decoded || decoded.type !== 'ADMIN' || !(decoded.sub || decoded.adminId)) return false;
  if (!decoded.jti) throw Object.assign(new Error('Admin token is missing jti'), { statusCode: 401, code: 'TOKEN_INVALID' });

  if (!isRedisReady()) {
    if (config.nodeEnv === 'production') {
      const e = new Error('Admin session service unavailable'); e.statusCode = 503; e.code = 'SESSION_STORE_UNAVAILABLE'; throw e;
    }
  } else if (await get(`admin:revoked:${decoded.jti}`)) {
    const e = new Error('Admin session has been revoked'); e.statusCode = 401; e.code = 'TOKEN_REVOKED'; throw e;
  }

  if (viaCookie && !validateCookieCsrf(req, token)) {
    const e = new Error('CSRF validation failed for cookie-authenticated admin request');
    e.statusCode = 403;
    e.code = 'CSRF_VALIDATION_FAILED';
    throw e;
  }

  req.admin = {
    id: decoded.sub || decoded.adminId,
    username: decoded.username || 'admin',
    role: decoded.role || 'SUPPORT_ADMIN',
    jti: decoded.jti,
  };
  req.adminAuthViaCookie = !!viaCookie;
  req.adminToken = token;
  return true;
}

async function adminMiddleware(req, res, next) {
  try {
    if (config.adminBreakGlass.enabled && config.adminBreakGlass.secret) {
      const breakGlassHeader = req.headers['x-admin-break-glass'];
      if (safeEqual(breakGlassHeader, config.adminBreakGlass.secret)) {
        req.admin = { id: req.headers['x-admin-id'] || 'break_glass', username: 'Break-Glass Emergency Admin', role: 'SUPER_ADMIN', isBreakGlass: true };
        logger.warn('ADMIN BREAK-GLASS emergency access used', { path: req.originalUrl, ip: req.ip });
        return next();
      }
    }

    const authHeader = req.headers.authorization;
    if (authHeader && /^Bearer\s+/i.test(authHeader)) {
      if (await authenticateToken(req, authHeader.replace(/^Bearer\s+/i, '').trim(), false)) return next();
    }

    const cookieToken = getCookie(req, 'admin_session');
    if (cookieToken && await authenticateToken(req, cookieToken, true)) return next();

    return res.status(401).json({ status: 'error', code: 'ADMIN_UNAUTHORIZED', message: 'Unauthorized: Valid admin login session required.' });
  } catch (err) {
    logger.warn('Admin authentication rejected', { path: req.originalUrl, code: err.code, error: err.message });
    return res.status(err.statusCode || 401).json({ status: 'error', code: err.code || 'ADMIN_UNAUTHORIZED', message: err.statusCode === 503 ? 'Authentication service temporarily unavailable.' : (err.statusCode === 403 ? 'Forbidden: CSRF validation failed.' : 'Unauthorized: Valid admin login session required.') });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ status: 'error', code: 'ADMIN_UNAUTHORIZED', message: 'Unauthorized: Valid admin login session required.' });
    if (req.admin.role === 'SUPER_ADMIN') return next();
    if (!allowedRoles.includes(req.admin.role)) {
      logger.warn('Admin Forbidden Access (RBAC Violation)', { adminId: req.admin.id, role: req.admin.role, requiredRoles: allowedRoles, path: req.originalUrl });
      return res.status(403).json({ status: 'error', code: 'FORBIDDEN_ROLE', message: `Forbidden: This action requires role [${allowedRoles.join(', ')}]. Your role is [${req.admin.role}].` });
    }
    next();
  };
}

module.exports = { adminMiddleware, requireRole };