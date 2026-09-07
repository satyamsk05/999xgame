const crypto = require('crypto');
const { query, getClient } = require('../database/db');
const config = require('../config/env');
const logger = require('../utils/logger');
const financialService = require('../services/financial.service');

/**
 * Create Withdrawal Request in PostgreSQL (Initial Status: PENDING)
 * Funds are ATOMICALLY reserved from available_balance -> reserved_balance.
 */
async function createWithdrawalRequest({ userId, amountRupees, upiId }) {
  const amountRupeeNum = parseFloat(amountRupees);
  if (isNaN(amountRupeeNum) || amountRupeeNum <= 0) {
    const err = new Error('Valid numeric withdrawal amount is required');
    err.statusCode = 400;
    throw err;
  }

  const minRupees = config.withdrawal.minAmountRupees || 100;
  const maxRupees = config.withdrawal.maxAmountRupees || 50000;

  if (amountRupeeNum < minRupees || amountRupeeNum > maxRupees) {
    const err = new Error(`Withdrawal amount must be between ₹${minRupees} and ₹${maxRupees}`);
    err.statusCode = 400;
    throw err;
  }

  if (!upiId || typeof upiId !== 'string' || !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim())) {
    const err = new Error('Invalid UPI ID format (e.g. username@bank)');
    err.statusCode = 400;
    throw err;
  }

  const cleanUpi = upiId.trim();
  const amountPaise = Math.round(amountRupeeNum * 100);
  const withdrawalId = `WDR_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const id = `wdr_${crypto.randomUUID()}`;

  // 1. Execute Atomic Financial Reservation in PostgreSQL
  let reserveResult;
  try {
    reserveResult = await financialService.reserveFunds(userId, amountPaise, {
      referenceType: 'WITHDRAWAL',
      referenceId: withdrawalId,
      idempotencyKey: `idemp_wdr_${withdrawalId}`,
      metadata: { upiId: cleanUpi },
    });
  } catch (err) {
    if (err.message && (err.message.includes('Insufficient funds') || err.message.includes('Insufficient available balance'))) {
      const resErr = new Error(err.message || 'Insufficient available balance for withdrawal');
      resErr.statusCode = 400;
      throw resErr;
    }
    throw err;
  }

  // 2. Record Withdrawal Request in PostgreSQL DB
  try {
    const res = await query(
      `INSERT INTO withdrawals (id, withdrawal_id, user_id, amount, currency, status, payout_method, payout_address_or_upi, upi_id, requested_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'INR', 'PENDING', 'UPI', $5, $5, NOW(), NOW(), NOW())
       RETURNING *`,
      [id, withdrawalId, userId, amountPaise, cleanUpi]
    );

    const row = res.rows[0];
    logger.info('Created PENDING withdrawal request & reserved funds in PostgreSQL', {
      userId,
      withdrawalId: row.withdrawal_id,
      amountPaise,
      upiId: cleanUpi,
    });

    const availPaise = parseInt(reserveResult.wallet.available_balance, 10);
    const resvPaise = parseInt(reserveResult.wallet.reserved_balance, 10);

    return {
      id: row.id,
      withdrawalId: row.withdrawal_id,
      userId: row.user_id,
      amountRupees: amountPaise / 100,
      amountPaise,
      currency: row.currency,
      status: row.status, // Strictly 'PENDING'
      payoutMethod: row.payout_method,
      upiId: row.payout_address_or_upi,
      requestedAt: row.requested_at,
      createdAt: row.created_at,
      reservedWallet: {
        totalBalance: (availPaise + resvPaise) / 100,
        availableBalance: availPaise / 100,
        reservedBalance: resvPaise / 100,
      },
    };
  } catch (err) {
    logger.error('Failed to record withdrawal request in PostgreSQL', { userId, error: err.message });
    throw err;
  }
}

/**
 * Get Withdrawal Request by ID or withdrawal_id
 */
async function getWithdrawalById(withdrawalId, userId = null) {
  try {
    let sql = 'SELECT * FROM withdrawals WHERE (withdrawal_id = $1 OR id = $1)';
    const params = [withdrawalId];
    if (userId) {
      sql += ' AND user_id = $2';
      params.push(userId);
    }

    const res = await query(sql, params);
    if (res.rows.length === 0) return null;
    return res.rows[0];
  } catch (err) {
    logger.error('Failed to fetch withdrawal from PostgreSQL DB', { withdrawalId, error: err.message });
    throw err;
  }
}

/**
 * Admin: Fetch pending withdrawal requests
 */
async function getPendingWithdrawalsForAdmin({ limit = 50, offset = 0 } = {}) {
  try {
    const res = await query(
      `SELECT w.*, u.phone as user_phone, u.username as user_username
       FROM withdrawals w
       LEFT JOIN users u ON w.user_id = u.id
       WHERE w.status IN ('PENDING', 'PROCESSING')
       ORDER BY w.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.rows.map((row) => ({
      id: row.id,
      withdrawalId: row.withdrawal_id,
      userId: row.user_id,
      userPhone: row.user_phone,
      userUsername: row.user_username,
      amountRupees: parseInt(row.amount, 10) / 100,
      amountPaise: parseInt(row.amount, 10),
      currency: row.currency,
      status: row.status,
      payoutMethod: row.payout_method,
      upiId: row.payout_address_or_upi,
      requestedAt: row.requested_at,
      createdAt: row.created_at,
    }));
  } catch (err) {
    logger.error('Failed to fetch pending withdrawals for admin', { error: err.message });
    throw err;
  }
}

