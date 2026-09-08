const express = require('express');
const router = express.Router();
const { adminMiddleware, requireRole } = require('../middleware/admin_auth.middleware');
const { query, getClient } = require('../database/db');
const logger = require('../utils/logger');
const financialService = require('../services/financial.service');

router.use(adminMiddleware);

/**
 * POST /api/admin/users/:userId/adjust-balance
 * Manual balance adjustment. Requires: amount (rupees), direction (CREDIT|DEBIT), reason.
 * Idempotent via req.body.idempotencyKey or X-Idempotency-Key header.
 */
router.post('/:userId/adjust-balance', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res, next) => {
  const { userId } = req.params;
  const { amount, direction, reason } = req.body;
  const adminId = req.admin?.id || 'admin_sys';

  const clientProvidedIdempotencyKey = req.body.idempotencyKey || req.headers['x-idempotency-key'];
  const idempotencyKey = clientProvidedIdempotencyKey || `admin_adj_${adminId}_${userId}_${Math.floor(Date.now() / 60000)}`;

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

  // Check if idempotency key was already executed
  try {
    const existingLedger = await query('SELECT * FROM wallet_ledger WHERE idempotency_key = $1', [idempotencyKey]);
    if (existingLedger.rows.length > 0) {
      const existing = existingLedger.rows[0];
      logger.info('Duplicate admin balance adjustment request caught by idempotency key', { idempotencyKey });
      return res.status(200).json({
        status: 'success',
        message: 'Adjustment request already processed (idempotent response)',
        data: {
          idempotencyKey,
          referenceId: existing.reference_id,
          userId: existing.user_id,
          amountRupees: parseInt(existing.amount, 10) / 100,
          direction: existing.direction,
          alreadyProcessed: true,
        },
      });
    }
  } catch (_) {}

  const client = await getClient();
  try {
    const amountPaise = Math.round(Number(amount) * 100);
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
      idempotencyKey,
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
