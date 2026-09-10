const crypto = require('crypto');
const { query, getClient } = require('../database/db');
const config = require('../config/env');
const logger = require('../utils/logger');
const financialService = require('../services/financial.service');

async function createDepositOrder({ userId, amountRupees, paymentMethod = 'UPI' }) {
  const amountRupeeNum = parseFloat(amountRupees);
  if (!Number.isFinite(amountRupeeNum) || amountRupeeNum <= 0) throw new Error('Valid deposit amount is required');
  const minRupees = config.deposit.minAmountRupees;
  const maxRupees = config.deposit.maxAmountRupees;
  if (amountRupeeNum < minRupees || amountRupeeNum > maxRupees) throw new Error(`Deposit amount must be between ₹${minRupees} and ₹${maxRupees}`);
  const amountPaise = Math.round(amountRupeeNum * 100);
  const depositId = `DEP_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const id = `dep_${crypto.randomUUID()}`;
  try {
    const res = await query(`INSERT INTO deposits (id, deposit_id, user_id, amount, currency, status, payment_method, created_at, updated_at) VALUES ($1, $2, $3, $4, 'INR', 'PENDING', $5, NOW(), NOW()) RETURNING *`, [id, depositId, userId, amountPaise, paymentMethod]);
    const row = res.rows[0];
    const upiId = config.deposit.upiId;
    const merchantName = config.deposit.merchantName;
    const qrData = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${(amountPaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(depositId)}`;
    logger.info('Created PENDING deposit order in PostgreSQL DB', { userId, depositId, amountPaise });
    return { id: row.id, depositId: row.deposit_id, userId: row.user_id, amountRupees: amountPaise / 100, amountPaise, currency: row.currency, status: row.status, paymentMethod: row.payment_method, upiId, merchantName, qrData, instructions: ['Open any UPI app (GPay, PhonePe, Paytm, BHIM)', 'Scan QR or pay to UPI ID: ' + upiId, 'Enter exact amount ₹' + (amountPaise / 100).toFixed(2), 'Copy 12-digit UTR/Ref number from receipt', 'Submit UTR on next screen for manual admin verification'], createdAt: row.created_at };
  } catch (err) { logger.error('Failed to create deposit order in PostgreSQL', { userId, error: err.message }); throw err; }
}

async function getDepositById(depositId, userId = null) {
  let sql = 'SELECT * FROM deposits WHERE (deposit_id = $1 OR id = $1)';
  const params = [depositId];
  if (userId) { sql += ' AND user_id = $2'; params.push(userId); }
  try {
    const res = await query(sql, params);
    return res.rows[0] || null;
  } catch (err) { logger.error('Failed to fetch deposit from PostgreSQL DB', { depositId, error: err.message }); throw err; }
}

async function submitDepositUtr({ depositId, userId, utr }) {
  if (!utr || typeof utr !== 'string' || !/^\d{12}$/.test(utr.trim())) { const err = new Error('Invalid UTR format. UTR must be exactly 12 numeric digits.'); err.statusCode = 400; throw err; }
  const cleanUtr = utr.trim();
  const deposit = await getDepositById(depositId, userId);
  if (!deposit) { const err = new Error('Deposit order not found'); err.statusCode = 404; throw err; }
  if (deposit.status !== 'PENDING') { const err = new Error(`Cannot submit UTR. Deposit order is in status ${deposit.status}`); err.statusCode = 400; throw err; }
  try {
    const res = await query(`UPDATE deposits SET utr = $1, status = 'UTR_SUBMITTED', submitted_at = NOW(), updated_at = NOW() WHERE (deposit_id = $2 OR id = $2) AND user_id = $3 AND status = 'PENDING' RETURNING *`, [cleanUtr, depositId, userId]);
    if (res.rows.length === 0) { const err = new Error('Deposit order status changed or not found'); err.statusCode = 400; throw err; }
    const row = res.rows[0];
    return { id: row.id, depositId: row.deposit_id, userId: row.user_id, amountRupees: row.amount / 100, amountPaise: row.amount, currency: row.currency, status: row.status, utr: row.utr, submittedAt: row.submitted_at, paymentMethod: row.payment_method, message: 'UTR submitted successfully. Pending admin manual verification.' };
  } catch (err) {
    if (err.code === '23505') { const dupErr = new Error('UTR / Reference ID has already been submitted for another deposit.'); dupErr.statusCode = 409; throw dupErr; }
    throw err;
  }
}

