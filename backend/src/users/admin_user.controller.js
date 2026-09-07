const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/admin.middleware');
const { query, getClient } = require('../database/db');
const logger = require('../utils/logger');
const financialService = require('../services/financial.service');

router.use(adminMiddleware);

/**
 * GET /api/admin/users?search=&limit=50&offset=0
 * List all users with current wallet balance.
 */
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);
    const search = req.query.search?.trim() || '';

    let sql, params;

    if (search) {
      sql = `
        SELECT u.id, u.phone, u.username, u.avatar_path, u.created_at,
               COALESCE(w.available_balance, 0) AS available_balance,
               COALESCE(w.reserved_balance, 0)  AS reserved_balance
        FROM users u
        LEFT JOIN wallets w ON w.user_id = u.id
        WHERE u.phone ILIKE $1 OR u.username ILIKE $1
        ORDER BY u.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [`%${search}%`, limit, offset];
    } else {
      sql = `
        SELECT u.id, u.phone, u.username, u.avatar_path, u.created_at,
               COALESCE(w.available_balance, 0) AS available_balance,
               COALESCE(w.reserved_balance, 0)  AS reserved_balance
        FROM users u
        LEFT JOIN wallets w ON w.user_id = u.id
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      params = [limit, offset];
    }

    const result = await query(sql, params);
    const countRes = await query(
      search
        ? `SELECT COUNT(*) FROM users WHERE phone ILIKE $1 OR username ILIKE $1`
        : `SELECT COUNT(*) FROM users`,
      search ? [`%${search}%`] : []
    );

    const users = result.rows.map((u) => ({
      id: u.id,
      phone: u.phone,
      username: u.username,
      avatarPath: u.avatar_path,
      createdAt: u.created_at,
      wallet: {
        availableBalance: parseInt(u.available_balance, 10) / 100,
        reservedBalance: parseInt(u.reserved_balance, 10) / 100,
        totalBalance: (parseInt(u.available_balance, 10) + parseInt(u.reserved_balance, 10)) / 100,
      },
    }));

    res.status(200).json({
      status: 'success',
      data: users,
      meta: {
        total: parseInt(countRes.rows[0]?.count || 0, 10),
        limit,
        offset,
      },
    });
  } catch (err) {
    logger.error('Failed to list users for admin', { error: err.message });
    next(err);
  }
});

/**
 * GET /api/admin/users/:userId
 * Single user detail — profile + wallet + last 50 transactions + last 20 bets.
 */
