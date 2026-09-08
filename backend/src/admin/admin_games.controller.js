const express = require('express');
const router = express.Router();
const { adminMiddleware, requireRole } = require('../middleware/admin_auth.middleware');
const { query } = require('../database/db');
const logger = require('../utils/logger');
const { gameManager } = require('../games/game.manager');

router.use(adminMiddleware);

/**
 * GET /api/admin/games/health — game worker liveness (sec 30).
 * Exposes, per registered game, whether its engine is registered and whether its
 * worker loop is running. If a worker dies/stops, `running` flips to false so
 * monitoring can detect it.
 */
router.get('/health', async (req, res, next) => {
  try {
    res.json({ status: 'success', data: gameManager.getHealthSummary() });
  } catch (err) { next(err); }
});

/** GET /api/admin/games — All games with worker health status */
router.get('/', async (req, res, next) => {
  try {
    const res2 = await query('SELECT * FROM games ORDER BY created_at ASC');
    const health = gameManager.getHealthSummary();

    const gamesWithHealth = res2.rows.map((g) => ({
      ...g,
      workerStatus: health[g.id] ? (health[g.id].running ? 'HEALTHY' : 'STOPPED') : 'UNREGISTERED',
    }));

    res.json({ status: 'success', data: gamesWithHealth });
  } catch (err) { next(err); }
});

/** POST /api/admin/games/:gameId/toggle — Enable / Disable with Engine Health Verification */
router.post('/:gameId/toggle', requireRole('SUPER_ADMIN', 'GAME_ADMIN'), async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const adminId = req.admin?.id || 'admin_sys';

    const cur = await query('SELECT status FROM games WHERE id = $1', [gameId]);
    if (!cur.rows.length) return res.status(404).json({ status: 'error', message: 'Game not found' });

    const currentStatus = cur.rows[0].status;
    const targetStatus = currentStatus === 'LIVE' ? 'DISABLED' : 'LIVE';

    if (targetStatus === 'LIVE') {
      const isEngineRegistered = !!gameManager.getEngine(gameId);
      const isWorkerHealthy = gameManager.isWorkerHealthy(gameId);

      if (!isEngineRegistered || !isWorkerHealthy) {
        return res.status(400).json({
          status: 'error',
          code: 'ENGINE_NOT_READY',
          message: `Cannot mark game [${gameId}] as LIVE: Backend game engine is not registered or worker is unready.`,
        });
      }
    }

    const updated = await query(
      'UPDATE games SET status = $1 WHERE id = $2 RETURNING *',
      [targetStatus, gameId]
    );

    await query(
      `INSERT INTO audit_logs (id, user_id, action, details, created_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [`al_${Date.now()}`, adminId, 'GAME_TOGGLE', JSON.stringify({ gameId, newStatus: targetStatus })]
    );

    logger.info('Admin toggled game status', { adminId, gameId, targetStatus });
    res.json({ status: 'success', data: updated.rows[0] });
  } catch (err) { next(err); }
});

/** PATCH /api/admin/games/:gameId/config — Update stakes/fee */
router.patch('/:gameId/config', requireRole('SUPER_ADMIN', 'GAME_ADMIN'), async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const { entryFee, minStake, maxStake } = req.body;
    const adminId = req.admin?.id || 'admin_sys';

    if (minStake && maxStake && minStake > maxStake) {
      return res.status(400).json({ status: 'error', message: 'minStake cannot be greater than maxStake' });
    }

    const updated = await query(
      `UPDATE games
       SET entry_fee  = COALESCE($2, entry_fee),
           min_stake  = COALESCE($3, min_stake),
           max_stake  = COALESCE($4, max_stake)
       WHERE id = $1
       RETURNING *`,
      [gameId, entryFee ? Math.round(entryFee * 100) : null,
               minStake ? Math.round(minStake * 100) : null,
               maxStake ? Math.round(maxStake * 100) : null]
    );
    if (!updated.rows.length) return res.status(404).json({ status: 'error', message: 'Game not found' });

    await query(
      `INSERT INTO audit_logs (id, user_id, action, details, created_at)
       VALUES ($1, $2, 'GAME_CONFIG_UPDATE', $3::jsonb, NOW())`,
      [`al_${Date.now()}`, adminId, JSON.stringify({ gameId, entryFee, minStake, maxStake })]
    );

    res.json({ status: 'success', data: updated.rows[0] });
  } catch (err) { next(err); }
});

/** GET /api/admin/games/:gameId/rounds?limit=20 — Recent rounds */
router.get('/:gameId/rounds', async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);

    const result = await query(
      `SELECT id, round_number, status, result, started_at, betting_closed_at, ended_at, created_at
       FROM game_rounds WHERE game_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [gameId, limit]
    );
    res.json({ status: 'success', data: result.rows });
  } catch (err) { next(err); }
});

/** GET /api/admin/games/:gameId/bets?roundId=&limit=50 — Bets for a round */
router.get('/:gameId/bets', async (req, res, next) => {
  try {
    const { roundId, limit: lim } = req.query;
    const limit = Math.min(parseInt(lim || '50', 10), 200);

    let sql, params;
    if (roundId) {
      sql = `SELECT b.*, u.username, u.phone FROM bets b
             LEFT JOIN users u ON u.id = b.user_id
             WHERE b.round_id = $1
             ORDER BY b.created_at DESC LIMIT $2`;
      params = [roundId, limit];
    } else {
      sql = `SELECT b.*, u.username, u.phone FROM bets b
             LEFT JOIN users u ON u.id = b.user_id
             JOIN game_rounds gr ON gr.id = b.round_id AND gr.game_id = $1
             ORDER BY b.created_at DESC LIMIT $2`;
      params = [req.params.gameId, limit];
    }

    const result = await query(sql, params);
    res.json({ status: 'success', data: result.rows });
  } catch (err) { next(err); }
});

module.exports = router;
