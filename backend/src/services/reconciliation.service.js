/**
 * Financial reconciliation (sec 48).
 *
 * READ-ONLY detection of money-state drift between the authoritative wallet rows,
 * the immutable wallet_ledger, and the deposit / withdrawal / settlement records.
 * This service NEVER mutates balances or "fixes" anything automatically — it produces
 * a structured report an operator/admin must review. PostgreSQL is the only source of
 * truth; if it is unreachable the reconciliation fails closed (throws).
 *
 * Ledger conventions it relies on (see financial.service.js):
 *   - available += CREDIT amounts, -= DEBIT amounts, EXCEPT type='WITHDRAW_FINALIZE'
 *     which is a DEBIT against RESERVED (available is left unchanged).
 *   - reserved  += WITHDRAW_RESERVE, -= WITHDRAW_RELEASE, -= WITHDRAW_FINALIZE.
 *   - WIN_CREDIT rows reference the bet: reference_type='GAME_WIN', reference_id=bets.id.
 *   - DEPOSIT confirm rows: reference_type='DEPOSIT', reference_id=deposits.deposit_id.
 *   - WITHDRAW confirm rows: type='WITHDRAW_FINALIZE', reference_id=withdrawals.withdrawal_id.
 */
const { getClient } = require('../database/db');
const logger = require('../utils/logger');

const int = (v) => parseInt(v || 0, 10);

/**
 * Run all reconciliation checks. Optionally scope every check to a single user.
 * Returns { ok, checkedAt, scope, counts, inconsistencies }.
 */
