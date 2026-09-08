const crypto = require('crypto');
const { query, getClient } = require('../database/db');
const config = require('../config/env');
const logger = require('../utils/logger');
const financialService = require('../services/financial.service');

/**
 * Create Deposit Order in PostgreSQL (Initial Status: PENDING)
 */
async function createDepositOrder({ userId, amountRupees, paymentMethod = 'UPI' }) {
  const amountRupeeNum = parseFloat(amountRupees);
  if (isNaN(amountRupeeNum) || amountRupeeNum <= 0) {
    throw new Error('Valid deposit amount is required');
  }

  const minRupees = config.deposit.minAmountRupees;
  const maxRupees = config.deposit.maxAmountRupees;

  if (amountRupeeNum < minRupees || amountRupeeNum > maxRupees) {
    throw new Error(`Deposit amount must be between ₹${minRupees} and ₹${maxRupees}`);
  }

  const amountPaise = Math.round(amountRupeeNum * 100);
  const depositId = `DEP_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const id = `dep_${crypto.randomUUID()}`;

  try {
    const res = await query(
      `INSERT INTO deposits (id, deposit_id, user_id, amount, currency, status, payment_method, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'INR', 'PENDING', $5, NOW(), NOW())
       RETURNING *`,
      [id, depositId, userId, amountPaise, paymentMethod]
    );

    const row = res.rows[0];
    const upiId = config.deposit.upiId;
    const merchantName = config.deposit.merchantName;
    const qrData = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${amountRupeeNum.toFixed(2)}&cu=INR&tn=${encodeURIComponent(depositId)}`;

    logger.info('Created PENDING deposit order in PostgreSQL DB', { userId, depositId, amountPaise });

    return {
      id: row.id,
      depositId: row.deposit_id,
      userId: row.user_id,
      amountRupees: amountPaise / 100,
      amountPaise,
      currency: row.currency,
      status: row.status, // Strictly 'PENDING'
      paymentMethod: row.payment_method,
      upiId,
      merchantName,
      qrData,
      instructions: [
        'Open any UPI app (GPay, PhonePe, Paytm, BHIM)',
        'Scan QR or pay to UPI ID: ' + upiId,
        'Enter exact amount ₹' + amountRupeeNum.toFixed(2),
        'Copy 12-digit UTR/Ref number from receipt',
        'Submit UTR on next screen for manual admin verification',
      ],
      createdAt: row.created_at,
    };
  } catch (err) {
    logger.error('Failed to create deposit order in PostgreSQL', { userId, error: err.message });
    throw err;
  }
}

/**
 * Get Deposit Order by Deposit ID or ID
 */
async function getDepositById(depositId, userId = null) {
  try {
    let sql = 'SELECT * FROM deposits WHERE (deposit_id = $1 OR id = $1)';
    const params = [depositId];
    if (userId) {
      sql += ' AND user_id = $2';
      params.push(userId);
    }

    const res = await query(sql, params);
    if (res.rows.length === 0) return null;
    return res.rows[0];
  } catch (err) {
    logger.error('Failed to fetch deposit from PostgreSQL DB', { depositId, error: err.message });
    throw err;
  }
}

/**
 * Submit UTR for Deposit Order (Transitions PENDING -> UTR_SUBMITTED)
 * ZERO auto-credit. Wallet balance is untouched.
 */
