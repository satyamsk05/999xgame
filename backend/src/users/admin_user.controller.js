const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { adminMiddleware, requireRole } = require('../middleware/admin_auth.middleware');
const { query, getClient } = require('../database/db');
const logger = require('../utils/logger');
const financialService = require('../services/financial.service');

router.use(adminMiddleware);

// GET /api/admin/users — registered users with authoritative wallet balances.
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);
    const search = String(req.query.search || '').trim();
    const like = `%${search}%`;
    const countRes = await query(`SELECT COUNT(*)::int AS total FROM users WHERE ($1 = '' OR username ILIKE $2 OR phone ILIKE $2 OR id ILIKE $2)`, [search, like]);
    const rowsRes = await query(`SELECT u.id, u.username, u.phone, u.is_blocked, u.created_at, u.kyc_status, COALESCE(w.available_balance,0) AS available_balance, COALESCE(w.reserved_balance,0) AS reserved_balance, COALESCE(w.deposit_balance,0) AS deposit_balance, COALESCE(w.winnings_balance,0) AS winnings_balance, COALESCE(w.rewards_balance,0) AS rewards_balance FROM users u LEFT JOIN wallets w ON w.user_id = u.id WHERE ($1 = '' OR u.username ILIKE $2 OR u.phone ILIKE $2 OR u.id ILIKE $2) ORDER BY u.created_at DESC LIMIT $3 OFFSET $4`, [search, like, limit, offset]);
    const data = rowsRes.rows.map((u) => {
      const available = parseInt(u.available_balance || 0, 10);
      const reserved = parseInt(u.reserved_balance || 0, 10);
      return { id: u.id, username: u.username, phone: u.phone, isBlocked: !!u.is_blocked, kycStatus: u.kyc_status || 'NOT_SUBMITTED', createdAt: u.created_at, wallet: { availableBalance: available / 100, reservedBalance: reserved / 100, depositBalance: parseInt(u.deposit_balance || 0, 10) / 100, winningsBalance: parseInt(u.winnings_balance || 0, 10) / 100, rewardsBalance: parseInt(u.rewards_balance || 0, 10) / 100, totalBalance: (available + reserved) / 100 } };
    });
    res.status(200).json({ status: 'success', data, meta: { total: countRes.rows[0].total, limit, offset, hasMore: offset + data.length < countRes.rows[0].total } });
  } catch (err) { logger.error('Admin users list failed', { error: err.message }); next(err); }
});

