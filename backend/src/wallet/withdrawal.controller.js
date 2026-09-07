const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const withdrawalRepo = require('./withdrawal.repository');

/**
 * POST /api/withdrawals — Initiate Manual Withdrawal Request (Funds Atomically Reserved)
 */
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { amount, upiId } = req.body;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid numeric withdrawal amount is required',
      });
    }

    if (!upiId || typeof upiId !== 'string' || !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid UPI ID format (e.g. username@bank)',
      });
    }

    const requestData = await withdrawalRepo.createWithdrawalRequest({
      userId: req.user.id,
      amountRupees: parseFloat(amount),
      upiId: upiId.trim(),
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
