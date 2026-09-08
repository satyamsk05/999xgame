const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const walletRepo = require('./wallet.repository');

// Get Real Wallet Balances from PostgreSQL
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const balances = await walletRepo.getWalletByUserId(req.user.id);
    res.status(200).json({
      status: 'success',
      data: balances,
    });
  } catch (err) {
    next(err);
  }
});

// NOTE (financial integrity): the legacy POST /add-cash and POST /withdraw routes
// were REMOVED. /add-cash credited arbitrary amounts with no deposit record, UTR or
// admin approval (free-money hole); /withdraw reserved funds but created NO
// withdrawal row (funds stuck, no admin path to confirm/reject). The authoritative,
// audited flows are:
//   deposits    -> POST /api/deposits      (+ POST /api/admin/deposits/:id/confirm)
//   withdrawals -> POST /api/withdrawals   (+ POST /api/admin/withdrawals/:id/confirm|reject)

// Transactions History API from PostgreSQL Ledger
router.get('/transactions', authMiddleware, async (req, res, next) => {
  try {
    const category = req.query.category || 'All';
    const txs = await walletRepo.getTransactionsByUserId(req.user.id, category);
    res.status(200).json({
      status: 'success',
      data: txs,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
