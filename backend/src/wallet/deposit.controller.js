const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { signPaymentToken, verifyPaymentToken } = require('../auth/jwt');
const depositRepo = require('./deposit.repository');
const telegramService = require('../services/telegram.service');

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { amount, paymentMethod } = req.body;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ status: 'error', message: 'Valid numeric deposit amount is required' });
    }

    const order = await depositRepo.createDepositOrder({
      userId: req.user.id,
      amountRupees: parseFloat(amount),
      paymentMethod: paymentMethod || 'UPI',
    });

    const paymentToken = signPaymentToken({
      userId: req.user.id,
      depositId: order.depositId,
    }, 30 * 60);
    const paymentUrl = `${req.protocol}://${req.get('host')}/payment.html?depositId=${encodeURIComponent(order.depositId)}&token=${encodeURIComponent(paymentToken)}`;

    telegramService.notifyDepositCreated({
      depositId: order.depositId || order.id,
      userId: req.user.id,
      amountRupees: order.amountRupees,
    }).catch(() => {});

    res.status(201).json({
      status: 'success',
      message: 'Deposit order created successfully. Status: PENDING',
      data: { ...order, paymentUrl, paymentToken },
    });
  } catch (err) { next(err); }
});

// Public payment-page bootstrap. Access is restricted by a short-lived scoped token.
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
  } catch (err) {
    const status = err.statusCode || 401;
    res.status(status).json({ status: 'error', message: err.message || 'Invalid payment link.' });
  }
});

router.post('/payment/:depositId/utr', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '');
    const decoded = verifyPaymentToken(token);
    if (decoded.depositId !== req.params.depositId) return res.status(403).json({ status: 'error', message: 'Payment link does not match this order.' });

    const { utr } = req.body || {};
    if (!utr || typeof utr !== 'string' || !/^\d{12}$/.test(utr.trim())) {
      return res.status(400).json({ status: 'error', message: 'UTR must be exactly 12 numeric digits.' });
    }

    const updatedOrder = await depositRepo.submitDepositUtr({ depositId: req.params.depositId, userId: decoded.sub, utr });
    telegramService.notifyDepositUtrSubmitted({
      depositId: updatedOrder.depositId || req.params.depositId,
      userId: updatedOrder.userId || decoded.sub,
      amountRupees: Number(updatedOrder.amountRupees || 0),
      utr: utr.trim(),
    }).catch(() => {});

    res.json({ status: 'success', message: 'UTR submitted successfully. Pending admin manual verification.', data: updatedOrder });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', message: err.message });
    next(err);
  }
});

router.get('/:depositId', authMiddleware, async (req, res, next) => {
  try {
    const deposit = await depositRepo.getDepositById(req.params.depositId, req.user.id);
    if (!deposit) return res.status(404).json({ status: 'error', message: 'Deposit order not found' });
    res.status(200).json({ status: 'success', data: {
      id: deposit.id,
      depositId: deposit.deposit_id,
      amountRupees: parseInt(deposit.amount, 10) / 100,
      amountPaise: parseInt(deposit.amount, 10),
      status: deposit.status,
      utr: deposit.utr,
      submittedAt: deposit.submitted_at,
      confirmedAt: deposit.confirmed_at,
      rejectedAt: deposit.rejected_at,
      createdAt: deposit.created_at,
    }});
  } catch (err) { next(err); }
});

router.post('/:depositId/utr', authMiddleware, async (req, res, next) => {
  try {
    const { utr } = req.body;
    if (!utr || typeof utr !== 'string' || !/^\d{12}$/.test(utr.trim())) return res.status(400).json({ status: 'error', message: 'Invalid UTR format. UTR must be exactly 12 numeric digits.' });
    const updatedOrder = await depositRepo.submitDepositUtr({ depositId: req.params.depositId, userId: req.user.id, utr });
    telegramService.notifyDepositUtrSubmitted({ depositId: updatedOrder.depositId || req.params.depositId, userId: updatedOrder.userId || req.user.id, amountRupees: Number(updatedOrder.amountRupees || 0), utr: utr.trim() }).catch(() => {});
    res.status(200).json({ status: 'success', message: 'UTR submitted successfully. Pending admin manual verification.', data: updatedOrder });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', message: err.message });
    next(err);
  }
});

module.exports = router;
