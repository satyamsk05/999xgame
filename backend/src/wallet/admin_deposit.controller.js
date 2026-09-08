const express = require('express');
const router = express.Router();
const { adminMiddleware, requireRole } = require('../middleware/admin_auth.middleware');
const depositRepo = require('./deposit.repository');
const telegramService = require('../services/telegram.service');
const auditService = require('../services/audit.service');

router.use(adminMiddleware);

/** GET /api/admin/deposits/pending — Fetch deposits pending admin verification */
router.get('/pending', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const deposits = await depositRepo.getPendingDepositsForAdmin({ limit, offset });

    res.status(200).json({ status: 'success', data: deposits });
  } catch (err) { next(err); }
});

/** POST /api/admin/deposits/:depositId/confirm — Confirm deposit and credit user wallet */
router.post('/:depositId/confirm', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res, next) => {
  try {
    const { depositId } = req.params;
    const { adminNote } = req.body || {};
    const adminId = req.admin ? req.admin.id : 'admin_sys';

    const confirmedOrder = await depositRepo.confirmDepositByAdmin({
      depositId,
      adminId,
      adminNote,
    });

    // Audit the financial action (sec 49) — fire-and-forget, never blocks the commit.
    auditService.logAdminAction({
      adminId,
      userId: confirmedOrder.userId,
      action: 'DEPOSIT_CONFIRM',
      target: confirmedOrder.depositId,
      ip: req.ip,
      metadata: { amountRupees: confirmedOrder.amountRupees, adminNote },
    });

    // Notify Telegram channel safely AFTER DB commit.
    // NOTE: the repository returns a camelCase contract (depositId/userId/amountRupees).
    // Reading snake_case fields here previously produced undefined/0 in notifications.
    telegramService.notifyDepositConfirmed({
      depositId: confirmedOrder.depositId,
      userId: confirmedOrder.userId,
      amountRupees: confirmedOrder.amountRupees,
      adminId,
    }).catch(() => {});

    res.status(200).json({
      status: 'success',
      message: 'Deposit confirmed and user wallet credited successfully.',
      data: confirmedOrder,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ status: 'error', message: err.message });
    }
    next(err);
  }
});

/** POST /api/admin/deposits/:depositId/reject — Reject deposit order */
router.post('/:depositId/reject', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res, next) => {
  try {
    const { depositId } = req.params;
    const { adminNote } = req.body || {};
    const adminId = req.admin ? req.admin.id : 'admin_sys';

    const rejectedOrder = await depositRepo.rejectDepositByAdmin({
      depositId,
      adminId,
      adminNote,
    });

    // Audit the financial action (sec 49) — fire-and-forget, never blocks the commit.
    auditService.logAdminAction({
      adminId,
      userId: rejectedOrder.userId,
      action: 'DEPOSIT_REJECT',
      target: rejectedOrder.depositId,
      ip: req.ip,
      metadata: { amountRupees: rejectedOrder.amountRupees, adminNote },
    });

    // Notify Telegram channel safely AFTER DB commit (camelCase contract).
    telegramService.notifyDepositRejected({
      depositId: rejectedOrder.depositId,
      userId: rejectedOrder.userId,
      amountRupees: rejectedOrder.amountRupees,
      reason: adminNote,
    }).catch(() => {});

    res.status(200).json({
      status: 'success',
      message: 'Deposit rejected successfully. Zero wallet credit.',
      data: rejectedOrder,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ status: 'error', message: err.message });
    }
    next(err);
  }
});

module.exports = router;
