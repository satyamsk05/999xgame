const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('../middleware/admin_auth.middleware');
const { query } = require('../database/db');
const logger = require('../utils/logger');

router.use(adminMiddleware);

/**
 * GET /api/admin/stats/dashboard
 * Returns all dashboard KPIs in a single DB round-trip batch.
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const [
      usersRes,
      newUsersRes,
      depositsRes,
      pendingDepositsRes,
      withdrawalsRes,
      pendingWithdrawalsRes,
      betsRes,
      revenueRes,
      activeRoundRes,
    ] = await Promise.all([
      // Total registered users
      query('SELECT COUNT(*) AS total FROM users'),

      // New users today
      query('SELECT COUNT(*) AS total FROM users WHERE created_at >= $1', [todayISO]),

      // Today's confirmed deposits (paise → rupees)
      query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
         FROM deposits
         WHERE status = 'CONFIRMED' AND confirmed_at >= $1`,
        [todayISO]
      ),

      // Pending deposit count
      query(`SELECT COUNT(*) AS count FROM deposits WHERE status = 'PENDING_UTR'`),

      // Today's completed withdrawals (paise → rupees)
      query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
         FROM withdrawals
         WHERE status = 'COMPLETED' AND updated_at >= $1`,
        [todayISO]
      ),

      // Pending withdrawal count
      query(`SELECT COUNT(*) AS count FROM withdrawals WHERE status IN ('PENDING', 'PROCESSING')`),

      // Today's bets count + total staked
      query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(stake), 0) AS staked
         FROM bets WHERE created_at >= $1`,
        [todayISO]
      ),

      // Today's house revenue = staked - paid_out (wins)
      query(
        `SELECT COALESCE(SUM(stake), 0) AS staked, COALESCE(SUM(win_amount), 0) AS paid_out
         FROM bets WHERE created_at >= $1 AND status IN ('WON', 'LOST')`,
        [todayISO]
      ),

      // Current active game round
      query(
        `SELECT id, round_number, status, created_at
         FROM game_rounds
         WHERE game_id = 'seven_up_down'
         ORDER BY created_at DESC LIMIT 1`
      ),
    ]);

    const staked = parseInt(revenueRes.rows[0]?.staked || 0, 10);
    const paidOut = parseInt(revenueRes.rows[0]?.paid_out || 0, 10);
    const houseRevenuePaise = staked - paidOut;

    res.status(200).json({
      status: 'success',
      data: {
        users: {
          total: parseInt(usersRes.rows[0]?.total || 0, 10),
          newToday: parseInt(newUsersRes.rows[0]?.total || 0, 10),
        },
        deposits: {
          todayCount: parseInt(depositsRes.rows[0]?.count || 0, 10),
          todayTotal: parseInt(depositsRes.rows[0]?.total || 0, 10) / 100,
          pendingCount: parseInt(pendingDepositsRes.rows[0]?.count || 0, 10),
        },
        withdrawals: {
          todayCount: parseInt(withdrawalsRes.rows[0]?.count || 0, 10),
          todayTotal: parseInt(withdrawalsRes.rows[0]?.total || 0, 10) / 100,
          pendingCount: parseInt(pendingWithdrawalsRes.rows[0]?.count || 0, 10),
        },
        bets: {
          todayCount: parseInt(betsRes.rows[0]?.count || 0, 10),
          todayStaked: parseInt(betsRes.rows[0]?.staked || 0, 10) / 100,
        },
        revenue: {
          todayHouseRevenue: houseRevenuePaise / 100,
        },
        currentRound: activeRoundRes.rows[0] || null,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error('Failed to aggregate admin dashboard stats', { error: err.message });
    next(err);
  }
});

/** GET /api/admin/stats/audit-logs?limit=50&offset=0 */
router.get('/audit-logs', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);
    const action = req.query.action || '';

    let sql, params;
    if (action) {
      sql    = `SELECT * FROM audit_logs WHERE action = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
      params = [action, limit, offset];
    } else {
      sql    = `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
      params = [limit, offset];
    }

    const [result, countRes] = await Promise.all([
      query(sql, params),
      query(action ? `SELECT COUNT(*) FROM audit_logs WHERE action = $1` : `SELECT COUNT(*) FROM audit_logs`, action ? [action] : []),
    ]);

    res.json({
      status: 'success',
      data: result.rows,
      meta: { total: parseInt(countRes.rows[0]?.count || 0, 10), limit, offset },
    });
  } catch (err) { next(err); }
});

module.exports = router;
