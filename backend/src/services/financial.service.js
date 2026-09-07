const { getClient } = require('../database/db');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Execute callback within PostgreSQL Transaction with atomic client management.
 * If client is supplied, reuses existing transaction.
 * Otherwise, acquires client, manages BEGIN/COMMIT/ROLLBACK and releases client.
 */
async function withTransaction(clientOrUserId, callback) {
  if (typeof clientOrUserId !== 'string' && clientOrUserId && typeof clientOrUserId.query === 'function') {
    // Client already provided, execute within caller's transaction
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

/**
 * Lock or Create Wallet Row for User
 */
async function lockWallet(client, userId) {
  const res = await client.query(
    'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
    [userId]
  );
  let wallet = res.rows[0];
  if (!wallet) {
    const walletId = `wlt_${userId}`;
    const insertRes = await client.query(
      `INSERT INTO wallets (id, user_id, available_balance, reserved_balance, deposit_balance, winnings_balance, rewards_balance, locked_balance, version, created_at, updated_at)
       VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 1, NOW(), NOW())
       RETURNING *`,
      [walletId, userId]
    );
    wallet = insertRes.rows[0];
  }
  return wallet;
}

/**
 * Check if Idempotency Key has already been processed
 */
async function checkIdempotency(client, idempotencyKey) {
  if (!idempotencyKey) return null;
  const res = await client.query(
    'SELECT * FROM wallet_ledger WHERE idempotency_key = $1',
    [idempotencyKey]
  );
  return res.rows[0] || null;
}

/**
 * 1. Credit Wallet (Atomic PostgreSQL Transaction)
 */
async function creditWallet(clientOrUserId, amountPaise, options = {}) {
  const amount = parseInt(amountPaise, 10);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Credit amount must be a positive integer in paise');
  }

  const {
    type = 'CREDIT',
    referenceType = 'DEPOSIT',
    referenceId = null,
    idempotencyKey = null,
    metadata = {},
  } = options;

  return await withTransaction(clientOrUserId, async (client, userId) => {
    const uId = userId || options.userId;
    if (!uId) throw new Error('userId is required for creditWallet');

    if (idempotencyKey) {
      const existing = await checkIdempotency(client, idempotencyKey);
      if (existing) {
        logger.info('idempotencyKey hit in creditWallet', { idempotencyKey });
        return { duplicate: true, ledger: existing };
      }
    }

    const wallet = await lockWallet(client, uId);
    const beforeBalance = parseInt(wallet.available_balance || 0, 10);
    const afterBalance = beforeBalance + amount;

    // Update wallet available_balance and version
    const updateRes = await client.query(
      `UPDATE wallets 
       SET available_balance = $2,
           deposit_balance = deposit_balance + $3,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [wallet.id, afterBalance, amount]
    );

    const updatedWallet = updateRes.rows[0];
    const ledgerId = `ledg_${crypto.randomUUID()}`;
    const ledgerRes = await client.query(
      `INSERT INTO wallet_ledger 
       (id, user_id, wallet_id, type, amount, direction, reference_type, reference_id, before_balance, after_balance, status, idempotency_key, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, 'CREDIT', $6, $7, $8, $9, 'COMPLETED', $10, $11, NOW())
       RETURNING *`,
      [ledgerId, uId, wallet.id, type, amount, referenceType, referenceId, beforeBalance, afterBalance, idempotencyKey, JSON.stringify(metadata)]
    );

    return {
      wallet: updatedWallet,
      ledger: ledgerRes.rows[0],
    };
  });
}

/**
 * 2. Debit Wallet (Atomic PostgreSQL Transaction)
 */
async function debitWallet(clientOrUserId, amountPaise, options = {}) {
  const amount = parseInt(amountPaise, 10);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Debit amount must be a positive integer in paise');
  }

  const {
    type = 'DEBIT',
    referenceType = 'GAME_BET',
    referenceId = null,
    idempotencyKey = null,
    metadata = {},
  } = options;

  return await withTransaction(clientOrUserId, async (client, userId) => {
    const uId = userId || options.userId;
    if (!uId) throw new Error('userId is required for debitWallet');

    if (idempotencyKey) {
      const existing = await checkIdempotency(client, idempotencyKey);
      if (existing) {
        logger.info('idempotencyKey hit in debitWallet', { idempotencyKey });
        return { duplicate: true, ledger: existing };
      }
    }

    const wallet = await lockWallet(client, uId);
    const beforeBalance = parseInt(wallet.available_balance || 0, 10);

    if (beforeBalance < amount) {
      throw new Error(`Insufficient funds: available balance ₹${(beforeBalance / 100).toFixed(2)}, requested ₹${(amount / 100).toFixed(2)}`);
    }

    const afterBalance = beforeBalance - amount;

    const updateRes = await client.query(
      `UPDATE wallets 
       SET available_balance = $2,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [wallet.id, afterBalance]
    );

    const updatedWallet = updateRes.rows[0];
    const ledgerId = `ledg_${crypto.randomUUID()}`;
    const ledgerRes = await client.query(
      `INSERT INTO wallet_ledger 
       (id, user_id, wallet_id, type, amount, direction, reference_type, reference_id, before_balance, after_balance, status, idempotency_key, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, 'DEBIT', $6, $7, $8, $9, 'COMPLETED', $10, $11, NOW())
       RETURNING *`,
      [ledgerId, uId, wallet.id, type, amount, referenceType, referenceId, beforeBalance, afterBalance, idempotencyKey, JSON.stringify(metadata)]
    );

    return {
      wallet: updatedWallet,
      ledger: ledgerRes.rows[0],
    };
  });
}

/**
 * 3. Reserve Funds for Withdrawal / Pending Operations (Atomic)
 */
async function reserveFunds(clientOrUserId, amountPaise, options = {}) {
  const amount = parseInt(amountPaise, 10);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Reserve amount must be a positive integer in paise');
  }

  const {
    referenceType = 'WITHDRAWAL',
    referenceId = null,
    idempotencyKey = null,
    metadata = {},
  } = options;

  return await withTransaction(clientOrUserId, async (client, userId) => {
    const uId = userId || options.userId;
    if (!uId) throw new Error('userId is required for reserveFunds');

    if (idempotencyKey) {
      const existing = await checkIdempotency(client, idempotencyKey);
      if (existing) {
        logger.info('idempotencyKey hit in reserveFunds', { idempotencyKey });
        return { duplicate: true, ledger: existing };
      }
    }

    const wallet = await lockWallet(client, uId);
    const beforeAvailable = parseInt(wallet.available_balance || 0, 10);
    const beforeReserved = parseInt(wallet.reserved_balance || 0, 10);

    if (beforeAvailable < amount) {
      throw new Error(`Insufficient funds to reserve: available ₹${(beforeAvailable / 100).toFixed(2)}, requested ₹${(amount / 100).toFixed(2)}`);
    }

    const afterAvailable = beforeAvailable - amount;
    const afterReserved = beforeReserved + amount;

    const updateRes = await client.query(
      `UPDATE wallets 
       SET available_balance = $2,
           reserved_balance = $3,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [wallet.id, afterAvailable, afterReserved]
    );

    const updatedWallet = updateRes.rows[0];
    const ledgerId = `ledg_${crypto.randomUUID()}`;
    const ledgerRes = await client.query(
      `INSERT INTO wallet_ledger 
       (id, user_id, wallet_id, type, amount, direction, reference_type, reference_id, before_balance, after_balance, status, idempotency_key, metadata, created_at)
       VALUES ($1, $2, $3, 'WITHDRAW_RESERVE', $4, 'DEBIT', $5, $6, $7, $8, 'COMPLETED', $9, $10, NOW())
       RETURNING *`,
      [ledgerId, uId, wallet.id, amount, referenceType, referenceId, beforeAvailable, afterAvailable, idempotencyKey, JSON.stringify(metadata)]
    );

    return {
      wallet: updatedWallet,
      ledger: ledgerRes.rows[0],
    };
  });
}

/**
 * 4. Release Reserved Funds (Withdrawal Rejection / Refund) (Atomic)
 */
async function releaseReservedFunds(clientOrUserId, amountPaise, options = {}) {
  const amount = parseInt(amountPaise, 10);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Release amount must be a positive integer in paise');
  }

  const {
    referenceType = 'WITHDRAWAL',
    referenceId = null,
    idempotencyKey = null,
    metadata = {},
  } = options;

  return await withTransaction(clientOrUserId, async (client, userId) => {
    const uId = userId || options.userId;
    if (!uId) throw new Error('userId is required for releaseReservedFunds');

    if (idempotencyKey) {
      const existing = await checkIdempotency(client, idempotencyKey);
      if (existing) {
        logger.info('idempotencyKey hit in releaseReservedFunds', { idempotencyKey });
        return { duplicate: true, ledger: existing };
      }
    }

    const wallet = await lockWallet(client, uId);
    const beforeAvailable = parseInt(wallet.available_balance || 0, 10);
    const beforeReserved = parseInt(wallet.reserved_balance || 0, 10);

    if (beforeReserved < amount) {
      throw new Error(`Cannot release funds: reserved balance ₹${(beforeReserved / 100).toFixed(2)} is less than requested ₹${(amount / 100).toFixed(2)}`);
    }

    const afterAvailable = beforeAvailable + amount;
    const afterReserved = beforeReserved - amount;

    const updateRes = await client.query(
      `UPDATE wallets 
       SET available_balance = $2,
           reserved_balance = $3,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [wallet.id, afterAvailable, afterReserved]
    );

    const updatedWallet = updateRes.rows[0];
    const ledgerId = `ledg_${crypto.randomUUID()}`;
    const ledgerRes = await client.query(
      `INSERT INTO wallet_ledger 
       (id, user_id, wallet_id, type, amount, direction, reference_type, reference_id, before_balance, after_balance, status, idempotency_key, metadata, created_at)
       VALUES ($1, $2, $3, 'WITHDRAW_RELEASE', $4, 'CREDIT', $5, $6, $7, $8, 'COMPLETED', $9, $10, NOW())
       RETURNING *`,
      [ledgerId, uId, wallet.id, amount, referenceType, referenceId, beforeAvailable, afterAvailable, idempotencyKey, JSON.stringify(metadata)]
    );

    return {
      wallet: updatedWallet,
      ledger: ledgerRes.rows[0],
    };
  });
}