async function runReconciliation({ userId = null } = {}) {
  const scopeUser = userId || null;
  const client = await getClient();
  try {
    // Consistent snapshot; READ ONLY guarantees this job can never mutate money.
    await client.query('BEGIN TRANSACTION READ ONLY');

    const balanceMismatch = [];
    const reservedMismatch = [];

    // 1 & 6. Wallet balance vs ledger-derived balance (available + reserved).
    const balanceRes = await client.query(
      `SELECT w.user_id,
              w.available_balance::bigint AS available,
              w.reserved_balance::bigint  AS reserved,
              COALESCE(l.ledger_available, 0)::bigint AS ledger_available,
              COALESCE(l.ledger_reserved, 0)::bigint  AS ledger_reserved
       FROM wallets w
       LEFT JOIN LATERAL (
         SELECT
           SUM(CASE
                 WHEN wl.type = 'WITHDRAW_FINALIZE' THEN 0
                 WHEN wl.direction = 'CREDIT' THEN wl.amount
                 WHEN wl.direction = 'DEBIT'  THEN -wl.amount
                 ELSE 0
               END) AS ledger_available,
           SUM(CASE
                 WHEN wl.type = 'WITHDRAW_RESERVE'  THEN  wl.amount
                 WHEN wl.type = 'WITHDRAW_RELEASE'  THEN -wl.amount
                 WHEN wl.type = 'WITHDRAW_FINALIZE' THEN -wl.amount
                 ELSE 0
               END) AS ledger_reserved
         FROM wallet_ledger wl
         WHERE wl.user_id = w.user_id
       ) l ON TRUE
       WHERE (w.available_balance <> COALESCE(l.ledger_available, 0)
          OR w.reserved_balance  <> COALESCE(l.ledger_reserved, 0))
          ${scopeUser ? 'AND w.user_id = $1' : ''}`,
      scopeUser ? [scopeUser] : []
    );
    for (const r of balanceRes.rows) {
      const row = {
        userId: r.user_id,
        available: int(r.available),
        ledgerAvailable: int(r.ledger_available),
        reserved: int(r.reserved),
        ledgerReserved: int(r.ledger_reserved),
      };
      if (row.available !== row.ledgerAvailable) balanceMismatch.push(row);
      if (row.reserved !== row.ledgerReserved) reservedMismatch.push(row);
    }

    // 2. Settlement with a positive win but no matching GAME_WIN wallet credit.
    const settlementWithoutCreditRes = await client.query(
      `SELECT s.id, s.bet_id, s.user_id, s.win_amount
       FROM settlements s
       WHERE s.status = 'SETTLED' AND s.win_amount > 0
         AND NOT EXISTS (
           SELECT 1 FROM wallet_ledger wl
           WHERE wl.reference_type = 'GAME_WIN' AND wl.reference_id = s.bet_id
         )
         ${scopeUser ? 'AND s.user_id = $1' : ''}`,
      scopeUser ? [scopeUser] : []
    );
    const settlementWithoutCredit = settlementWithoutCreditRes.rows.map((r) => ({
      settlementId: r.id,
      betId: r.bet_id,
      userId: r.user_id,
      winAmount: int(r.win_amount),
    }));

    // 3. GAME_WIN wallet credit with no matching settlement.
    const creditWithoutSettlementRes = await client.query(
      `SELECT wl.id, wl.reference_id AS bet_id, wl.user_id, wl.amount
       FROM wallet_ledger wl
       WHERE wl.reference_type = 'GAME_WIN'
         AND NOT EXISTS (
           SELECT 1 FROM settlements s WHERE s.bet_id = wl.reference_id
         )
         ${scopeUser ? 'AND wl.user_id = $1' : ''}`,
      scopeUser ? [scopeUser] : []
    );
    const creditWithoutSettlement = creditWithoutSettlementRes.rows.map((r) => ({
      ledgerId: r.id,
      betId: r.bet_id,
      userId: r.user_id,
      amount: int(r.amount),
    }));

    // 4. Deposit CONFIRMED but no DEPOSIT ledger credit.
    const depositConfirmedWithoutLedgerRes = await client.query(
      `SELECT d.id, d.deposit_id, d.user_id, d.amount
       FROM deposits d
       WHERE d.status = 'CONFIRMED'
         AND NOT EXISTS (
           SELECT 1 FROM wallet_ledger wl
           WHERE wl.reference_type = 'DEPOSIT' AND wl.reference_id = d.deposit_id
         )
         ${scopeUser ? 'AND d.user_id = $1' : ''}`,
      scopeUser ? [scopeUser] : []
    );
    const depositConfirmedWithoutLedger = depositConfirmedWithoutLedgerRes.rows.map((r) => ({
      id: r.id,
      depositId: r.deposit_id,
      userId: r.user_id,
      amount: int(r.amount),
    }));

    // 5. Withdrawal SUCCESS/COMPLETED but no WITHDRAW_FINALIZE ledger entry.
    const withdrawalSuccessWithoutFinalizationRes = await client.query(
      `SELECT w.id, w.withdrawal_id, w.user_id, w.amount
       FROM withdrawals w
       WHERE w.status IN ('SUCCESS', 'COMPLETED')
         AND NOT EXISTS (
           SELECT 1 FROM wallet_ledger wl
           WHERE wl.type = 'WITHDRAW_FINALIZE' AND wl.reference_id = w.withdrawal_id
         )
         ${scopeUser ? 'AND w.user_id = $1' : ''}`,
      scopeUser ? [scopeUser] : []
    );
    const withdrawalSuccessWithoutFinalization = withdrawalSuccessWithoutFinalizationRes.rows.map((r) => ({
      id: r.id,
      withdrawalId: r.withdrawal_id,
      userId: r.user_id,
      amount: int(r.amount),
    }));

    await client.query('COMMIT');

    const inconsistencies = {
      balanceMismatch,
      reservedMismatch,
      settlementWithoutCredit,
      creditWithoutSettlement,
      depositConfirmedWithoutLedger,
      withdrawalSuccessWithoutFinalization,
    };

    const counts = {
      balanceMismatch: balanceMismatch.length,
      reservedMismatch: reservedMismatch.length,
      settlementWithoutCredit: settlementWithoutCredit.length,
      creditWithoutSettlement: creditWithoutSettlement.length,
      depositConfirmedWithoutLedger: depositConfirmedWithoutLedger.length,
      withdrawalSuccessWithoutFinalization: withdrawalSuccessWithoutFinalization.length,
    };

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const report = {
      ok: total === 0,
      checkedAt: new Date().toISOString(),
      scope: scopeUser ? { userId: scopeUser } : { all: true },
      totalInconsistencies: total,
      counts,
      inconsistencies,
    };

    if (!report.ok) {
      // Loud but non-throwing: reconciliation REPORTS, it does not repair.
      logger.warn('Financial reconciliation detected inconsistencies', { scope: report.scope, counts });
    }

    return report;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    logger.error('Financial reconciliation failed', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  runReconciliation,
};
