const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const { query } = require('../database/db');
const logger = require('../utils/logger');

// Catalog of Games (Fetched from PostgreSQL DB)
router.get('/', async (req, res) => {
  try {
    const dbRes = await query('SELECT * FROM games ORDER BY created_at ASC');
    const gamesList = dbRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      entryFee: parseInt(row.entry_fee || 1000, 10) / 100,
      prizePool: (parseInt(row.entry_fee || 1000, 10) * 1.8) / 100,
      route: `/games/${row.id}/index.html`,
      imagePath: `assets/images/${row.id}.png`,
    }));

    return res.status(200).json({
      status: 'success',
      data: gamesList,
    });
  } catch (err) {
    logger.error('Failed to fetch games catalog from PostgreSQL', { error: err.message });
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch games catalog from database',
    });
  }
});

// Authenticated Join Game Endpoint (Verifies user auth)
router.post('/join', authMiddleware, async (req, res) => {
  const { gameId, entryFee } = req.body;
  if (!gameId) {
    return res.status(400).json({ status: 'error', message: 'gameId is required' });
  }

  return res.status(200).json({
    status: 'success',
    message: `Joined game ${gameId} successfully`,
    userId: req.user.id,
    entryFeeDeducted: entryFee || 10.0,
  });
});

// Authenticated User Bet History Endpoint (Fetched from PostgreSQL DB)
router.get('/bet-history', authMiddleware, async (req, res) => {
  try {
    const dbRes = await query(
      `SELECT b.id, b.round_id as "roundId", b.bet_type as "betType", 
              b.stake, b.win_amount as "winAmount", b.status, b.created_at as timestamp
       FROM bets b
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    const betsHistory = dbRes.rows.map((row) => ({
      id: row.id,
      roundId: row.roundId,
      gameId: 'seven_up_down',
      betType: row.betType,
      stake: parseInt(row.stake || 0, 10) / 100,
      winAmount: parseInt(row.winAmount || 0, 10) / 100,
      status: row.status,
      timestamp: row.timestamp,
    }));

    return res.status(200).json({
      status: 'success',
      data: betsHistory,
    });
  } catch (err) {
    logger.error('Failed to fetch user bet history from PostgreSQL', { userId: req.user.id, error: err.message });
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch bet history',
    });
  }
});

module.exports = router;
