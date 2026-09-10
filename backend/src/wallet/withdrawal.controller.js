const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { withdrawalLimiter } = require('../middleware/rateLimit');
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

const userRepo = require('../users/user.repository');

/**
 * POST /api/withdrawals — Initiate Manual Withdrawal Request (Funds Atomically Reserved)
 */
router.post('/', authMiddleware, withdrawalLimiter, async (req, res, next) => {
  try {
    const {
      amount,
      paymentMode = 'UPI',
      upiId,
      upiName,
      bankAccountNumber,
      bankIfsc,
      bankAccountHolder,
      bankName,
    } = req.body;

    const amountRupees = parseExactRupeeAmount(amount);
    if (amountRupees === null) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid withdrawal amount is required with at most 2 decimal places',
      });
    }

    const normalizedMode = (paymentMode || 'UPI').toUpperCase() === 'BANK' ? 'BANK' : 'UPI';

    // If fields are omitted in request, fallback to user's saved profile payout methods
    let effectiveUpiId = upiId;
    let effectiveUpiName = upiName;
    let effectiveBankAcc = bankAccountNumber;
    let effectiveIfsc = bankIfsc;
    let effectiveHolder = bankAccountHolder;
    let effectiveBankName = bankName;

    if (normalizedMode === 'UPI' && !effectiveUpiId) {
      const userPayout = await userRepo.getPayoutMethods(req.user.id);
      if (userPayout && userPayout.upiId) {
        effectiveUpiId = userPayout.upiId;
        effectiveUpiName = effectiveUpiName || userPayout.upiName;
      }
    } else if (normalizedMode === 'BANK' && (!effectiveBankAcc || !effectiveIfsc)) {
      const userPayout = await userRepo.getPayoutMethods(req.user.id);
      if (userPayout && userPayout.bankAccountNumber && userPayout.bankIfsc) {
        effectiveBankAcc = effectiveBankAcc || userPayout.bankAccountNumber;
        effectiveIfsc = effectiveIfsc || userPayout.bankIfsc;
        effectiveHolder = effectiveHolder || userPayout.bankAccountHolder;
        effectiveBankName = effectiveBankName || userPayout.bankName;
      }
    }

    if (normalizedMode === 'UPI') {
      if (!effectiveUpiId || typeof effectiveUpiId !== 'string' || !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(effectiveUpiId.trim())) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid UPI ID format (e.g. username@bank). Please link your UPI ID.',
        });
      }
    } else {
      if (!effectiveBankAcc || typeof effectiveBankAcc !== 'string' || !/^\d{8,30}$/.test(effectiveBankAcc.trim())) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid Bank Account Number (must be 8-30 digits). Please link your Bank Account.',
        });
      }
      if (!effectiveIfsc || typeof effectiveIfsc !== 'string' || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(effectiveIfsc.trim().toUpperCase())) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid IFSC Code (e.g. SBIN0001234). Please check and try again.',
        });
      }
    }

    const clientRequestId = req.body.clientRequestId
      || req.body.idempotencyKey
      || req.headers['x-client-request-id']
      || req.headers['x-idempotency-key']
      || null;

    const requestData = await withdrawalRepo.createWithdrawalRequest({
      userId: req.user.id,
      amountRupees,
      paymentMode: normalizedMode,
      upiId: effectiveUpiId ? effectiveUpiId.trim() : null,
      upiName: effectiveUpiName ? effectiveUpiName.trim() : null,
      bankAccountNumber: effectiveBankAcc ? effectiveBankAcc.trim() : null,
      bankIfsc: effectiveIfsc ? effectiveIfsc.trim().toUpperCase() : null,
      bankAccountHolder: effectiveHolder ? effectiveHolder.trim() : null,
      bankName: effectiveBankName ? effectiveBankName.trim() : null,
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