/**
 * Admin: Confirm Withdrawal Payout & Finalize Reserved Funds (Atomic PostgreSQL Transaction)
 */
async function confirmWithdrawalByAdmin({ withdrawalId, adminId = 'admin_sys', adminNote = '' }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const findRes = await client.query(
      `SELECT * FROM withdrawals WHERE withdrawal_id = $1 OR id = $1 FOR UPDATE`,
      [withdrawalId]
    );

    if (findRes.rows.length === 0) {
      const err = new Error('Withdrawal request not found');
      err.statusCode = 404;
      throw err;
    }

    const withdrawal = findRes.rows[0];

    if (['SUCCESS', 'CONFIRMED'].includes(withdrawal.status)) {
      const err = new Error('Withdrawal request is already SUCCESS / CONFIRMED. Cannot double process.');
      err.statusCode = 400;
      throw err;
    }

    if (withdrawal.status === 'REJECTED') {
      const err = new Error('Cannot confirm a REJECTED withdrawal request');
      err.statusCode = 400;
      throw err;
    }

    const amountPaise = parseInt(withdrawal.amount, 10);

    // Finalize reserved funds
    const finalizeResult = await financialService.finalizeReservedFunds(client, amountPaise, {
      userId: withdrawal.user_id,
      referenceType: 'WITHDRAWAL',
      referenceId: withdrawal.withdrawal_id,
      idempotencyKey: `idemp_confirm_wdr_${withdrawal.withdrawal_id}`,
      metadata: { adminId, adminNote, upiId: withdrawal.payout_address_or_upi },
    });

    const updateRes = await client.query(
      `UPDATE withdrawals
       SET status = 'SUCCESS', completed_at = NOW(), admin_id = $2, admin_note = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [withdrawal.id, adminId, adminNote]
    );

    await client.query('COMMIT');

    const row = updateRes.rows[0];
    logger.info('Admin confirmed withdrawal payout in PostgreSQL', {
      withdrawalId: row.withdrawal_id,
      userId: row.user_id,
      amountPaise,
      adminId,
    });

    const availPaise = parseInt(finalizeResult.wallet.available_balance, 10);
    const resvPaise = parseInt(finalizeResult.wallet.reserved_balance, 10);

    return {
      id: row.id,
      withdrawalId: row.withdrawal_id,
      userId: row.user_id,
      amountRupees: row.amount / 100,
      amountPaise: row.amount,
      status: row.status,
      upiId: row.payout_address_or_upi,
      completedAt: row.completed_at,
      adminId: row.admin_id,
      adminNote: row.admin_note,
      updatedWallet: {
        totalBalance: (availPaise + resvPaise) / 100,
        availableBalance: availPaise / 100,
        reservedBalance: resvPaise / 100,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to confirm withdrawal by admin', { withdrawalId, adminId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Admin: Reject Withdrawal Payout & Release Reserved Funds back to Available (Atomic PostgreSQL Transaction)
 */
async function rejectWithdrawalByAdmin({ withdrawalId, adminId = 'admin_sys', adminNote = '' }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const findRes = await client.query(
      `SELECT * FROM withdrawals WHERE withdrawal_id = $1 OR id = $1 FOR UPDATE`,
      [withdrawalId]
    );

    if (findRes.rows.length === 0) {
      const err = new Error('Withdrawal request not found');
      err.statusCode = 404;
      throw err;
    }

    const withdrawal = findRes.rows[0];

    if (['SUCCESS', 'CONFIRMED'].includes(withdrawal.status)) {
      const err = new Error('Cannot reject an already completed SUCCESS withdrawal');
      err.statusCode = 400;
      throw err;
    }

    if (withdrawal.status === 'REJECTED') {
      const err = new Error('Withdrawal request is already REJECTED');
      err.statusCode = 400;
      throw err;
    }

    const amountPaise = parseInt(withdrawal.amount, 10);

    // Release reserved funds back to available
    const releaseResult = await financialService.releaseReservedFunds(client, amountPaise, {
      userId: withdrawal.user_id,
      referenceType: 'WITHDRAWAL',
      referenceId: withdrawal.withdrawal_id,
      idempotencyKey: `idemp_reject_wdr_${withdrawal.withdrawal_id}`,
      metadata: { adminId, adminNote, upiId: withdrawal.payout_address_or_upi },
    });

    const updateRes = await client.query(
      `UPDATE withdrawals
       SET status = 'REJECTED', rejected_at = NOW(), admin_id = $2, admin_note = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [withdrawal.id, adminId, adminNote]
    );

    await client.query('COMMIT');

    const row = updateRes.rows[0];
    logger.info('Admin rejected withdrawal payout in PostgreSQL', {
      withdrawalId: row.withdrawal_id,
      userId: row.user_id,
      amountPaise,
      adminId,
    });

    const availPaise = parseInt(releaseResult.wallet.available_balance, 10);
    const resvPaise = parseInt(releaseResult.wallet.reserved_balance, 10);

    return {
      id: row.id,
      withdrawalId: row.withdrawal_id,
      userId: row.user_id,
      amountRupees: row.amount / 100,
      amountPaise: row.amount,
      status: row.status,
      upiId: row.payout_address_or_upi,
      rejectedAt: row.rejected_at,
      adminId: row.admin_id,
      adminNote: row.admin_note,
      updatedWallet: {
        totalBalance: (availPaise + resvPaise) / 100,
        availableBalance: availPaise / 100,
        reservedBalance: resvPaise / 100,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to reject withdrawal by admin', { withdrawalId, adminId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Admin: Mark Withdrawal as PROCESSING (Admin started manual payout handling)
 */
async function processWithdrawalByAdmin({ withdrawalId, adminId = 'admin_sys', adminNote = '' }) {
  try {
    const withdrawal = await getWithdrawalById(withdrawalId);
    if (!withdrawal) {
      const err = new Error('Withdrawal request not found');
      err.statusCode = 404;
      throw err;
    }

    if (withdrawal.status !== 'PENDING') {
      const err = new Error(`Cannot start processing. Withdrawal is in status ${withdrawal.status}`);
      err.statusCode = 400;
      throw err;
    }

    const res = await query(
      `UPDATE withdrawals
       SET status = 'PROCESSING', processing_at = NOW(), admin_id = $2, admin_note = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [withdrawal.id, adminId, adminNote]
    );

    const row = res.rows[0];
    logger.info('Admin started processing withdrawal payout in PostgreSQL', {
      withdrawalId: row.withdrawal_id,
      userId: row.user_id,
      adminId,
    });

    return {
      id: row.id,
      withdrawalId: row.withdrawal_id,
      userId: row.user_id,
      amountRupees: row.amount / 100,
      amountPaise: row.amount,
      status: row.status,
      upiId: row.payout_address_or_upi,
      processingAt: row.processing_at,
      adminId: row.admin_id,
      adminNote: row.admin_note,
    };
  } catch (err) {
    logger.error('Failed to process withdrawal by admin', { withdrawalId, adminId, error: err.message });
    throw err;
  }
}

module.exports = {
  createWithdrawalRequest,
  getWithdrawalById,
  getPendingWithdrawalsForAdmin,
  processWithdrawalByAdmin,
  confirmWithdrawalByAdmin,
  rejectWithdrawalByAdmin,
};
