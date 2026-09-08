const bcrypt = require('bcryptjs');
const { query } = require('../database/db');
const logger = require('../utils/logger');

/**
 * Admin account persistence (sec 7).
 *
 * Passwords are stored ONLY as bcrypt hashes. There is no plaintext or config-based
 * admin credential path. Lookup failures propagate so the caller can fail closed (503)
 * instead of silently falling back to a hardcoded admin.
 */

const BCRYPT_ROUNDS = 12;

async function getAdminByUsername(username) {
  const res = await query('SELECT * FROM admins WHERE username = $1', [username]);
  return res.rows[0] || null;
}

async function getAdminById(id) {
  const res = await query('SELECT * FROM admins WHERE id = $1', [id]);
  return res.rows[0] || null;
}

/**
 * Create or update an admin (upsert keyed on the UNIQUE username). Used by the secure
 * provisioning script and by tests to obtain a real admin JWT (sec 55). Never logs the
 * password or hash.
 */
async function createAdmin({ id, username, password, role = 'SUPPORT_ADMIN', isActive = true } = {}) {
  if (!username || !password) {
    const err = new Error('username and password are required to create an admin');
    err.statusCode = 400;
    throw err;
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Prefer updating an existing username so identity (id) stays stable across re-runs.
  const updated = await query(
    `UPDATE admins
        SET password_hash = $2,
            role = $3,
            is_active = $4,
            updated_at = NOW()
      WHERE username = $1
      RETURNING id, username, role, is_active, last_login_at, created_at`,
    [username, hash, role, isActive]
  );
  if (updated.rows[0]) {
    logger.info('Admin account updated', { adminId: updated.rows[0].id, username, role });
    return updated.rows[0];
  }

  const adminId = id || `adm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inserted = await query(
    `INSERT INTO admins (id, username, password_hash, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     RETURNING id, username, role, is_active, last_login_at, created_at`,
    [adminId, username, hash, role, isActive]
  );
  logger.info('Admin account created', { adminId: inserted.rows[0].id, username, role });
  return inserted.rows[0];
}

async function updateLastLogin(id) {
  await query('UPDATE admins SET last_login_at = NOW() WHERE id = $1', [id]);
}

async function verifyPassword(adminRecord, password) {
  if (!adminRecord || !adminRecord.password_hash || !password) return false;
  try {
    return await bcrypt.compare(password, adminRecord.password_hash);
  } catch (err) {
    logger.warn('bcrypt compare failed during admin login', { error: err.message });
    return false;
  }
}

module.exports = {
  getAdminByUsername,
  getAdminById,
  createAdmin,
  updateLastLogin,
  verifyPassword,
};
