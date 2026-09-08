const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const depositRepo = require('./deposit.repository');
const telegramService = require('../services/telegram.service');

/**
 * POST /api/deposits — Create PENDING Deposit Order
 */
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { amount, paymentMethod } = req.body;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid numeric deposit amount is required',
      });
    }

    const order = await depositRepo.createDepositOrder({
      userId: req.user.id,
      amountRupees: parseFloat(amount),
      paymentMethod: paymentMethod || 'UPI',
    });

    telegramService.notifyDepositCreated({
      depositId: order.deposit_id || order.id,
      userId: req.user.id,
      amountRupees: parseFloat(amount),
    }).catch(() => {});

    res.status(201).json({
      status: 'success',
      message: 'Deposit order created successfully. Status: PENDING',
      data: order,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/deposits/:depositId — Fetch Deposit Order Status
 */
router.get('/:depositId', authMiddleware, async (req, res, next) => {
  try {
    const deposit = await depositRepo.getDepositById(req.params.depositId, req.user.id);
    if (!deposit) {
      return res.status(404).json({
        status: 'error',
        message: 'Deposit order not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
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
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/deposits/:depositId/utr — Submit 12-digit UTR for PENDING deposit order
 */
router.post('/:depositId/utr', authMiddleware, async (req, res, next) => {
  try {
    const { utr } = req.body;
    if (!utr || typeof utr !== 'string' || !/^\d{12}$/.test(utr.trim())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid UTR format. UTR must be exactly 12 numeric digits.',
      });
    }

    const updatedOrder = await depositRepo.submitDepositUtr({
      depositId: req.params.depositId,
      userId: req.user.id,
      utr,
    });

    telegramService.notifyDepositUtrSubmitted({
      depositId: updatedOrder.deposit_id || req.params.depositId,
      userId: req.user.id,
      amountRupees: parseInt(updatedOrder.amount || 0, 10) / 100,
      utr: utr.trim(),
    }).catch(() => {});

    res.status(200).json({
      status: 'success',
      message: 'UTR submitted successfully. Pending admin manual verification.',
      data: updatedOrder,
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

module.exports = router;
