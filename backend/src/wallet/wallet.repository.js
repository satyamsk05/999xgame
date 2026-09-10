const { query } = require('../database/db');
const logger = require('../utils/logger');
const financialService = require('../services/financial.service');

async function getWalletByUserId(userId) {
  try {
    const res = await query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
    if (res.rows.length === 0) return { availableBalance: 0.0, reservedBalance: 0.0, depositBalance: 0.0, winningsBalance: 0.0, rewardsBalance: 0.0, totalBalance: 0.0, availablePaise: 0, reservedPaise: 0 };
    const w = res.rows[0];
    const avail = parseInt(w.available_balance || 0, 10);
    const resv = parseInt(w.reserved_balance || 0, 10);
    const dep = parseInt(w.deposit_balance || 0, 10);
    const win = parseInt(w.winnings_balance || 0, 10);
    const rew = parseInt(w.rewards_balance || 0, 10);
    
    // totalBalance represents active spendable balance in user wallet (after active reserved withdrawals)
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
      rewardsPaise: rew 
    };
  } catch (err) { 
    logger.error('PostgreSQL wallet lookup error', { userId, error: err.message }); 
    throw err; 
  }
}

async function getTransactionsByUserId(userId, category = 'All') {
  try {
    const normalizedCategory = String(category || 'All').trim().toLowerCase();
    
    // 1. Ledger transactions for Games, Bonuses, and Direct adjustments (excluding raw internal deposit/withdraw items)
    let ledgerSql = `SELECT id, type, amount, direction, created_at, reference_id, 
                            NULL::varchar AS tx_status, NULL::varchar AS tx_utr, NULL::varchar AS custom_category
                     FROM wallet_ledger 
                     WHERE user_id = $1 
                       AND type <> 'DEPOSIT' 
                       AND type NOT LIKE 'WITHDRAW_%'`;
    const params = [userId];

    if (normalizedCategory === 'game') {
      ledgerSql += ` AND type = ANY(ARRAY['BET_DEBIT', 'WIN_CREDIT']::varchar[])`;
    } else if (normalizedCategory === 'reward') {
      ledgerSql += ` AND type = ANY(ARRAY['BONUS_CREDIT', 'REWARD_CREDIT', 'REWARD_DEBIT']::varchar[])`;
    }

    const queries = [];

    if (normalizedCategory === 'all' || normalizedCategory === 'game' || normalizedCategory === 'reward') {
      queries.push(`(${ledgerSql})`);
    }

    // 2. Authoritative Single Record per Deposit
    if (normalizedCategory === 'all' || normalizedCategory === 'deposit') {
      const depositSql = `SELECT id, 'DEPOSIT' AS type, amount, 'CREDIT' AS direction, created_at, deposit_id AS reference_id,
                                 status AS tx_status, utr AS tx_utr, 'Deposit'::varchar AS custom_category 
                          FROM deposits 
                          WHERE user_id = $1`;
      queries.push(`(${depositSql})`);
    }

    // 3. Authoritative Single Record per Withdrawal (Status: PENDING -> SUCCESS -> REJECTED)
    if (normalizedCategory === 'all' || normalizedCategory === 'withdraw' || normalizedCategory === 'withdrawal') {
      const withdrawSql = `SELECT id, 'WITHDRAWAL' AS type, amount, 'DEBIT' AS direction, created_at, withdrawal_id AS reference_id,
                                  status AS tx_status, payout_address_or_upi AS tx_utr, 'Withdrawal'::varchar AS custom_category 
                           FROM withdrawals 
                           WHERE user_id = $1`;
      queries.push(`(${withdrawSql})`);
    }

    let sql = queries.join(' UNION ALL ') + ' ORDER BY created_at DESC LIMIT 50';
    const res = await query(sql, params);

    return res.rows.map((row) => ({
      id: row.id,
      title: formatLedgerTitle(row.type, row.reference_id, row.tx_status),
      amount: parseInt(row.amount, 10) / 100,
      isCredit: row.direction === 'CREDIT',
      timestamp: row.created_at,
      category: row.custom_category || mapLedgerCategory(row.type),
      status: mapTxStatus(row.tx_status),
      rawStatus: row.tx_status || null,
      utr: row.tx_utr || null,
      referenceId: row.reference_id || null,
    }));
  } catch (err) { 
    logger.error('Failed to fetch transactions from PostgreSQL DB', { userId, error: err.message }); 
    throw err; 
  }
}

function mapTxStatus(status) {
  if (!status) return null;
  switch (String(status).toUpperCase()) {
    case 'CONFIRMED':
    case 'SUCCESS': 
      return 'SUCCESS';
    case 'REJECTED':
    case 'EXPIRED': 
      return 'REJECTED';
    case 'PENDING':
    case 'PROCESSING':
    case 'UTR_SUBMITTED': 
      return 'PENDING';
    default: 
      return 'PENDING';
  }
}

function formatLedgerTitle(type, referenceId, status) {
  if (type === 'WITHDRAWAL') {
    const s = String(status || '').toUpperCase();
    if (s === 'SUCCESS' || s === 'CONFIRMED') return 'Withdrawal (Completed)';
    if (s === 'REJECTED') return 'Withdrawal (Rejected)';
    return 'Withdrawal (Pending)';
  }
  switch (type) {
    case 'DEPOSIT': return 'Cash Deposit';
    case 'CREDIT': return 'Account Credited';
    case 'DEBIT': return 'Account Debited';
    case 'BET_DEBIT': return 'Entry Fee / Bet Placed';
    case 'WIN_CREDIT': return 'Won : 7 Up Down';
    case 'BONUS_CREDIT': return 'Welcome / Promo Bonus';
    default: return 'Transaction';
  }
}

function mapLedgerCategory(type) {
  if (type === 'DEPOSIT') return 'Deposit';
  if (type === 'WITHDRAWAL' || ['WITHDRAW_RESERVE', 'WITHDRAW_FINALIZE', 'WITHDRAW_RELEASE'].includes(type)) return 'Withdrawal';
  if (['BET_DEBIT', 'WIN_CREDIT'].includes(type)) return 'Game';
  return 'Reward';
}

module.exports = { getWalletByUserId, getTransactionsByUserId };