router.get('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const userRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) return res.status(404).json({ status: 'error', message: 'User not found' });
    const u = userRes.rows[0];
    const walletRes = await query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
    const w = walletRes.rows[0] || {};
    const available = parseInt(w.available_balance || 0, 10);
    const reserved = parseInt(w.reserved_balance || 0, 10);
    const txRes = await query(`SELECT id, type, amount, direction, created_at, reference_id FROM wallet_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [userId]);
    const recentTransactions = txRes.rows.map((t) => ({ id: t.id, type: t.type, amount: parseInt(t.amount || 0, 10) / 100, direction: t.direction, createdAt: t.created_at, referenceId: t.reference_id }));
    res.status(200).json({ status: 'success', data: { user: { id: u.id, username: u.username, phone: u.phone, avatarPath: u.avatar_path, isBlocked: !!u.is_blocked, blockedAt: u.blocked_at, blockedReason: u.blocked_reason, kycStatus: u.kyc_status || 'NOT_SUBMITTED', createdAt: u.created_at }, wallet: { availableBalance: available / 100, reservedBalance: reserved / 100, depositBalance: parseInt(w.deposit_balance || 0, 10) / 100, winningsBalance: parseInt(w.winnings_balance || 0, 10) / 100, rewardsBalance: parseInt(w.rewards_balance || 0, 10) / 100, totalBalance: (available + reserved) / 100 }, recentTransactions, recentBets: [] } });
  } catch (err) { logger.error('Admin user detail failed', { userId: req.params.userId, error: err.message }); next(err); }
});

router.post('/:userId/adjust-balance', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res, next) => {
  const { userId } = req.params;
  const { amount, direction, reason } = req.body || {};
  const adminId = req.admin?.id || 'admin_sys';
  const rawIdempotencyKey = req.body?.idempotencyKey || req.headers['x-idempotency-key'];
  const idempotencyKey = rawIdempotencyKey ? String(rawIdempotencyKey).trim() : `admin_adj_${crypto.randomUUID()}`;
  const amountText = String(amount ?? '').trim();
  const amountNumber = Number(amountText);
  if (!/^\d+(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amountNumber) || amountNumber <= 0) return res.status(400).json({ status: 'error', message: 'amount must be a positive rupee value with at most 2 decimal places' });
  const amountPaise = Math.round(amountNumber * 100);
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return res.status(400).json({ status: 'error', message: 'amount is outside the supported range' });
  if (!['CREDIT', 'DEBIT'].includes(direction)) return res.status(400).json({ status: 'error', message: 'direction must be CREDIT or DEBIT' });
  if (!reason || reason.trim().length < 5) return res.status(400).json({ status: 'error', message: 'reason is required (min 5 chars) for audit trail' });
  if (idempotencyKey.length < 8 || idempotencyKey.length > 100) return res.status(400).json({ status: 'error', message: 'idempotencyKey must be between 8 and 100 characters' });

  const client = await getClient();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const existingLedger = await client.query('SELECT * FROM wallet_ledger WHERE idempotency_key = $1 FOR UPDATE', [idempotencyKey]);
    if (existingLedger.rows.length > 0) {
      const existing = existingLedger.rows[0];
      await client.query('COMMIT');
      transactionStarted = false;
      return res.status(200).json({ status: 'success', message: 'Adjustment request already processed (idempotent response)', data: { idempotencyKey, referenceId: existing.reference_id, userId: existing.user_id, amountRupees: parseInt(existing.amount, 10) / 100, direction: existing.direction, alreadyProcessed: true } });
    }

    const referenceId = `adj_${crypto.randomUUID()}`;
    const walletResult = direction === 'CREDIT'
      ? await financialService.creditWallet(client, amountPaise, { userId, type: 'ADMIN_CREDIT', referenceType: 'ADMIN_ADJUSTMENT', referenceId, idempotencyKey, metadata: { adminId, reason: reason.trim(), direction } })
      : await financialService.debitWallet(client, amountPaise, { userId, type: 'ADMIN_DEBIT', referenceType: 'ADMIN_ADJUSTMENT', referenceId, idempotencyKey, metadata: { adminId, reason: reason.trim(), direction } });

    const wallet = walletResult.wallet;
    if (!wallet) {
      if (walletResult.duplicate && walletResult.ledger) {
        const currentWallet = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        await client.query('COMMIT');
        transactionStarted = false;
        const duplicateLedger = walletResult.ledger;
        const current = currentWallet.rows[0];
        return res.status(200).json({ status: 'success', message: 'Adjustment request already processed (idempotent response)', data: { idempotencyKey, referenceId: duplicateLedger.reference_id, userId: duplicateLedger.user_id, amountRupees: parseInt(duplicateLedger.amount, 10) / 100, direction: duplicateLedger.direction, alreadyProcessed: true, newBalance: current ? { availableBalance: parseInt(current.available_balance || 0, 10) / 100, reservedBalance: parseInt(current.reserved_balance || 0, 10) / 100, totalBalance: (parseInt(current.available_balance || 0, 10) + parseInt(current.reserved_balance || 0, 10)) / 100 } : undefined } });
      }
      throw new Error('Wallet adjustment completed without returning wallet state');
    }

    const avail = parseInt(wallet.available_balance || 0, 10);
    const resv = parseInt(wallet.reserved_balance || 0, 10);
    await client.query(`INSERT INTO audit_logs (id, user_id, action, ip_address, details, created_at) VALUES ($1, $2, 'ADMIN_WALLET_ADJUSTMENT', $3, $4::jsonb, NOW())`, [`al_${crypto.randomUUID()}`, userId, req.ip || null, JSON.stringify({ adminId, amountPaise, direction, reason: reason.trim(), referenceId, idempotencyKey })]);
    await client.query('COMMIT');
    transactionStarted = false;
    return res.status(200).json({ status: 'success', message: `Wallet ${direction === 'CREDIT' ? 'credited' : 'debited'} ₹${amountNumber.toFixed(2)} successfully.`, data: { referenceId, userId, direction, amountRupees: amountNumber, newBalance: { availableBalance: avail / 100, reservedBalance: resv / 100, totalBalance: (avail + resv) / 100 } } });
  } catch (err) {
    if (transactionStarted) { try { await client.query('ROLLBACK'); } catch (_) {} transactionStarted = false; }
    if (err && err.code === '23505' && err.constraint === 'wallet_ledger_idempotency_key_key') {
      try {
        const existing = await client.query('SELECT * FROM wallet_ledger WHERE idempotency_key = $1 LIMIT 1', [idempotencyKey]);
        if (existing.rows.length) {
          const row = existing.rows[0];
          return res.status(200).json({ status: 'success', message: 'Adjustment request already processed (idempotent response)', data: { idempotencyKey, referenceId: row.reference_id, userId: row.user_id, amountRupees: parseInt(row.amount, 10) / 100, direction: row.direction, alreadyProcessed: true } });
        }
      } catch (_) {}
    }
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', message: err.message });
    next(err);
  } finally { client.release(); }
});

router.post('/:userId/block', requireRole('SUPER_ADMIN', 'SUPPORT_ADMIN'), async (req, res, next) => {
  try {
    const { userId } = req.params, { reason } = req.body, adminId = req.admin?.id || 'admin_sys';
    if (!reason || reason.trim().length < 5) return res.status(400).json({ status: 'error', message: 'reason required (min 5 chars)' });
    const result = await query(`UPDATE users SET is_blocked = TRUE, blocked_at = NOW(), blocked_reason = $2 WHERE id = $1 RETURNING id, username, phone, is_blocked, blocked_at, blocked_reason`, [userId, reason.trim()]);
    if (!result.rows.length) return res.status(404).json({ status: 'error', message: 'User not found' });
    await query(`INSERT INTO audit_logs (id, user_id, action, details, created_at) VALUES ($1, $2, 'USER_BLOCKED', $3::jsonb, NOW())`, [`al_${Date.now()}`, adminId, JSON.stringify({ targetUserId: userId, reason: reason.trim() })]);
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) { next(err); }
});

router.post('/:userId/unblock', requireRole('SUPER_ADMIN', 'SUPPORT_ADMIN'), async (req, res, next) => {
  try {
    const { userId } = req.params, adminId = req.admin?.id || 'admin_sys';
    const result = await query(`UPDATE users SET is_blocked = FALSE, blocked_at = NULL, blocked_reason = NULL WHERE id = $1 RETURNING id, username, phone, is_blocked`, [userId]);
    if (!result.rows.length) return res.status(404).json({ status: 'error', message: 'User not found' });
    await query(`INSERT INTO audit_logs (id, user_id, action, details, created_at) VALUES ($1, $2, 'USER_UNBLOCKED', $3::jsonb, NOW())`, [`al_${Date.now()}`, adminId, JSON.stringify({ targetUserId: userId })]);
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) { next(err); }
});

router.patch('/:userId/kyc', requireRole('SUPER_ADMIN', 'SUPPORT_ADMIN'), async (req, res, next) => {
  try {
    const { userId } = req.params, { kycStatus } = req.body, adminId = req.admin?.id || 'admin_sys';
    const validStatuses = ['NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED'];
    if (!validStatuses.includes(kycStatus)) return res.status(400).json({ status: 'error', message: `kycStatus must be one of: ${validStatuses.join(', ')}` });
    const result = await query(`UPDATE users SET kyc_status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, username, kyc_status`, [userId, kycStatus]);
    if (!result.rows.length) return res.status(404).json({ status: 'error', message: 'User not found' });
    await query(`INSERT INTO audit_logs (id, user_id, action, details, created_at) VALUES ($1, $2, 'USER_KYC_UPDATE', $3::jsonb, NOW())`, [`al_${Date.now()}`, adminId, JSON.stringify({ targetUserId: userId, kycStatus })]);
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
