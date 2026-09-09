const express = require('express');
const router = express.Router();
const { adminMiddleware, requireRole } = require('../middleware/admin_auth.middleware');
const withdrawalRepo = require('./withdrawal.repository');
const auditService = require('../services/audit.service');

router.use(adminMiddleware);

function parsePagination(query) {
  const rawLimit = Number.parseInt(query.limit, 10);
  const rawOffset = Number.parseInt(query.offset, 10);
  return {
    limit: Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50,
    offset: Number.isFinite(rawOffset) ? Math.min(Math.max(rawOffset, 0), 1000000) : 0,
  };
}

router.get('/pending', async (req, res, next) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const withdrawals = await withdrawalRepo.getPendingWithdrawalsForAdmin({ limit, offset });
    res.status(200).json({ status: 'success', data: withdrawals });
  } catch (err) {
    next(err);
  }
});

router.post('/:withdrawalId/process', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res, next) => {
  try {
    const { withdrawalId } = req.params;
    const { adminNote } = req.body || {};
    const adminId = req.admin ? req.admin.id : 'admin_sys';
    const processedRequest = await withdrawalRepo.processWithdrawalByAdmin({ withdrawalId, adminId, adminNote });
    auditService.logAdminAction({ adminId, userId: processedRequest.userId, action: 'WITHDRAW_PROCESS', target: withdrawalId, ip: req.ip, metadata: { adminNote } });
    res.status(200).json({ status: 'success', message: 'Withdrawal status set to PROCESSING.', data: processedRequest });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', message: err.message });
    next(err);
  }
});

const handleConfirmWithdrawal = async (req, res, next) => {
  try {
    const { withdrawalId } = req.params;
    const { adminNote } = req.body || {};
    const adminId = req.admin ? req.admin.id : 'admin_sys';
    const confirmedRequest = await withdrawalRepo.confirmWithdrawalByAdmin({ withdrawalId, adminId, adminNote });
    auditService.logAdminAction({ adminId, userId: confirmedRequest.userId, action: 'WITHDRAW_CONFIRM', target: withdrawalId, ip: req.ip, metadata: { adminNote } });
    res.status(200).json({ status: 'success', message: 'Withdrawal payout confirmed and reserved funds finalized successfully.', data: confirmedRequest });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', message: err.message });
    next(err);
  }
};

router.post('/:withdrawalId/confirm', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'), handleConfirmWithdrawal);
router.post('/:withdrawalId/complete', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'), handleConfirmWithdrawal);

router.post('/:withdrawalId/reject', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res, next) => {
  try {
    const { withdrawalId } = req.params;
    const { adminNote } = req.body || {};
    const adminId = req.admin ? req.admin.id : 'admin_sys';
    const rejectedRequest = await withdrawalRepo.rejectWithdrawalByAdmin({ withdrawalId, adminId, adminNote });
    auditService.logAdminAction({ adminId, userId: rejectedRequest.userId, action: 'WITHDRAW_REJECT', target: withdrawalId, ip: req.ip, metadata: { adminNote } });
    res.status(200).json({ status: 'success', message: 'Withdrawal request rejected and reserved funds released back to available balance.', data: rejectedRequest });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', message: err.message });
    next(err);
  }
});

module.exports = router;
