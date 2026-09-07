const { query } = require('../database/db');
const logger = require('../utils/logger');
const financialService = require('../services/financial.service');

/**
 * Get User Wallet Balances
 */
async function getWalletByUserId(userId) {
  try {
    const res = await query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
    if (res.rows.length === 0) {
      return {
        availableBalance: 0.0,
        reservedBalance: 0.0,
        depositBalance: 0.0,
        winningsBalance: 0.0,
        totalBalance: 0.0,
        availablePaise: 0,
        reservedPaise: 0,
      };
    }
    const w = res.rows[0];
    const avail = parseInt(w.available_balance || 0, 10);
    const resv = parseInt(w.reserved_balance || 0, 10);
    const dep = parseInt(w.deposit_balance || 0, 10);
    const win = parseInt(w.winnings_balance || 0, 10);
    const rew = parseInt(w.rewards_balance || 0, 10);

    return {
      availableBalance: avail / 100,
      reservedBalance: resv / 100,
      depositBalance: dep / 100,
      winningsBalance: win / 100,
      rewardsBalance: rew / 100,
      totalBalance: (avail + resv) / 100,
      availablePaise: avail,
      reservedPaise: resv,
      depositPaise: dep,
      winningsPaise: win,
      rewardsPaise: rew,
    };
  } catch (err) {
    logger.error('PostgreSQL wallet lookup error', { userId, error: err.message });
    throw err;
  }
}

/**
 * Add Cash Deposit (Delegates to financial.service.js)
 */
async function addCash(userId, amountRupees, paymentMethod) {
  const amountPaise = Math.round(amountRupees * 100);
  const result = await financialService.creditWallet(userId, amountPaise, {
    type: 'DEPOSIT',
    referenceType: 'DEPOSIT',
    referenceId: `DEP_${paymentMethod}_${Date.now()}`,
    idempotencyKey: `idemp_dep_${userId}_${Date.now()}`,
    metadata: { paymentMethod },
  });

  const avail = parseInt(result.wallet.available_balance || 0, 10);
  const resv = parseInt(result.wallet.reserved_balance || 0, 10);
  const dep = parseInt(result.wallet.deposit_balance || 0, 10);
  const win = parseInt(result.wallet.winnings_balance || 0, 10);
  const rew = parseInt(result.wallet.rewards_balance || 0, 10);

  return {
    depositBalance: dep / 100,
    winningsBalance: win / 100,
    rewardsBalance: rew / 100,
    totalBalance: (avail + resv) / 100,
  };
}

/**
 * Request Withdrawal (Delegates to financial.service.js)
 */
async function withdraw(userId, amountRupees, upiId) {
  const amountPaise = Math.round(amountRupees * 100);
  if (!upiId || typeof upiId !== 'string' || !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim())) {
    throw new Error('Invalid UPI ID format (e.g. username@bank)');
  }

  const withdrawalId = `wdr_${Date.now()}`;
  const result = await financialService.reserveFunds(userId, amountPaise, {
    referenceType: 'WITHDRAWAL',
    referenceId: withdrawalId,
    idempotencyKey: `idemp_wdr_${withdrawalId}`,
    metadata: { upiId: upiId.trim() },
  });

  const avail = parseInt(result.wallet.available_balance || 0, 10);
  const resv = parseInt(result.wallet.reserved_balance || 0, 10);

  return {
    withdrawalId,
    winningsBalance: avail / 100,
    totalBalance: (avail + resv) / 100,
  };
}

/**
 * Get Ledger Transactions History from PostgreSQL
 */
async function getTransactionsByUserId(userId, category) {
  try {
    let sql = 'SELECT * FROM wallet_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50';
    const params = [userId];

    const res = await query(sql, params);
    return res.rows.map((row) => ({
      id: row.id,
      title: formatLedgerTitle(row.type, row.reference_id),
      amount: parseInt(row.amount, 10) / 100,
      isCredit: row.direction === 'CREDIT',
      timestamp: row.created_at,
      category: mapLedgerCategory(row.type),
    }));
  } catch (err) {
    logger.error('Failed to fetch transactions from PostgreSQL DB', { userId, error: err.message });
    throw err;
  }
}

function formatLedgerTitle(type, refId) {
  switch (type) {
    case 'DEPOSIT': return 'Cash Deposited';
    case 'CREDIT': return 'Account Credited';
    case 'DEBIT': return 'Account Debited';
    case 'BET_DEBIT': return 'Entry Fee / Bet Placed';
    case 'WIN_CREDIT': return 'Won : 7 Up Down';
    case 'WITHDRAW_RESERVE': return 'Withdrawal Request (Reserved)';
    case 'WITHDRAW_FINALIZE': return 'Withdrawal Completed';
    case 'WITHDRAW_RELEASE': return 'Withdrawal Refunded';
    case 'BONUS_CREDIT': return 'Welcome / Promo Bonus';
    default: return 'Transaction';
  }
}

function mapLedgerCategory(type) {
  if (type === 'DEPOSIT') return 'Deposit';
  if (['WITHDRAW_RESERVE', 'WITHDRAW_FINALIZE', 'WITHDRAW_RELEASE', 'WITHDRAW_LOCK', 'WITHDRAW_COMPLETE', 'WITHDRAW_REFUND'].includes(type)) return 'Withdrawal';
  if (['BET_DEBIT', 'WIN_CREDIT'].includes(type)) return 'Game';
  return 'Reward';
}

module.exports = {
  getWalletByUserId,
  addCash,
  withdraw,
  getTransactionsByUserId,
};
