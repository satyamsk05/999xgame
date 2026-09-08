const express = require('express');
const router = express.Router();
const adminRepo = require('./admin.repository');
const { signAdminToken } = require('../auth/jwt');
const { adminMiddleware } = require('../middleware/admin_auth.middleware');
const auditService = require('../services/audit.service');
const logger = require('../utils/logger');

/**
 * Admin authentication (sec 7).
 *
 * Login is username + bcrypt password hash ONLY. There is NO config/master-secret
 * fallback and NO "DB error -> fallback admin" path. If the database is unavailable the
 * endpoint fails closed with 503. Successful logins mint an ADMIN JWT (type=ADMIN) and
 * write an audit record.
 */

function isDbUnavailable(err) {
  if (!err) return false;
  if (err.statusCode === 503) return true;
  const code = err.code;
  return (
    code === 'DATABASE_UNAVAILABLE' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03' ||
    code === '28000' ||
    code === '3D000'
  );
}

// Admin Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: 'Username and password are required',
    });
  }

  let adminRecord;
  try {
    adminRecord = await adminRepo.getAdminByUsername(username);
  } catch (err) {
    // DB unavailable -> 503. NEVER fall back to a hardcoded/config admin credential.
    if (isDbUnavailable(err)) {
      logger.error('Admin login blocked: database unavailable', { error: err.message });
      return res.status(503).json({
        status: 'error',
        code: 'DATABASE_UNAVAILABLE',
        message: 'Authentication service temporarily unavailable.',
      });
    }
    logger.error('Admin login lookup failed', { error: err.message });
    return res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Admin authentication failed.',
    });
  }

  if (!adminRecord || !adminRecord.is_active) {
    logger.warn('Failed admin login attempt (unknown or inactive account)', { username, ip: req.ip });
    auditService.logAdminAction({
      action: 'ADMIN_LOGIN_FAILED',
      target: username,
      ip: req.ip,
      metadata: { reason: 'unknown_or_inactive' },
    });
    return res.status(401).json({
      status: 'error',
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid admin credentials',
    });
  }

  const valid = await adminRepo.verifyPassword(adminRecord, password);
  if (!valid) {
    logger.warn('Failed admin login attempt (invalid password)', { adminId: adminRecord.id, username, ip: req.ip });
    auditService.logAdminAction({
      adminId: adminRecord.id,
      action: 'ADMIN_LOGIN_FAILED',
      target: username,
      ip: req.ip,
      metadata: { reason: 'invalid_password' },
    });
    return res.status(401).json({
      status: 'error',
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid admin credentials',
    });
  }

  const role = adminRecord.role || 'SUPPORT_ADMIN';
  const token = signAdminToken({
    adminId: adminRecord.id,
    username: adminRecord.username,
    role,
  });

  // Best-effort bookkeeping; must never block a successful login.
  adminRepo.updateLastLogin(adminRecord.id).catch((err) => {
    logger.warn('Failed to update admin last_login_at', { error: err.message });
  });
  auditService.logAdminAction({
    adminId: adminRecord.id,
    action: 'ADMIN_LOGIN',
    target: adminRecord.username,
    ip: req.ip,
    metadata: { role },
  });

  logger.info('Admin logged in successfully', { adminId: adminRecord.id, username: adminRecord.username, role });

  return res.status(200).json({
    status: 'success',
    message: 'Admin authenticated successfully',
    token,
    data: {
      token,
      admin: {
        id: adminRecord.id,
        username: adminRecord.username,
        role,
      },
    },
  });
});

// Get Current Admin Info
router.get('/me', adminMiddleware, (req, res) => {
  return res.status(200).json({
    status: 'success',
    data: {
      admin: req.admin,
    },
  });
});

// Admin Logout
router.post('/logout', adminMiddleware, (req, res) => {
  auditService.logAdminAction({
    adminId: req.admin ? req.admin.id : null,
    action: 'ADMIN_LOGOUT',
    target: req.admin ? req.admin.username : null,
    ip: req.ip,
  });
  return res.status(200).json({
    status: 'success',
    message: 'Admin logged out successfully',
  });
});

module.exports = router;
