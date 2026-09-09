const { getClient } = require('../database/db');
const logger = require('../utils/logger');
const crypto = require('crypto');

async function withTransaction(clientOrUserId, callback) {
  if (typeof clientOrUserId !== 'string' && clientOrUserId && typeof clientOrUserId.query === 'function') {
    return await callback(clientOrUserId);
  }
  const userId = clientOrUserId;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client, userId);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function lockWallet(client, userId) {
  const res = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
  let wallet = res.rows[0];
  if (!wallet) {
    const walletId = `wlt_${userId}`;
    try {
      const insertRes = await client.query(
        `INSERT INTO wallets (id, user_id, available_balance, reserved_balance, deposit_balance, winnings_balance, rewards_balance, locked_balance, version, created_at, updated_at)
         VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 1, NOW(), NOW()) RETURNING *`,
        [walletId, userId]
      );
      wallet = insertRes.rows[0];
    } catch (err) {
      // Another transaction may have created the wallet after our initial SELECT.
      // PostgreSQL's unique user_id constraint makes that insert fail; re-read while
      // holding the row lock so callers always operate on one authoritative wallet.
      if (err && err.code === '23505') {
        const retry = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        wallet = retry.rows[0];
      } else {
        throw err;
      }
    }
  }
  if (!wallet) throw new Error(`Unable to create or lock wallet for user ${userId}`);
  return wallet;
}

async function checkIdempotency(client, idempotencyKey, userId, referenceType = null, referenceId = null) {
  if (!idempotencyKey) return null;
  const res = await client.query(
    `SELECT * FROM wallet_ledger
     WHERE idempotency_key = $1 AND user_id = $2
       AND ($3::varchar IS NULL OR reference_type = $3)
       AND ($4::varchar IS NULL OR reference_id = $4)
     LIMIT 1`,
    [idempotencyKey, userId, referenceType, referenceId]
  );
  return res.rows[0] || null;
}

async function assertIdempotencyConflict(client, idempotencyKey, userId) {
  if (!idempotencyKey) return;
  const res = await client.query('SELECT user_id FROM wallet_ledger WHERE idempotency_key = $1 LIMIT 1', [idempotencyKey]);
  if (res.rows.length && res.rows[0].user_id !== userId) {
    const err = new Error('Idempotency key is already used by another account');
    err.statusCode = 409;
    throw err;
  }
}

