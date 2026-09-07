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

// Add Cash API (Atomic PostgreSQL Transaction + Ledger Entry)
router.post('/add-cash', authMiddleware, async (req, res, next) => {
  try {
    const { amount, paymentMethod } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ status: 'error', message: 'Valid deposit amount required' });
    }

    const result = await walletRepo.addCash(req.user.id, amount, paymentMethod || 'UPI');
    res.status(200).json({
      status: 'success',
      message: `Cash deposited successfully via ${paymentMethod || 'UPI'}`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// Withdraw Cash API (Atomic Winnings Lock + Ledger Entry)
router.post('/withdraw', authMiddleware, async (req, res, next) => {
  try {
    const { amount, upiId } = req.body;
    if (!amount || amount <= 0 || !upiId) {
      return res.status(400).json({ status: 'error', message: 'Valid amount and UPI ID required' });
    }

    const result = await walletRepo.withdraw(req.user.id, amount, upiId);
    res.status(200).json({
      status: 'success',
      message: `Withdrawal request of ₹${amount} submitted successfully`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

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
