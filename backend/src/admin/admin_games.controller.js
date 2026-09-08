const express = require('express');
const router = express.Router();
const { adminMiddleware, requireRole } = require('../middleware/admin_auth.middleware');
const { query } = require('../database/db');
const logger = require('../utils/logger');
const { gameManager } = require('../games/game.manager');

router.use(adminMiddleware);

router.get('/health', async (req, res, next) => {
  try { res.json({ status: 'success', data: gameManager.getHealthSummary() }); }
  catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM games ORDER BY created_at ASC');
    const health = gameManager.getHealthSummary();
    res.json({ status: 'success', data: result.rows.map((g) => ({ ...g, workerStatus: health[g.id] ? (health[g.id].running ? 'HEALTHY' : 'STOPPED') : 'UNREGISTERED' })) });
  } catch (err) { next(err); }
});

router.post('/:gameId/toggle', requireRole('SUPER_ADMIN', 'GAME_ADMIN'), async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const adminId = req.admin?.id || 'admin_sys';
    const cur = await query('SELECT status FROM games WHERE id = $1', [gameId]);
    if (!cur.rows.length) return res.status(404).json({ status: 'error', message: 'Game not found' });

    const targetStatus = cur.rows[0].status === 'LIVE' ? 'DISABLED' : 'LIVE';
    if (targetStatus === 'LIVE' && !gameManager.getEngine(gameId)) {
      return res.status(400).json({ status: 'error', code: 'ENGINE_NOT_READY', message: `Game engine is not registered: ${gameId}` });
    }

    // Change DB state first. Only start the worker after LIVE is durable; if worker
    // startup fails, immediately roll the catalog state back to avoid a false LIVE game.
    const updated = await query('UPDATE games SET status = $1 WHERE id = $2 RETURNING *', [targetStatus, gameId]);
    try {
      await gameManager.setGameLive(gameId, targetStatus === 'LIVE');
    } catch (workerErr) {
      await query('UPDATE games SET status = $1 WHERE id = $2', [cur.rows[0].status, gameId]);
      return res.status(503).json({ status: 'error', code: 'WORKER_START_FAILED', message: 'Game worker could not be started; game state was reverted.' });
    }

    await query(`INSERT INTO audit_logs (id, user_id, action, details, created_at) VALUES ($1, $2, 'GAME_TOGGLE', $3::jsonb, NOW())`,
      [`al_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, adminId, JSON.stringify({ gameId, oldStatus: cur.rows[0].status, newStatus: targetStatus })]);
    logger.info('Admin toggled game status', { adminId, gameId, targetStatus });
    res.json({ status: 'success', data: updated.rows[0] });
  } catch (err) { next(err); }
});

router.patch('/:gameId/config', requireRole('SUPER_ADMIN', 'GAME_ADMIN'), async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const { entryFee, minStake, maxStake } = req.body || {};
    const adminId = req.admin?.id || 'admin_sys';
    const values = { entryFee, minStake, maxStake };
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== null && (!Number.isFinite(Number(value)) || Number(value) < 0)) return res.status(400).json({ status: 'error', message: `${key} must be a non-negative number` });
    }
    const min = minStake == null ? null : Math.round(Number(minStake) * 100);
    const max = maxStake == null ? null : Math.round(Number(maxStake) * 100);
    const fee = entryFee == null ? null : Math.round(Number(entryFee) * 100);
    if (min !== null && max !== null && min > max) return res.status(400).json({ status: 'error', message: 'minStake cannot be greater than maxStake' });

    const updated = await query(`UPDATE games SET entry_fee = COALESCE($2, entry_fee), min_stake = COALESCE($3, min_stake), max_stake = COALESCE($4, max_stake) WHERE id = $1 RETURNING *`, [gameId, fee, min, max]);
    if (!updated.rows.length) return res.status(404).json({ status: 'error', message: 'Game not found' });
    await query(`INSERT INTO audit_logs (id, user_id, action, details, created_at) VALUES ($1, $2, 'GAME_CONFIG_UPDATE', $3::jsonb, NOW())`,
      [`al_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, adminId, JSON.stringify({ gameId, entryFee, minStake, maxStake })]);
    res.json({ status: 'success', data: updated.rows[0] });
  } catch (err) { next(err); }
});

router.get('/:gameId/rounds', async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const rawLimit = Number.parseInt(req.query.limit || '20', 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 100)) : 20;
    const result = await query(`SELECT id, round_number, status, result, started_at, betting_closed_at, ended_at FROM game_rounds WHERE game_id = $1 ORDER BY created_at DESC LIMIT $2`, [gameId, limit]);
    res.json({ status: 'success', data: result.rows });
  } catch (err) { next(err); }
});

router.get('/:gameId/bets', async (req, res, next) => {
  try {
    const { roundId } = req.query;
    const rawLimit = Number.parseInt(req.query.limit || '50', 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 200)) : 50;
    let sql;
    let params;
    if (roundId) {
      sql = `SELECT b.*, u.username, u.phone FROM bets b LEFT JOIN users u ON u.id = b.user_id WHERE b.round_id = $1 ORDER BY b.created_at DESC LIMIT $2`;
      params = [roundId, limit];
    } else {
      sql = `SELECT b.*, u.username, u.phone FROM bets b LEFT JOIN users u ON u.id = b.user_id JOIN game_rounds gr ON gr.id = b.round_id AND gr.game_id = $1 ORDER BY b.created_at DESC LIMIT $2`;
      params = [req.params.gameId, limit];
    }
    const result = await query(sql, params);
    res.json({ status: 'success', data: result.rows });
  } catch (err) { next(err); }
});

module.exports = router;