async function submitDepositUtr({ depositId, userId, utr }) {
  if (!utr || typeof utr !== 'string' || !/^\d{12}$/.test(utr.trim())) {
    const err = new Error('Invalid UTR format. UTR must be exactly 12 numeric digits.');
    err.statusCode = 400;
    throw err;
  }

  const cleanUtr = utr.trim();

  // 1. Fetch deposit to check current status & ownership
  const deposit = await getDepositById(depositId, userId);
  if (!deposit) {
    const err = new Error('Deposit order not found');
    err.statusCode = 404;
    throw err;
  }

  if (deposit.status !== 'PENDING') {
    const err = new Error(`Cannot submit UTR. Deposit order is in status ${deposit.status}`);
    err.statusCode = 400;
    throw err;
  }

  // 1b. Check if UTR is already used by another deposit
  const existingUtr = await query('SELECT id FROM deposits WHERE utr = $1', [cleanUtr]);
  if (existingUtr.rows.length > 0) {
    const dupErr = new Error('UTR / Reference ID has already been submitted for another deposit.');
    dupErr.statusCode = 409;
    throw dupErr;
  }

  // 2. Perform atomic update in DB
  try {
    const res = await query(
      `UPDATE deposits
       SET utr = $1, status = 'UTR_SUBMITTED', submitted_at = NOW(), updated_at = NOW()
       WHERE (deposit_id = $2 OR id = $2) AND user_id = $3 AND status = 'PENDING'
       RETURNING *`,
      [cleanUtr, depositId, userId]
    );

    if (res.rows.length === 0) {
      const err = new Error('Deposit order status changed or not found');
      err.statusCode = 400;
      throw err;
    }

    const row = res.rows[0];
    logger.info('Submitted UTR for deposit order (Pending Admin Verification)', {
      depositId: row.deposit_id,
      userId: row.user_id,
      utr: cleanUtr,
    });

    return {
      id: row.id,
      depositId: row.deposit_id,
      userId: row.user_id,
      amountRupees: row.amount / 100,
      amountPaise: row.amount,
      currency: row.currency,
      status: row.status, // Strictly 'UTR_SUBMITTED'
      utr: row.utr,
      submittedAt: row.submitted_at,
      paymentMethod: row.payment_method,
      message: 'UTR submitted successfully. Pending admin manual verification.',
    };
  } catch (err) {
    if (err.code === '23505') {
      const dupErr = new Error('UTR / Reference ID has already been submitted for another deposit.');
      dupErr.statusCode = 409;
      throw dupErr;
    }
    logger.error('Failed to submit UTR for deposit', { depositId, userId, error: err.message });
    throw err;
  }
}

/**
 * Admin: Fetch list of deposits pending manual verification (UTR_SUBMITTED or PENDING)
 */
