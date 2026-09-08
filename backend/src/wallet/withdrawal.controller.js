const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const withdrawalRepo = require('./withdrawal.repository');

function parseExactRupeeAmount(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [rupees, paise = ''] = text.split('.');
  const amountPaise = Number(rupees) * 100 + Number((paise + '00').slice(0, 2));
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return null;
  return amountPaise / 100;
}

/**
 * POST /api/withdrawals — Initiate Manual Withdrawal Request (Funds Atomically Reserved)
 */
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { amount, upiId } = req.body;
    const amountRupees = parseExactRupeeAmount(amount);
    if (amountRupees === null) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid withdrawal amount is required with at most 2 decimal places',
      });
    }

    if (!upiId || typeof upiId !== 'string' || !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid UPI ID format (e.g. username@bank)',
      });
    }

    const clientRequestId = req.body.clientRequestId
      || req.body.idempotencyKey
      || req.headers['x-client-request-id']
      || req.headers['x-idempotency-key']
      || null;

    const requestData = await withdrawalRepo.createWithdrawalRequest({
      userId: req.user.id,
      amountRupees,
      upiId: upiId.trim(),
      clientRequestId,
    });

    res.status(201).json({
      status: 'success',
      message: 'Withdrawal request created successfully. Status: PENDING',
      data: requestData,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        status: 'error',
        message: err.message,
      });
    }
    next(err);
  }
});

/**
 * GET /api/withdrawals/:withdrawalId — Fetch Withdrawal Request Status
 */
router.get('/:withdrawalId', authMiddleware, async (req, res, next) => {
  try {
    const withdrawal = await withdrawalRepo.getWithdrawalById(req.params.withdrawalId, req.user.id);
    if (!withdrawal) {
      return res.status(404).json({
        status: 'error',
        message: 'Withdrawal request not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        id: withdrawal.id,
        withdrawalId: withdrawal.withdrawal_id,
        amountRupees: parseInt(withdrawal.amount, 10) / 100,
        amountPaise: parseInt(withdrawal.amount, 10),
        status: withdrawal.status,
        payoutMethod: withdrawal.payout_method,
        upiId: withdrawal.payout_address_or_upi,
        requestedAt: withdrawal.requested_at,
        completedAt: withdrawal.completed_at,
        rejectedAt: withdrawal.rejected_at,
        createdAt: withdrawal.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
