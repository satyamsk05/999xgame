const crypto = require('crypto');
const { query } = require('../database/db');
const logger = require('../utils/logger');

/**
 * Audit logging for admin/financial actions (sec 49).
 *
 * IMPORTANT: auditing is fire-and-forget. It MUST NEVER throw, block, or roll back the
 * caller's already-committed financial operation. A failed audit write is logged as a
 * warning only.
 *
 * Stored fields: adminId, userId, action, target, ip_address, metadata (details JSONB),
 * timestamp. Passwords/secrets/tokens are stripped from metadata before persistence.
 */

const SENSITIVE_KEY = /password|secret|token|hash|authorization|otp|pin|cvv|card/i;

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  const safe = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(key)) {
      safe[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      safe[key] = sanitizeMetadata(value);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

/**
 * Record an admin/financial action. Returns the generated audit id synchronously; the
 * actual DB insert happens in the background and never rejects the caller.
 */
function logAdminAction({ adminId = null, userId = null, action, target = null, ip = null, metadata = {} } = {}) {
  if (!action) return null;
  const id = `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const details = sanitizeMetadata(metadata);

  query(
    `INSERT INTO audit_logs (id, admin_id, user_id, action, target, ip_address, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [id, adminId, userId, action, target ? String(target) : null, ip, JSON.stringify(details)]
  ).catch((err) => {
    logger.warn('Audit log write failed (non-fatal)', { action, adminId, error: err.message });
  });

  return id;
}

module.exports = {
  logAdminAction,
  sanitizeMetadata,
};
