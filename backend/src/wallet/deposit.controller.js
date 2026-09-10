const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { signPaymentToken, verifyPaymentToken } = require('../auth/jwt');
const depositRepo = require('./deposit.repository');
const telegramService = require('../services/telegram.service');
const config = require('../config/env');

function verifyWebhookSignature(req) {
  const signature = String(req.get('x-payment-signature') || '').trim().toLowerCase();
  const secret = config.deposit.webhookSecret;
  if (!secret || !signature || !req.rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const supplied = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}

router.post('/webhook', async (req, res, next) => {
  try {
    if (!verifyWebhookSignature(req)) return res.status(401).json({ status: 'error', code: 'INVALID_SIGNATURE', message: 'Invalid payment webhook signature.' });
    const eventId = String(req.get('x-payment-event-id') || req.body?.eventId || '').trim();
    if (!eventId || eventId.length > 150) return res.status(400).json({ status: 'error', code: 'INVALID_EVENT_ID', message: 'A valid payment event ID is required.' });
    const payload = req.body || {};
    const payloadHash = crypto.createHash('sha256').update(req.rawBody).digest('hex');
    const result = await depositRepo.processPaymentWebhook({ provider: String(payload.provider || 'generic').trim().slice(0, 50), eventId, payloadHash, depositId: String(payload.depositId || '').trim(), status: payload.status, amountPaise: Number(payload.amountPaise), currency: String(payload.currency || 'INR').trim().toUpperCase(), utr: payload.utr });
    return res.status(200).json({ status: 'success', duplicate: !!result.duplicate, data: result });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', code: err.code || 'PAYMENT_WEBHOOK_FAILED', message: err.message });
    return next(err);
  }
});

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { amount, paymentMethod } = req.body;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) return res.status(400).json({ status: 'error', message: 'Valid numeric deposit amount is required' });
    const order = await depositRepo.createDepositOrder({ userId: req.user.id, amountRupees: parseFloat(amount), paymentMethod: paymentMethod || 'UPI' });
    const paymentToken = signPaymentToken({ userId: req.user.id, depositId: order.depositId }, 30 * 60);
    const paymentUrl = `${req.protocol}://${req.get('host')}/payment.html?depositId=${encodeURIComponent(order.depositId)}&token=${encodeURIComponent(paymentToken)}`;
    telegramService.notifyDepositCreated({ depositId: order.depositId || order.id, userId: req.user.id, amountRupees: order.amountRupees }).catch(() => {});
    res.status(201).json({ status: 'success', message: 'Deposit order created successfully. Status: PENDING', data: { ...order, paymentUrl, paymentToken } });
  } catch (err) { next(err); }
});

router.get('/payment/:depositId', async (req, res, next) => {
  try {
    const token = String(req.query.token || '');
    const decoded = verifyPaymentToken(token);
    if (decoded.depositId !== req.params.depositId) return res.status(403).json({ status: 'error', message: 'Payment link does not match this order.' });
    const deposit = await depositRepo.getDepositById(req.params.depositId, decoded.sub);
    if (!deposit) return res.status(404).json({ status: 'error', message: 'Deposit order not found.' });
    const amountRupees = parseInt(deposit.amount, 10) / 100;
    const upiId = process.env.PAYMENT_UPI_ID;
    const merchantName = process.env.PAYMENT_MERCHANT_NAME || '999x';
    const qrData = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${amountRupees.toFixed(2)}&cu=INR&tn=${encodeURIComponent(deposit.deposit_id)}`;
    res.json({ status: 'success', data: { depositId: deposit.deposit_id, amountRupees, status: deposit.status, utr: deposit.utr, upiId, merchantName, qrData } });
  } catch (err) { const status = err.statusCode || 401; res.status(status).json({ status: 'error', message: err.message || 'Invalid payment link.' }); }
});

router.post('/payment/:depositId/utr', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '');
    const decoded = verifyPaymentToken(token);
    if (decoded.depositId !== req.params.depositId) return res.status(403).json({ status: 'error', message: 'Payment link does not match this order.' });
    const { utr } = req.body || {};
    if (!utr || typeof utr !== 'string' || !/^\d{12}$/.test(utr.trim())) return res.status(400).json({ status: 'error', message: 'UTR must be exactly 12 numeric digits.' });
    const updatedOrder = await depositRepo.submitDepositUtr({ depositId: req.params.depositId, userId: decoded.sub, utr });
    telegramService.notifyDepositUtrSubmitted({ depositId: updatedOrder.depositId || req.params.depositId, userId: updatedOrder.userId || decoded.sub, amountRupees: Number(updatedOrder.amountRupees || 0), utr: utr.trim() }).catch(() => {});
    res.json({ status: 'success', message: 'UTR submitted successfully. Pending admin manual verification.', data: updatedOrder });
  } catch (err) { if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', message: err.message }); next(err); }
});

router.get('/:depositId', authMiddleware, async (req, res, next) => {
  try {
    const deposit = await depositRepo.getDepositById(req.params.depositId, req.user.id);
    if (!deposit) return res.status(404).json({ status: 'error', message: 'Deposit order not found' });
    res.status(200).json({ status: 'success', data: { id: deposit.id, depositId: deposit.deposit_id, amountRupees: parseInt(deposit.amount, 10) / 100, amountPaise: parseInt(deposit.amount, 10), status: deposit.status, utr: deposit.utr, submittedAt: deposit.submitted_at, confirmedAt: deposit.confirmed_at, rejectedAt: deposit.rejected_at, createdAt: deposit.created_at } });
  } catch (err) { next(err); }
});

router.post('/:depositId/utr', authMiddleware, async (req, res, next) => {
  try {
    const { utr } = req.body;
    if (!utr || typeof utr !== 'string' || !/^\d{12}$/.test(utr.trim())) return res.status(400).json({ status: 'error', message: 'Invalid UTR format. UTR must be exactly 12 numeric digits.' });
    const updatedOrder = await depositRepo.submitDepositUtr({ depositId: req.params.depositId, userId: req.user.id, utr });
    telegramService.notifyDepositUtrSubmitted({ depositId: updatedOrder.depositId || req.params.depositId, userId: updatedOrder.userId || req.user.id, amountRupees: Number(updatedOrder.amountRupees || 0), utr: utr.trim() }).catch(() => {});
    res.status(200).json({ status: 'success', message: 'UTR submitted successfully. Pending admin manual verification.', data: updatedOrder });
  } catch (err) { if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', message: err.message }); next(err); }
});

module.exports = router;