async function getPendingDepositsForAdmin({ limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  const res = await query(`SELECT d.*, u.phone as user_phone, u.username as user_username FROM deposits d LEFT JOIN users u ON d.user_id = u.id WHERE d.status IN ('UTR_SUBMITTED', 'PENDING') ORDER BY d.created_at DESC LIMIT $1 OFFSET $2`, [safeLimit, safeOffset]);
  return res.rows.map((row) => ({ id: row.id, depositId: row.deposit_id, userId: row.user_id, userPhone: row.user_phone, userUsername: row.user_username, amountRupees: parseInt(row.amount, 10) / 100, amountPaise: parseInt(row.amount, 10), currency: row.currency, status: row.status, utr: row.utr, submittedAt: row.submitted_at, createdAt: row.created_at }));
}

async function confirmDepositByAdmin({ depositId, adminId = 'admin_sys', adminNote = '' }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const findRes = await client.query(`SELECT * FROM deposits WHERE deposit_id = $1 OR id = $1 FOR UPDATE`, [depositId]);
    if (!findRes.rows.length) { const err = new Error('Deposit order not found'); err.statusCode = 404; throw err; }
    const deposit = findRes.rows[0];
    if (deposit.status === 'CONFIRMED') { const err = new Error('Deposit order is already CONFIRMED. Cannot double credit.'); err.statusCode = 400; throw err; }
    if (['REJECTED', 'EXPIRED'].includes(deposit.status)) { const err = new Error(`Cannot confirm deposit in ${deposit.status} status`); err.statusCode = 400; throw err; }
    if (deposit.status !== 'UTR_SUBMITTED' || !deposit.utr) { const err = new Error('Cannot confirm deposit until a valid UTR has been submitted.'); err.statusCode = 409; err.code = 'UTR_REQUIRED'; throw err; }
    const amountPaise = parseInt(deposit.amount, 10);
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) { const err = new Error('Deposit has an invalid amount and cannot be confirmed.'); err.statusCode = 409; throw err; }
    const creditResult = await financialService.creditWallet(client, amountPaise, { userId: deposit.user_id, type: 'DEPOSIT', referenceType: 'DEPOSIT', referenceId: deposit.deposit_id, idempotencyKey: `DEPOSIT_CONFIRM:${deposit.deposit_id}`, metadata: { adminId, adminNote, utr: deposit.utr, depositRowId: deposit.id } });
    if (creditResult && creditResult.duplicate) { const err = new Error('Deposit confirmation already recorded in ledger but deposit was not CONFIRMED. Manual reconciliation required.'); err.statusCode = 409; throw err; }
    const updateRes = await client.query(`UPDATE deposits SET status = 'CONFIRMED', confirmed_at = NOW(), admin_id = $2, admin_note = $3, updated_at = NOW() WHERE id = $1 AND status = 'UTR_SUBMITTED' RETURNING *`, [deposit.id, adminId, adminNote]);
    if (!updateRes.rows.length) { const err = new Error('Deposit status changed before confirmation.'); err.statusCode = 409; throw err; }
    await client.query('COMMIT');
    const row = updateRes.rows[0];
    return { id: row.id, depositId: row.deposit_id, userId: row.user_id, amountRupees: row.amount / 100, amountPaise: row.amount, status: row.status, utr: row.utr, confirmedAt: row.confirmed_at, adminId: row.admin_id, adminNote: row.admin_note, updatedWallet: { totalBalance: (parseInt(creditResult.wallet.available_balance, 10) + parseInt(creditResult.wallet.reserved_balance, 10)) / 100, availableBalance: parseInt(creditResult.wallet.available_balance, 10) / 100 } };
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function processPaymentWebhook({ provider, eventId, payloadHash, depositId, status, amountPaise, currency = 'INR', utr = null }) {
  if (!provider || !eventId || !payloadHash || !depositId) { const err = new Error('Invalid payment webhook event.'); err.statusCode = 400; throw err; }
  const normalizedStatus = String(status || '').toUpperCase();
  if (!['SUCCESS', 'PAID', 'CONFIRMED'].includes(normalizedStatus)) { const err = new Error('Unsupported payment event status.'); err.statusCode = 400; throw err; }
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) { const err = new Error('Webhook amount must be a positive integer number of paise.'); err.statusCode = 400; throw err; }
  if (currency !== 'INR') { const err = new Error('Unsupported payment currency.'); err.statusCode = 400; throw err; }
  const cleanUtr = utr == null ? null : String(utr).trim();
  if (!cleanUtr || !/^\d{12}$/.test(cleanUtr)) { const err = new Error('Webhook UTR must be exactly 12 numeric digits.'); err.statusCode = 400; throw err; }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const eventInsert = await client.query(`INSERT INTO payment_webhook_events (id, provider, event_id, payload_hash, status, deposit_id, created_at, processed_at) VALUES ($1,$2,$3,$4,'PROCESSED',$5,NOW(),NOW()) ON CONFLICT (event_id) DO NOTHING RETURNING id`, [`pwe_${crypto.randomUUID()}`, provider, eventId, payloadHash, depositId]);
    if (!eventInsert.rows.length) {
      const existing = await client.query('SELECT payload_hash, status, deposit_id FROM payment_webhook_events WHERE event_id = $1 FOR UPDATE', [eventId]);
      const row = existing.rows[0];
      if (!row || row.payload_hash !== payloadHash) { const err = new Error('Webhook event ID was already used with a different payload.'); err.statusCode = 409; err.code = 'WEBHOOK_REPLAY_MISMATCH'; throw err; }
      await client.query('COMMIT');
      return { duplicate: true, depositId: row.deposit_id, status: row.status };
    }

    const findRes = await client.query(`SELECT * FROM deposits WHERE deposit_id = $1 OR id = $1 FOR UPDATE`, [depositId]);
    if (!findRes.rows.length) { const err = new Error('Deposit order not found.'); err.statusCode = 404; throw err; }
    const deposit = findRes.rows[0];
    if (parseInt(deposit.amount, 10) !== amountPaise || deposit.currency !== currency) { const err = new Error('Webhook amount or currency does not match deposit order.'); err.statusCode = 409; err.code = 'PAYMENT_MISMATCH'; throw err; }
    if (deposit.status === 'CONFIRMED') { await client.query('COMMIT'); return { duplicate: true, depositId: deposit.deposit_id, status: deposit.status }; }
    if (!['PENDING', 'UTR_SUBMITTED'].includes(deposit.status)) { const err = new Error(`Cannot confirm deposit in ${deposit.status} status.`); err.statusCode = 409; throw err; }
    if (deposit.utr && deposit.utr !== cleanUtr) { const err = new Error('Webhook UTR does not match submitted UTR.'); err.statusCode = 409; err.code = 'PAYMENT_MISMATCH'; throw err; }

    const creditResult = await financialService.creditWallet(client, amountPaise, { userId: deposit.user_id, type: 'DEPOSIT', referenceType: 'DEPOSIT', referenceId: deposit.deposit_id, idempotencyKey: `DEPOSIT_WEBHOOK:${provider}:${eventId}`, metadata: { provider, eventId, payloadHash, utr: cleanUtr, depositRowId: deposit.id } });
    if (creditResult && creditResult.duplicate) { const err = new Error('Payment webhook ledger entry already exists but deposit is not confirmed. Manual reconciliation required.'); err.statusCode = 409; throw err; }
    const updateRes = await client.query(`UPDATE deposits SET utr = COALESCE(utr, $2), status = 'CONFIRMED', confirmed_at = NOW(), updated_at = NOW() WHERE id = $1 AND status IN ('PENDING','UTR_SUBMITTED') RETURNING *`, [deposit.id, cleanUtr]);
    if (!updateRes.rows.length) { const err = new Error('Deposit state changed during webhook processing.'); err.statusCode = 409; throw err; }
    await client.query('COMMIT');
    return { duplicate: false, depositId: deposit.deposit_id, status: 'CONFIRMED' };
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function rejectDepositByAdmin({ depositId, adminId = 'admin_sys', adminNote = '' }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const findRes = await client.query(`SELECT * FROM deposits WHERE deposit_id = $1 OR id = $1 FOR UPDATE`, [depositId]);
    if (!findRes.rows.length) { const err = new Error('Deposit order not found'); err.statusCode = 404; throw err; }
    const deposit = findRes.rows[0];
    if (deposit.status === 'CONFIRMED') { const err = new Error('Cannot reject an already CONFIRMED deposit'); err.statusCode = 400; throw err; }
    if (deposit.status === 'REJECTED') { const err = new Error('Deposit order is already REJECTED'); err.statusCode = 400; throw err; }
    const res = await client.query(`UPDATE deposits SET status = 'REJECTED', rejected_at = NOW(), admin_id = $2, admin_note = $3, updated_at = NOW() WHERE id = $1 RETURNING *`, [deposit.id, adminId, adminNote]);
    await client.query('COMMIT');
    const row = res.rows[0];
    return { id: row.id, depositId: row.deposit_id, userId: row.user_id, amountRupees: parseInt(row.amount, 10) / 100, amountPaise: parseInt(row.amount, 10), status: row.status, utr: row.utr, rejectedAt: row.rejected_at, adminId: row.admin_id, adminNote: row.admin_note };
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

module.exports = { createDepositOrder, getDepositById, submitDepositUtr, getPendingDepositsForAdmin, confirmDepositByAdmin, processPaymentWebhook, rejectDepositByAdmin };
