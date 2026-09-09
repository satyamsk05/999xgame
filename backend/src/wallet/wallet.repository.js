const { query } = require('../database/db');
const logger = require('../utils/logger');
const financialService = require('../services/financial.service');

async function getWalletByUserId(userId) {
  try {
    const res = await query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
    if (res.rows.length === 0) return { availableBalance: 0.0, reservedBalance: 0.0, depositBalance: 0.0, winningsBalance: 0.0, rewardsBalance: 0.0, totalBalance: 0.0, availablePaise: 0, reservedPaise: 0 };
    const w = res.rows[0];
    const avail = parseInt(w.available_balance || 0, 10), resv = parseInt(w.reserved_balance || 0, 10), dep = parseInt(w.deposit_balance || 0, 10), win = parseInt(w.winnings_balance || 0, 10), rew = parseInt(w.rewards_balance || 0, 10);
    return { availableBalance: avail / 100, reservedBalance: resv / 100, depositBalance: dep / 100, winningsBalance: win / 100, rewardsBalance: rew / 100, totalBalance: (avail + resv) / 100, availablePaise: avail, reservedPaise: resv, depositPaise: dep, winningsPaise: win, rewardsPaise: rew };
  } catch (err) { logger.error('PostgreSQL wallet lookup error', { userId, error: err.message }); throw err; }
}

async function addCash(userId, amountRupees, paymentMethod) {
  const amountPaise = Math.round(amountRupees * 100);
  const result = await financialService.creditWallet(userId, amountPaise, { type: 'DEPOSIT', referenceType: 'DEPOSIT', referenceId: `DEP_${paymentMethod}_${Date.now()}`, idempotencyKey: `idemp_dep_${userId}_${Date.now()}`, metadata: { paymentMethod } });
  const avail = parseInt(result.wallet.available_balance || 0, 10), resv = parseInt(result.wallet.reserved_balance || 0, 10), dep = parseInt(result.wallet.deposit_balance || 0, 10), win = parseInt(result.wallet.winnings_balance || 0, 10), rew = parseInt(result.wallet.rewards_balance || 0, 10);
  return { depositBalance: dep / 100, winningsBalance: win / 100, rewardsBalance: rew / 100, totalBalance: (avail + resv) / 100 };
}

async function getTransactionsByUserId(userId, category = 'All') {
  try {
    const normalizedCategory = String(category || 'All').trim().toLowerCase();
    const categoryTypes = {
      withdrawal: ['WITHDRAW_RESERVE', 'WITHDRAW_FINALIZE', 'WITHDRAW_RELEASE', 'WITHDRAW_LOCK', 'WITHDRAW_COMPLETE', 'WITHDRAW_REFUND'],
      game: ['BET_DEBIT', 'WIN_CREDIT'],
      reward: ['BONUS_CREDIT', 'REWARD_CREDIT', 'REWARD_DEBIT'],
    };
    let ledgerSql = `SELECT id, type, amount, direction, created_at, reference_id, NULL::varchar AS deposit_status, NULL::varchar AS deposit_utr
                     FROM wallet_ledger WHERE user_id = $1 AND type <> 'DEPOSIT'`;
    const params = [userId];
    if (normalizedCategory !== 'all' && normalizedCategory !== 'deposit') {
      const types = categoryTypes[normalizedCategory];
      if (!types) { const err = new Error('Invalid transaction category'); err.statusCode = 400; throw err; }
      ledgerSql += ` AND type = ANY($2::varchar[])`;
      params.push(types);
    }
    const includeDeposits = normalizedCategory === 'all' || normalizedCategory === 'deposit';
    let sql;
    if (includeDeposits) {
      const depositSql = `SELECT id, 'DEPOSIT' AS type, amount, 'CREDIT' AS direction, created_at, deposit_id AS reference_id,
                                 status AS deposit_status, utr AS deposit_utr FROM deposits WHERE user_id = $1`;
      sql = `SELECT * FROM (${ledgerSql}) ledger_items UNION ALL SELECT * FROM (${depositSql}) deposit_items ORDER BY created_at DESC LIMIT 50`;
    } else {
      sql = `${ledgerSql} ORDER BY created_at DESC LIMIT 50`;
    }
    const res = await query(sql, params);
    return res.rows.map((row) => ({
      id: row.id,
      title: formatLedgerTitle(row.type, row.reference_id),
      amount: parseInt(row.amount, 10) / 100,
      isCredit: row.direction === 'CREDIT',
      timestamp: row.created_at,
      category: mapLedgerCategory(row.type),
      status: row.deposit_status ? mapDepositStatus(row.deposit_status) : null,
      rawStatus: row.deposit_status || null,
      utr: row.deposit_utr || null,
      referenceId: row.reference_id || null,
    }));
  } catch (err) { logger.error('Failed to fetch transactions from PostgreSQL DB', { userId, error: err.message }); throw err; }
}

function mapDepositStatus(status) {
  switch (String(status || '').toUpperCase()) {
    case 'CONFIRMED': return 'SUCCESS';
    case 'REJECTED':
    case 'EXPIRED': return 'REJECTED';
    case 'PENDING':
    case 'UTR_SUBMITTED': return 'PENDING';
    default: return 'PENDING';
  }
}

function formatLedgerTitle(type) {
  switch (type) {
    case 'DEPOSIT': return 'Cash Deposit';
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

module.exports = { getWalletByUserId, addCash, getTransactionsByUserId };