async function creditWallet(clientOrUserId, amountPaise, options = {}) {
  const amount = parseInt(amountPaise, 10);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Credit amount must be a positive integer in paise');
  const { type = 'CREDIT', referenceType = 'DEPOSIT', referenceId = null, idempotencyKey = null, metadata = {} } = options;

  return await withTransaction(clientOrUserId, async (client, userId) => {
    const uId = userId || options.userId;
    if (!uId) throw new Error('userId is required for creditWallet');
    await assertIdempotencyConflict(client, idempotencyKey, uId);
    const existing = await checkIdempotency(client, idempotencyKey, uId, referenceType, referenceId);
    if (existing) return { duplicate: true, ledger: existing };

    const wallet = await lockWallet(client, uId);
    const beforeBalance = parseInt(wallet.available_balance || 0, 10);
    const afterBalance = beforeBalance + amount;
    let bucketColumn = 'deposit_balance';
    if (type === 'WIN_CREDIT' || referenceType === 'GAME_WIN') bucketColumn = 'winnings_balance';
    else if (type === 'BONUS_CREDIT' || referenceType === 'BONUS') bucketColumn = 'rewards_balance';

    const updateRes = await client.query(
      `UPDATE wallets SET available_balance = $2, ${bucketColumn} = ${bucketColumn} + $3, version = version + 1, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [wallet.id, afterBalance, amount]
    );
    const updatedWallet = updateRes.rows[0];
    const ledgerId = `ledg_${crypto.randomUUID()}`;
    const ledgerRes = await client.query(
      `INSERT INTO wallet_ledger (id, user_id, wallet_id, type, amount, direction, reference_type, reference_id, balance_before, balance_after, status, idempotency_key, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, 'CREDIT', $6, $7, $8, $9, 'COMPLETED', $10, $11, NOW()) RETURNING *`,
      [ledgerId, uId, wallet.id, type, amount, referenceType, referenceId, beforeBalance, afterBalance, idempotencyKey, JSON.stringify(metadata)]
    );
    return { wallet: updatedWallet, ledger: ledgerRes.rows[0] };
  });
}

/**
 * Debit the aggregate available balance and consume its component buckets in a
 * deterministic order: deposit funds first, then winnings, then rewards.
 * This keeps available_balance equal to the sum of spendable buckets after every
 * normal debit and prevents the UI from showing stale bucket totals after bets.
 */
async function debitWallet(clientOrUserId, amountPaise, options = {}) {
  const amount = parseInt(amountPaise, 10);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Debit amount must be a positive integer in paise');
  const { type = 'DEBIT', referenceType = 'GAME_BET', referenceId = null, idempotencyKey = null, metadata = {} } = options;

  return await withTransaction(clientOrUserId, async (client, userId) => {
    const uId = userId || options.userId;
    if (!uId) throw new Error('userId is required for debitWallet');
    await assertIdempotencyConflict(client, idempotencyKey, uId);
    const existing = await checkIdempotency(client, idempotencyKey, uId, referenceType, referenceId);
    if (existing) return { duplicate: true, ledger: existing };

    const wallet = await lockWallet(client, uId);
    const beforeBalance = parseInt(wallet.available_balance || 0, 10);
    const depositBalance = parseInt(wallet.deposit_balance || 0, 10);
    const winningsBalance = parseInt(wallet.winnings_balance || 0, 10);
    const rewardsBalance = parseInt(wallet.rewards_balance || 0, 10);

    if (beforeBalance < amount) {
      throw new Error(`Insufficient funds: available balance ₹${(beforeBalance / 100).toFixed(2)}, requested ₹${(amount / 100).toFixed(2)}`);
    }

    let remaining = amount;
    const depositDebit = Math.min(depositBalance, remaining);
    remaining -= depositDebit;
    const winningsDebit = Math.min(winningsBalance, remaining);
    remaining -= winningsDebit;
    const rewardsDebit = Math.min(rewardsBalance, remaining);
    remaining -= rewardsDebit;

    if (remaining !== 0) {
      const err = new Error('Wallet bucket totals are inconsistent with available balance');
      err.statusCode = 409;
      throw err;
    }

    const afterBalance = beforeBalance - amount;
    const updateRes = await client.query(
      `UPDATE wallets
       SET available_balance = $2,
           deposit_balance = deposit_balance - $3,
           winnings_balance = winnings_balance - $4,
           rewards_balance = rewards_balance - $5,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [wallet.id, afterBalance, depositDebit, winningsDebit, rewardsDebit]
    );

    const ledgerId = `ledg_${crypto.randomUUID()}`;
    const ledgerRes = await client.query(
      `INSERT INTO wallet_ledger (id, user_id, wallet_id, type, amount, direction, reference_type, reference_id, balance_before, balance_after, status, idempotency_key, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, 'DEBIT', $6, $7, $8, $9, 'COMPLETED', $10, $11, NOW()) RETURNING *`,
      [ledgerId, uId, wallet.id, type, amount, referenceType, referenceId, beforeBalance, afterBalance, idempotencyKey, JSON.stringify({ ...metadata, bucketDebit: { deposit: depositDebit, winnings: winningsDebit, rewards: rewardsDebit } })]
    );
    return { wallet: updateRes.rows[0], ledger: ledgerRes.rows[0] };
  });
}

async function reserveFunds(clientOrUserId, amountPaise, options = {}) {
  const amount = parseInt(amountPaise, 10);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Reserve amount must be a positive integer in paise');
  const { referenceType = 'WITHDRAWAL', referenceId = null, idempotencyKey = null, metadata = {} } = options;
  return await withTransaction(clientOrUserId, async (client, userId) => {
    const uId = userId || options.userId;
    if (!uId) throw new Error('userId is required for reserveFunds');
    await assertIdempotencyConflict(client, idempotencyKey, uId);
    const existing = await checkIdempotency(client, idempotencyKey, uId, referenceType, referenceId);
    if (existing) return { duplicate: true, ledger: existing };
    const wallet = await lockWallet(client, uId);
    const beforeAvailable = parseInt(wallet.available_balance || 0, 10);
    const beforeReserved = parseInt(wallet.reserved_balance || 0, 10);
    if (beforeAvailable < amount) throw new Error(`Insufficient funds to reserve: available ₹${(beforeAvailable / 100).toFixed(2)}, requested ₹${(amount / 100).toFixed(2)}`);
    const afterAvailable = beforeAvailable - amount;
    const afterReserved = beforeReserved + amount;
    const updateRes = await client.query('UPDATE wallets SET available_balance = $2, reserved_balance = $3, version = version + 1, updated_at = NOW() WHERE id = $1 RETURNING *', [wallet.id, afterAvailable, afterReserved]);
    const ledgerId = `ledg_${crypto.randomUUID()}`;
    const ledgerRes = await client.query(
      `INSERT INTO wallet_ledger (id, user_id, wallet_id, type, amount, direction, reference_type, reference_id, balance_before, balance_after, status, idempotency_key, metadata, created_at)
       VALUES ($1, $2, $3, 'WITHDRAW_RESERVE', $4, 'DEBIT', $5, $6, $7, $8, 'COMPLETED', $9, $10, NOW()) RETURNING *`,
      [ledgerId, uId, wallet.id, amount, referenceType, referenceId, beforeAvailable, afterAvailable, idempotencyKey, JSON.stringify(metadata)]
    );
    return { wallet: updateRes.rows[0], ledger: ledgerRes.rows[0] };
  });
}

