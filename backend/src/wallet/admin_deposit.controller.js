const express = require('express');
const router = express.Router();
const { adminMiddleware, requireRole } = require('../middleware/admin_auth.middleware');
const depositRepo = require('./deposit.repository');
const telegramService = require('../services/telegram.service');
const auditService = require('../services/audit.service');
const realtime = require('../services/realtime.service');

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
    const deposits = await depositRepo.getPendingDepositsForAdmin({ limit, offset });
    res.status(200).json({ status: 'success', data: deposits });
  } catch (err) {
    next(err);
  }
});

router.post('/:depositId/confirm', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'GAME_ADMIN'), async (req, res, next) => {
  try {
    const { depositId } = req.params;
    const { adminNote } = req.body || {};
    const adminId = req.admin ? req.admin.id : 'admin_sys';
    const confirmedOrder = await depositRepo.confirmDepositByAdmin({ depositId, adminId, adminNote });
    realtime.emitToUser(confirmedOrder.userId, 'DEPOSIT_STATUS_UPDATED', {
      depositId: confirmedOrder.depositId,
      status: 'CONFIRMED',
      amountRupees: confirmedOrder.amountRupees,
      wallet: confirmedOrder.updatedWallet,
      confirmedAt: confirmedOrder.confirmedAt,
    });
    realtime.emitToUser(confirmedOrder.userId, 'WALLET_UPDATED', { balance: confirmedOrder.updatedWallet });
    auditService.logAdminAction({ adminId, userId: confirmedOrder.userId, action: 'DEPOSIT_CONFIRM', target: confirmedOrder.depositId, ip: req.ip, metadata: { amountRupees: confirmedOrder.amountRupees, adminNote } });
    telegramService.notifyDepositConfirmed({ depositId: confirmedOrder.depositId, userId: confirmedOrder.userId, amountRupees: confirmedOrder.amountRupees, adminId }).catch(() => {});
    res.status(200).json({ status: 'success', message: 'Deposit confirmed and user wallet credited successfully.', data: confirmedOrder });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', message: err.message });
    next(err);
  }
});

router.post('/:depositId/reject', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'GAME_ADMIN'), async (req, res, next) => {
  try {
    const { depositId } = req.params;
    const { adminNote } = req.body || {};
    const adminId = req.admin ? req.admin.id : 'admin_sys';
    const rejectedOrder = await depositRepo.rejectDepositByAdmin({ depositId, adminId, adminNote });
    realtime.emitToUser(rejectedOrder.userId, 'DEPOSIT_STATUS_UPDATED', {
      depositId: rejectedOrder.depositId,
      status: 'REJECTED',
      amountRupees: rejectedOrder.amountRupees,
      rejectedAt: rejectedOrder.rejectedAt,
    });
    auditService.logAdminAction({ adminId, userId: rejectedOrder.userId, action: 'DEPOSIT_REJECT', target: rejectedOrder.depositId, ip: req.ip, metadata: { amountRupees: rejectedOrder.amountRupees, adminNote } });
    telegramService.notifyDepositRejected({ depositId: rejectedOrder.depositId, userId: rejectedOrder.userId, amountRupees: rejectedOrder.amountRupees, reason: adminNote }).catch(() => {});
    res.status(200).json({ status: 'success', message: 'Deposit rejected successfully. Zero wallet credit.', data: rejectedOrder });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ status: 'error', message: err.message });
    next(err);
  }
});

module.exports = router;
