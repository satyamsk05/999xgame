const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { signToken } = require('../auth/jwt');
const { adminMiddleware } = require('../middleware/admin_auth.middleware');
const config = require('../config/env');
const logger = require('../utils/logger');

// Admin Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: 'Username and password are required' });
  }

  try {
    let adminRecord = null;

    // 1. Try DB lookup
    try {
      const result = await query('SELECT * FROM admins WHERE username = $1 AND is_active = TRUE', [username]);
      if (result.rows.length > 0) {
        adminRecord = result.rows[0];
        // Simple hash check / match (can use bcrypt if hashed)
        if (adminRecord.password_hash !== password && !adminRecord.password_hash.startsWith('$2')) {
          adminRecord = null;
        }
      }
    } catch (_) {
      // If table empty or error, fallback to config
    }

    // 2. Default Config Fallback for Super Admin
    if (!adminRecord) {
      if (username === 'admin' && password === config.adminSecret) {
        adminRecord = {
          id: 'admin_super',
          username: 'admin',
          role: 'SUPER_ADMIN',
        };
      }
    }

    if (!adminRecord) {
      logger.warn('Failed admin login attempt', { username, ip: req.ip });
      return res.status(401).json({ status: 'error', message: 'Invalid admin credentials' });
    }

    const token = signToken({
      adminId: adminRecord.id,
      username: adminRecord.username,
      role: adminRecord.role || 'SUPER_ADMIN',
      isAdmin: true,
    });

    logger.info('Admin logged in successfully', { adminId: adminRecord.id, username: adminRecord.username });

    return res.status(200).json({
      status: 'success',
      message: 'Admin authenticated successfully',
      token,
      data: {
        token,
        admin: {
          id: adminRecord.id,
          username: adminRecord.username,
          role: adminRecord.role || 'SUPER_ADMIN',
        },
      },
    });
  } catch (err) {
    logger.error('Admin login error', { error: err.message });
    return res.status(500).json({ status: 'error', message: 'Admin authentication failed' });
  }
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
  return res.status(200).json({
    status: 'success',
    message: 'Admin logged out successfully',
  });
});

module.exports = router;