async function releaseReservedFunds(clientOrUserId, amountPaise, options = {}) {
  const amount = parseInt(amountPaise, 10);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Release amount must be a positive integer in paise');
  const { referenceType = 'WITHDRAWAL', referenceId = null, idempotencyKey = null, metadata = {} } = options;
  return await withTransaction(clientOrUserId, async (client, userId) => {
    const uId = userId || options.userId;
    if (!uId) throw new Error('userId is required for releaseReservedFunds');
    await assertIdempotencyConflict(client, idempotencyKey, uId);
    const existing = await checkIdempotency(client, idempotencyKey, uId, referenceType, referenceId);
    if (existing) return { duplicate: true, ledger: existing };
    const wallet = await lockWallet(client, uId);
    const beforeAvailable = parseInt(wallet.available_balance || 0, 10);
    const beforeReserved = parseInt(wallet.reserved_balance || 0, 10);
    if (beforeReserved < amount) throw new Error(`Cannot release funds: reserved balance ₹${(beforeReserved / 100).toFixed(2)} is less than requested ₹${(amount / 100).toFixed(2)}`);
    const afterAvailable = beforeAvailable + amount;
    const afterReserved = beforeReserved - amount;
    const updateRes = await client.query('UPDATE wallets SET available_balance = $2, reserved_balance = $3, version = version + 1, updated_at = NOW() WHERE id = $1 RETURNING *', [wallet.id, afterAvailable, afterReserved]);
    const ledgerId = `ledg_${crypto.randomUUID()}`;
    const ledgerRes = await client.query(
      `INSERT INTO wallet_ledger (id, user_id, wallet_id, type, amount, direction, reference_type, reference_id, balance_before, balance_after, status, idempotency_key, metadata, created_at)
       VALUES ($1, $2, $3, 'WITHDRAW_RELEASE', $4, 'CREDIT', $5, $6, $7, $8, 'COMPLETED', $9, $10, NOW()) RETURNING *`,
      [ledgerId, uId, wallet.id, amount, referenceType, referenceId, beforeAvailable, afterAvailable, idempotencyKey, JSON.stringify(metadata)]
    );
    return { wallet: updateRes.rows[0], ledger: ledgerRes.rows[0] };
  });
}

async function finalizeReservedFunds(clientOrUserId, amountPaise, options = {}) {
  const amount = parseInt(amountPaise, 10);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Finalize amount must be a positive integer in paise');
  const { referenceType = 'WITHDRAWAL', referenceId = null, idempotencyKey = null, metadata = {} } = options;
  return await withTransaction(clientOrUserId, async (client, userId) => {
    const uId = userId || options.userId;
    if (!uId) throw new Error('userId is required for finalizeReservedFunds');
    await assertIdempotencyConflict(client, idempotencyKey, uId);
    const existing = await checkIdempotency(client, idempotencyKey, uId, referenceType, referenceId);
    if (existing) return { duplicate: true, ledger: existing };
    const wallet = await lockWallet(client, uId);
    const beforeReserved = parseInt(wallet.reserved_balance || 0, 10);
    const currentAvailable = parseInt(wallet.available_balance || 0, 10);
    if (beforeReserved < amount) throw new Error(`Cannot finalize funds: reserved balance ₹${(beforeReserved / 100).toFixed(2)} is less than requested ₹${(amount / 100).toFixed(2)}`);
    const afterReserved = beforeReserved - amount;
    const updateRes = await client.query('UPDATE wallets SET reserved_balance = $2, version = version + 1, updated_at = NOW() WHERE id = $1 RETURNING *', [wallet.id, afterReserved]);
    const ledgerId = `ledg_${crypto.randomUUID()}`;
    const ledgerRes = await client.query(
      `INSERT INTO wallet_ledger (id, user_id, wallet_id, type, amount, direction, reference_type, reference_id, balance_before, balance_after, status, idempotency_key, metadata, created_at)
       VALUES ($1, $2, $3, 'WITHDRAW_FINALIZE', $4, 'DEBIT', $5, $6, $7, $7, 'COMPLETED', $8, $9, NOW()) RETURNING *`,
      [ledgerId, uId, wallet.id, amount, referenceType, referenceId, currentAvailable, idempotencyKey, JSON.stringify(metadata)]
    );
    return { wallet: updateRes.rows[0], ledger: ledgerRes.rows[0] };
  });
}

module.exports = { creditWallet, debitWallet, reserveFunds, releaseReservedFunds, finalizeReservedFunds, lockWallet, withTransaction };