router.get('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;

    const [userRes, walletRes, txnRes, betRes] = await Promise.all([
      query('SELECT * FROM users WHERE id = $1', [userId]),

      query('SELECT * FROM wallets WHERE user_id = $1', [userId]),

      query(
        `SELECT id, type, direction, amount, reference_id, metadata, created_at
         FROM wallet_ledger WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 50`,
        [userId]
      ),

      query(
        `SELECT id, round_id, bet_type, stake, win_amount, status, created_at
         FROM bets WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [userId]
      ),
    ]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const user = userRes.rows[0];
    const w = walletRes.rows[0] || {};
    const avail = parseInt(w.available_balance || 0, 10);
    const resv = parseInt(w.reserved_balance || 0, 10);

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          username: user.username,
          avatarPath: user.avatar_path,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
        wallet: {
          availableBalance: avail / 100,
          reservedBalance: resv / 100,
          totalBalance: (avail + resv) / 100,
        },
        recentTransactions: txnRes.rows.map((r) => ({
          id: r.id,
          type: r.type,
          direction: r.direction,
          amount: parseInt(r.amount, 10) / 100,
          referenceId: r.reference_id,
          metadata: r.metadata,
          createdAt: r.created_at,
        })),
        recentBets: betRes.rows.map((b) => ({
          id: b.id,
          roundId: b.round_id,
          betType: b.bet_type,
          stake: parseInt(b.stake, 10) / 100,
          winAmount: parseInt(b.win_amount || 0, 10) / 100,
          status: b.status,
          createdAt: b.created_at,
        })),
      },
    });
  } catch (err) {
    logger.error('Failed to fetch user detail for admin', { error: err.message });
    next(err);
  }
});

/**
 * POST /api/admin/users/:userId/adjust-balance
 * Manual balance adjustment. Requires: amount (rupees), direction (CREDIT|DEBIT), reason.
 * Every adjustment is fully traceable via wallet_ledger + audit log.
 */
router.post('/:userId/adjust-balance', async (req, res, next) => {
  const { userId } = req.params;
  const { amount, direction, reason } = req.body;
  const adminId = req.admin?.id || 'admin_sys';

  // Strict validation — no silent adjustments
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ status: 'error', message: 'amount must be a positive number (in rupees)' });
  }
  if (!['CREDIT', 'DEBIT'].includes(direction)) {
    return res.status(400).json({ status: 'error', message: 'direction must be CREDIT or DEBIT' });
  }
  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ status: 'error', message: 'reason is required (min 5 chars) for audit trail' });
  }

  const client = await getClient();
  try {
    const amountPaise = Math.round(Number(amount) * 100);
    const idempotencyKey = `admin_adj_${adminId}_${userId}_${Date.now()}`;
    const referenceId = `adj_${Date.now()}`;

    let walletResult;

    if (direction === 'CREDIT') {
      walletResult = await financialService.creditWallet(client, amountPaise, {
        userId,
        type: 'ADMIN_CREDIT',
        referenceType: 'ADMIN_ADJUSTMENT',
        referenceId,
        idempotencyKey,
        metadata: { adminId, reason: reason.trim(), direction: 'CREDIT' },
      });
    } else {
      walletResult = await financialService.debitWallet(client, amountPaise, {
        userId,
        type: 'ADMIN_DEBIT',
        referenceType: 'ADMIN_ADJUSTMENT',
        referenceId,
        idempotencyKey,
        metadata: { adminId, reason: reason.trim(), direction: 'DEBIT' },
      });
    }

    const avail = parseInt(walletResult.wallet?.available_balance || 0, 10);
    const resv = parseInt(walletResult.wallet?.reserved_balance || 0, 10);

    logger.info('Admin manual balance adjustment', {
      adminId,
      userId,
      direction,
      amountPaise,
      reason: reason.trim(),
      referenceId,
    });

    res.status(200).json({
      status: 'success',
      message: `Wallet ${direction === 'CREDIT' ? 'credited' : 'debited'} ₹${amount} successfully.`,
      data: {
        referenceId,
        userId,
        direction,
        amountRupees: Number(amount),
        newBalance: {
          availableBalance: avail / 100,
          reservedBalance: resv / 100,
          totalBalance: (avail + resv) / 100,
        },
      },
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ status: 'error', message: err.message });
    }
    logger.error('Admin balance adjustment failed', { adminId, userId, error: err.message });
    next(err);
  } finally {
    if (client) client.release();
  }
});

/** POST /api/admin/users/:userId/block */
router.post('/:userId/block', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const adminId = req.admin?.id || 'admin_sys';

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ status: 'error', message: 'reason required (min 5 chars)' });
    }

    const result = await query(
      `UPDATE users SET is_blocked = TRUE, blocked_at = NOW(), blocked_reason = $2 WHERE id = $1 RETURNING id, username, phone, is_blocked, blocked_at, blocked_reason`,
      [userId, reason.trim()]
    );
    if (!result.rows.length) return res.status(404).json({ status: 'error', message: 'User not found' });

    await query(
      `INSERT INTO audit_logs (id, user_id, action, details, created_at)
       VALUES ($1, $2, 'USER_BLOCKED', $3::jsonb, NOW())`,
      [`al_${Date.now()}`, adminId, JSON.stringify({ targetUserId: userId, reason: reason.trim() })]
    );
    logger.info('Admin blocked user', { adminId, userId });
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) { next(err); }
});

/** POST /api/admin/users/:userId/unblock */
router.post('/:userId/unblock', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const adminId = req.admin?.id || 'admin_sys';

    const result = await query(
      `UPDATE users SET is_blocked = FALSE, blocked_at = NULL, blocked_reason = NULL WHERE id = $1 RETURNING id, username, phone, is_blocked`,
      [userId]
    );
    if (!result.rows.length) return res.status(404).json({ status: 'error', message: 'User not found' });

    await query(
      `INSERT INTO audit_logs (id, user_id, action, details, created_at)
       VALUES ($1, $2, 'USER_UNBLOCKED', $3::jsonb, NOW())`,
      [`al_${Date.now()}`, adminId, JSON.stringify({ targetUserId: userId })]
    );
    logger.info('Admin unblocked user', { adminId, userId });
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) { next(err); }
});

/** PATCH /api/admin/users/:userId/kyc */
router.patch('/:userId/kyc', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { kycStatus } = req.body;
    const adminId = req.admin?.id || 'admin_sys';

    const validStatuses = ['NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED'];
    if (!validStatuses.includes(kycStatus)) {
      return res.status(400).json({ status: 'error', message: `kycStatus must be one of: ${validStatuses.join(', ')}` });
    }

    const result = await query(
      `UPDATE users SET kyc_status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, username, kyc_status`,
      [userId, kycStatus]
    );
    if (!result.rows.length) return res.status(404).json({ status: 'error', message: 'User not found' });

    await query(
      `INSERT INTO audit_logs (id, user_id, action, details, created_at)
       VALUES ($1, $2, 'USER_KYC_UPDATE', $3::jsonb, NOW())`,
      [`al_${Date.now()}`, adminId, JSON.stringify({ targetUserId: userId, kycStatus })]
    );
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