/**
 * 5. Finalize Reserved Funds (Withdrawal Completion) (Atomic)
 */
async function finalizeReservedFunds(clientOrUserId, amountPaise, options = {}) {
  const amount = parseInt(amountPaise, 10);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Finalize amount must be a positive integer in paise');
  }

  const {
    referenceType = 'WITHDRAWAL',
    referenceId = null,
    idempotencyKey = null,
    metadata = {},
  } = options;

  return await withTransaction(clientOrUserId, async (client, userId) => {
    const uId = userId || options.userId;
    if (!uId) throw new Error('userId is required for finalizeReservedFunds');

    if (idempotencyKey) {
      const existing = await checkIdempotency(client, idempotencyKey);
      if (existing) {
        logger.info('idempotencyKey hit in finalizeReservedFunds', { idempotencyKey });
        return { duplicate: true, ledger: existing };
      }
    }

    const wallet = await lockWallet(client, uId);
    const beforeReserved = parseInt(wallet.reserved_balance || 0, 10);
    const currentAvailable = parseInt(wallet.available_balance || 0, 10);

    if (beforeReserved < amount) {
      throw new Error(`Cannot finalize funds: reserved balance ₹${(beforeReserved / 100).toFixed(2)} is less than requested ₹${(amount / 100).toFixed(2)}`);
    }

    const afterReserved = beforeReserved - amount;

    const updateRes = await client.query(
      `UPDATE wallets 
       SET reserved_balance = $2,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [wallet.id, afterReserved]
    );

    const updatedWallet = updateRes.rows[0];
    const ledgerId = `ledg_${crypto.randomUUID()}`;
    const ledgerRes = await client.query(
      `INSERT INTO wallet_ledger 
       (id, user_id, wallet_id, type, amount, direction, reference_type, reference_id, before_balance, after_balance, status, idempotency_key, metadata, created_at)
       VALUES ($1, $2, $3, 'WITHDRAW_FINALIZE', $4, 'DEBIT', $5, $6, $7, $7, 'COMPLETED', $8, $9, NOW())
       RETURNING *`,
      [ledgerId, uId, wallet.id, amount, referenceType, referenceId, currentAvailable, idempotencyKey, JSON.stringify(metadata)]
    );

    return {
      wallet: updatedWallet,
      ledger: ledgerRes.rows[0],
    };
  });
}

module.exports = {
  creditWallet,
  debitWallet,
  reserveFunds,
  releaseReservedFunds,
  finalizeReservedFunds,
  lockWallet,
  withTransaction,
};
