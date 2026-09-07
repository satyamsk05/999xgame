const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/admin.middleware');
const withdrawalRepo = require('./withdrawal.repository');

/**
 * All admin routes require admin authorization
 */
router.use(adminMiddleware);

/**
 * GET /api/admin/withdrawals/pending — Fetch withdrawal requests pending admin verification
 */
router.get('/pending', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const withdrawals = await withdrawalRepo.getPendingWithdrawalsForAdmin({ limit, offset });

    res.status(200).json({
      status: 'success',
      data: withdrawals,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/withdrawals/:withdrawalId/process — Mark withdrawal as PROCESSING
 */
router.post('/:withdrawalId/process', async (req, res, next) => {
  try {
    const { withdrawalId } = req.params;
    const { adminNote } = req.body || {};
    const adminId = req.admin ? req.admin.id : 'admin_sys';

    const processedRequest = await withdrawalRepo.processWithdrawalByAdmin({
      withdrawalId,
      adminId,
      adminNote,
    });

    res.status(200).json({
      status: 'success',
      message: 'Withdrawal status set to PROCESSING.',
      data: processedRequest,
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
 * POST /api/admin/withdrawals/:withdrawalId/confirm (and /complete alias) — Confirm withdrawal payout and finalize reserved funds
 */
const handleConfirmWithdrawal = async (req, res, next) => {
  try {
    const { withdrawalId } = req.params;
    const { adminNote } = req.body || {};
    const adminId = req.admin ? req.admin.id : 'admin_sys';

    const confirmedRequest = await withdrawalRepo.confirmWithdrawalByAdmin({
      withdrawalId,
      adminId,
      adminNote,
    });

    res.status(200).json({
      status: 'success',
      message: 'Withdrawal payout confirmed and reserved funds finalized successfully.',
      data: confirmedRequest,
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
};

router.post('/:withdrawalId/confirm', handleConfirmWithdrawal);
router.post('/:withdrawalId/complete', handleConfirmWithdrawal);

/**
 * POST /api/admin/withdrawals/:withdrawalId/reject — Reject withdrawal request and release reserved funds back to available
 */
router.post('/:withdrawalId/reject', async (req, res, next) => {
  try {
    const { withdrawalId } = req.params;
    const { adminNote } = req.body || {};
    const adminId = req.admin ? req.admin.id : 'admin_sys';

    const rejectedRequest = await withdrawalRepo.rejectWithdrawalByAdmin({
      withdrawalId,
      adminId,
      adminNote,
    });

    res.status(200).json({
      status: 'success',
      message: 'Withdrawal request rejected and reserved funds released back to available balance.',
      data: rejectedRequest,
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
