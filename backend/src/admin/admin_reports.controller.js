const express = require('express');
const router = express.Router();
const { adminMiddleware, requireRole } = require('../middleware/admin_auth.middleware');
const { query } = require('../database/db');
const logger = require('../utils/logger');
const reconciliationService = require('../services/reconciliation.service');

router.use(adminMiddleware);

/** GET /api/admin/reports/summary?from=&to= */
router.get('/summary', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
    const toDate   = to   ? new Date(to)   : new Date();

    const [depRes, wdrRes, betRes] = await Promise.all([
      query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
         FROM deposits WHERE status = 'CONFIRMED' AND confirmed_at BETWEEN $1 AND $2`,
        [fromDate, toDate]
      ),
      query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
         FROM withdrawals WHERE status IN ('SUCCESS','COMPLETED') AND completed_at BETWEEN $1 AND $2`,
        [fromDate, toDate]
      ),
      query(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(stake),0)      AS staked,
                COALESCE(SUM(win_amount),0) AS paid_out,
                COUNT(*) FILTER (WHERE status = 'WON')  AS wins,
                COUNT(*) FILTER (WHERE status = 'LOST') AS losses
         FROM bets WHERE created_at BETWEEN $1 AND $2`,
        [fromDate, toDate]
      ),
    ]);

    const staked  = parseInt(betRes.rows[0]?.staked   || 0, 10);
    const paidOut = parseInt(betRes.rows[0]?.paid_out || 0, 10);

    res.json({
      status: 'success',
      data: {
        period: { from: fromDate.toISOString(), to: toDate.toISOString() },
        deposits: {
          count: parseInt(depRes.rows[0]?.count || 0, 10),
          total: parseInt(depRes.rows[0]?.total || 0, 10) / 100,
        },
        withdrawals: {
          count: parseInt(wdrRes.rows[0]?.count || 0, 10),
          total: parseInt(wdrRes.rows[0]?.total || 0, 10) / 100,
        },
        bets: {
          count:   parseInt(betRes.rows[0]?.count  || 0, 10),
          staked:  staked  / 100,
          paidOut: paidOut / 100,
          wins:    parseInt(betRes.rows[0]?.wins   || 0, 10),
          losses:  parseInt(betRes.rows[0]?.losses || 0, 10),
          houseRevenue: (staked - paidOut) / 100,
        },
      },
    });
  } catch (err) {
    logger.error('Failed to generate reports summary', { error: err.message });
    next(err);
  }
});

/** GET /api/admin/reports/daily?days=7 — Day-by-day breakdown */
router.get('/daily', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || '7', 10) || 7, 1), 90);

    const [depDaily, betDaily] = await Promise.all([
      query(
        `SELECT DATE(confirmed_at) AS day,
                COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
         FROM deposits WHERE status = 'CONFIRMED'
           AND confirmed_at >= NOW() - ($1 * INTERVAL '1 day')
         GROUP BY DATE(confirmed_at) ORDER BY day ASC`,
        [days]
      ),
      query(
        `SELECT DATE(created_at) AS day,
                COUNT(*) AS count,
                COALESCE(SUM(stake),0)      AS staked,
                COALESCE(SUM(win_amount),0) AS paid_out
         FROM bets WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')
         GROUP BY DATE(created_at) ORDER BY day ASC`,
        [days]
      ),
    ]);

    res.json({
      status: 'success',
      data: {
        deposits: depDaily.rows.map(r => ({
          day:   r.day,
          count: parseInt(r.count, 10),
          total: parseInt(r.total, 10) / 100,
        })),
        bets: betDaily.rows.map(r => ({
          day:     r.day,
          count:   parseInt(r.count,    10),
          staked:  parseInt(r.staked,   10) / 100,
          paidOut: parseInt(r.paid_out, 10) / 100,
          houseRevenue: (parseInt(r.staked, 10) - parseInt(r.paid_out, 10)) / 100,
        })),
      },
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/reports/reconciliation?userId=
 * Read-only financial drift report (sec 48). Detects — never repairs — mismatches
 * between wallets, the wallet_ledger, deposits, withdrawals and settlements.
 */
router.get('/reconciliation', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res, next) => {
  try {
    const report = await reconciliationService.runReconciliation({
      userId: req.query.userId || null,
    });
    res.json({ status: 'success', data: report });
  } catch (err) {
    logger.error('Reconciliation report failed', { error: err.message });
    next(err);
  }
});

module.exports = router;