async function getPendingDepositsForAdmin({ limit = 50, offset = 0 } = {}) {
  try {
    const res = await query(
      `SELECT d.*, u.phone as user_phone, u.username as user_username
       FROM deposits d
       LEFT JOIN users u ON d.user_id = u.id
       WHERE d.status IN ('UTR_SUBMITTED', 'PENDING')
       ORDER BY d.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.rows.map((row) => ({
      id: row.id,
      depositId: row.deposit_id,
      userId: row.user_id,
      userPhone: row.user_phone,
      userUsername: row.user_username,
      amountRupees: parseInt(row.amount, 10) / 100,
      amountPaise: parseInt(row.amount, 10),
      currency: row.currency,
      status: row.status,
      utr: row.utr,
      submittedAt: row.submitted_at,
      createdAt: row.created_at,
    }));
  } catch (err) {
    logger.error('Failed to fetch pending deposits for admin', { error: err.message });
    throw err;
  }
}

/**
 * Admin: Confirm Deposit Order and credit user wallet in PostgreSQL (Atomic)
 */
async function confirmDepositByAdmin({ depositId, adminId = 'admin_sys', adminNote = '' }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Lock row FOR UPDATE to prevent race conditions & double credits
    const findRes = await client.query(
      `SELECT * FROM deposits WHERE deposit_id = $1 OR id = $1 FOR UPDATE`,
      [depositId]
    );

    if (findRes.rows.length === 0) {
      const err = new Error('Deposit order not found');
      err.statusCode = 404;
      throw err;
    }

    const deposit = findRes.rows[0];

    if (deposit.status === 'CONFIRMED') {
      const err = new Error('Deposit order is already CONFIRMED. Cannot double credit.');
      err.statusCode = 400;
      throw err;
    }

    if (['REJECTED', 'EXPIRED'].includes(deposit.status)) {
      const err = new Error(`Cannot confirm deposit in ${deposit.status} status`);
      err.statusCode = 400;
      throw err;
    }

    const amountPaise = parseInt(deposit.amount, 10);

    // 2. Execute atomic wallet credit via financial service USING THE SAME CLIENT.
    //    Passing the transactional `client` (not the userId) guarantees the credit
    //    runs inside THIS BEGIN/COMMIT. No separate transaction is opened, so a
    //    wallet credit can never be committed without the deposit being CONFIRMED
    //    (and vice-versa). Deterministic idempotency key prevents double credit.
    const creditResult = await financialService.creditWallet(client, amountPaise, {
      userId: deposit.user_id,
      type: 'DEPOSIT',
      referenceType: 'DEPOSIT',
      referenceId: deposit.deposit_id,
      idempotencyKey: `DEPOSIT_CONFIRM:${deposit.deposit_id}`,
      metadata: { adminId, adminNote, utr: deposit.utr, depositRowId: deposit.id },
    });

    // Fail-safe: if the ledger already recorded this confirmation key while the
    // deposit row was still not CONFIRMED, that is an inconsistent state. Do not
    // silently proceed — abort so the transaction rolls back and it can be audited.
    if (creditResult && creditResult.duplicate) {
      const err = new Error('Deposit confirmation already recorded in ledger but deposit was not CONFIRMED. Manual reconciliation required.');
      err.statusCode = 409;
      throw err;
    }

    // 3. Update deposit status to CONFIRMED
    const updateRes = await client.query(
      `UPDATE deposits
       SET status = 'CONFIRMED', confirmed_at = NOW(), admin_id = $2, admin_note = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [deposit.id, adminId, adminNote]
    );

    await client.query('COMMIT');

    const row = updateRes.rows[0];
    logger.info('Admin confirmed deposit and credited user wallet in PostgreSQL', {
      depositId: row.deposit_id,
      userId: row.user_id,
      amountPaise,
      adminId,
    });

    return {
      id: row.id,
      depositId: row.deposit_id,
      userId: row.user_id,
      amountRupees: row.amount / 100,
      amountPaise: row.amount,
      status: row.status, // Strictly 'CONFIRMED'
      utr: row.utr,
      confirmedAt: row.confirmed_at,
      adminId: row.admin_id,
      adminNote: row.admin_note,
      updatedWallet: {
        totalBalance: (parseInt(creditResult.wallet.available_balance, 10) + parseInt(creditResult.wallet.reserved_balance, 10)) / 100,
        availableBalance: parseInt(creditResult.wallet.available_balance, 10) / 100,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to confirm deposit by admin', { depositId, adminId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Admin: Reject Deposit Order (ZERO wallet credit)
 */
async function rejectDepositByAdmin({ depositId, adminId = 'admin_sys', adminNote = '' }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock the deposit row to eliminate the read-then-update (TOCTOU) race where a
    // concurrent confirm and reject could both proceed.
    const findRes = await client.query(
      `SELECT * FROM deposits WHERE deposit_id = $1 OR id = $1 FOR UPDATE`,
      [depositId]
    );

    if (findRes.rows.length === 0) {
      const err = new Error('Deposit order not found');
      err.statusCode = 404;
      throw err;
    }

    const deposit = findRes.rows[0];

    if (deposit.status === 'CONFIRMED') {
      const err = new Error('Cannot reject an already CONFIRMED deposit');
      err.statusCode = 400;
      throw err;
    }

    if (deposit.status === 'REJECTED') {
      const err = new Error('Deposit order is already REJECTED');
      err.statusCode = 400;
      throw err;
    }

    const res = await client.query(
      `UPDATE deposits
       SET status = 'REJECTED', rejected_at = NOW(), admin_id = $2, admin_note = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [deposit.id, adminId, adminNote]
    );

    await client.query('COMMIT');

    const row = res.rows[0];
    logger.info('Admin rejected deposit order (Zero wallet credit)', {
      depositId: row.deposit_id,
      userId: row.user_id,
      adminId,
    });

    return {
      id: row.id,
      depositId: row.deposit_id,
      userId: row.user_id,
      amountRupees: parseInt(row.amount, 10) / 100,
      amountPaise: parseInt(row.amount, 10),
      status: row.status, // Strictly 'REJECTED'
      utr: row.utr,
      rejectedAt: row.rejected_at,
      adminId: row.admin_id,
      adminNote: row.admin_note,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to reject deposit by admin', { depositId, adminId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createDepositOrder,
  getDepositById,
  submitDepositUtr,
  getPendingDepositsForAdmin,
  confirmDepositByAdmin,
  rejectDepositByAdmin,
};


