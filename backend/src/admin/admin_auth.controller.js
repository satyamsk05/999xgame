const express = require('express');
const router = express.Router();
const adminRepo = require('./admin.repository');
const { signAdminToken } = require('../auth/jwt');
const { adminMiddleware } = require('../middleware/admin_auth.middleware');
const { set, isRedisReady } = require('../database/redis');
const auditService = require('../services/audit.service');
const logger = require('../utils/logger');

function isDbUnavailable(err) {
  if (!err) return false;
  if (err.statusCode === 503) return true;
  return ['DATABASE_UNAVAILABLE', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '57P02', '57P03', '28000', '3D000'].includes(err.code);
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ status: 'error', code: 'VALIDATION_ERROR', message: 'Username and password are required' });

  let adminRecord;
  try { adminRecord = await adminRepo.getAdminByUsername(username); }
  catch (err) {
    if (isDbUnavailable(err)) return res.status(503).json({ status: 'error', code: 'DATABASE_UNAVAILABLE', message: 'Authentication service temporarily unavailable.' });
    logger.error('Admin login lookup failed', { error: err.message });
    return res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'Admin authentication failed.' });
  }

  if (!adminRecord || !adminRecord.is_active) {
    auditService.logAdminAction({ action: 'ADMIN_LOGIN_FAILED', target: username, ip: req.ip, metadata: { reason: 'unknown_or_inactive' } });
    return res.status(401).json({ status: 'error', code: 'INVALID_CREDENTIALS', message: 'Invalid admin credentials' });
  }
  if (!(await adminRepo.verifyPassword(adminRecord, password))) {
    auditService.logAdminAction({ adminId: adminRecord.id, action: 'ADMIN_LOGIN_FAILED', target: username, ip: req.ip, metadata: { reason: 'invalid_password' } });
    return res.status(401).json({ status: 'error', code: 'INVALID_CREDENTIALS', message: 'Invalid admin credentials' });
  }

  const role = adminRecord.role || 'SUPPORT_ADMIN';
  const token = signAdminToken({ adminId: adminRecord.id, username: adminRecord.username, role });
  adminRepo.updateLastLogin(adminRecord.id).catch((err) => logger.warn('Failed to update admin last_login_at', { error: err.message }));
  auditService.logAdminAction({ adminId: adminRecord.id, action: 'ADMIN_LOGIN', target: adminRecord.username, ip: req.ip, metadata: { role } });
  return res.status(200).json({ status: 'success', message: 'Admin authenticated successfully', token, data: { token, admin: { id: adminRecord.id, username: adminRecord.username, role } } });
});

router.get('/me', adminMiddleware, (req, res) => res.status(200).json({ status: 'success', data: { admin: req.admin } }));

router.post('/logout', adminMiddleware, async (req, res) => {
  try {
    if (req.admin?.jti) {
      if (!isRedisReady()) return res.status(503).json({ status: 'error', code: 'SESSION_STORE_UNAVAILABLE', message: 'Authentication service temporarily unavailable.' });
      const decoded = req.adminToken ? require('../auth/jwt').verifyAdminToken(req.adminToken) : null;
      const ttlSeconds = Math.max(1, decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 12 * 3600);
      await set(`admin:revoked:${req.admin.jti}`, '1', ttlSeconds);
    }
    auditService.logAdminAction({ adminId: req.admin?.id || null, action: 'ADMIN_LOGOUT', target: req.admin?.username || null, ip: req.ip });
    return res.status(200).json({ status: 'success', message: 'Admin logged out successfully' });
  } catch (err) {
    logger.error('Admin logout failed', { error: err.message });
    return res.status(503).json({ status: 'error', code: 'SESSION_STORE_UNAVAILABLE', message: 'Authentication service temporarily unavailable.' });
  }
});

module.exports = router;
