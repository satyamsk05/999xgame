const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const { query } = require('../database/db');
const logger = require('../utils/logger');
const { sevenUpDownEngine } = require('./seven-up-down/engine');
const gameRepo = require('./seven-up-down/game.repository');
const walletRepo = require('../wallet/wallet.repository');

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

// Deprecated Join Game Endpoint (Return 400 as per specification)
router.post('/join', authMiddleware, async (req, res) => {
  return res.status(400).json({
    status: 'error',
    message: 'Endpoint deprecated. Use /api/games/7updown/bets to place bets.',
  });
});

// GET /api/games/7updown/current-round
router.get('/7updown/current-round', async (req, res) => {
  try {
    const currentRound = await sevenUpDownEngine.getOrStartCurrentRound();
    return res.status(200).json({
      status: 'success',
      data: {
        roundId: currentRound.roundId,
        gameId: currentRound.gameId,
        status: currentRound.status,
        serverSeedHash: currentRound.serverSeedHash,
        createdAt: currentRound.createdAt,
      },
    });
  } catch (err) {
    logger.error('Failed to fetch current 7 Up Down round', { error: err.message });
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch active round state',
    });
  }
});

// POST /api/games/7updown/bets (Authenticated)
router.post('/7updown/bets', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { roundId, bets, betType, stake, stakePaise, idempotencyKey } = req.body;

    let betList = [];

    if (Array.isArray(bets) && bets.length > 0) {
      betList = bets;
    } else if (betType) {
      const computedStakePaise = stakePaise || (stake ? Math.round(parseFloat(stake) * 100) : 0);
      betList = [{ betType, stakePaise: computedStakePaise, idempotencyKey: idempotencyKey || `idemp_bet_${userId}_${Date.now()}` }];
    } else {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request: bets array or betType is required',
      });
    }

    const placedBets = [];
    for (const betItem of betList) {
      const itemStakePaise = betItem.stakePaise || (betItem.stake ? Math.round(parseFloat(betItem.stake) * 100) : 0);
      const itemKey = betItem.idempotencyKey || idempotencyKey || `idemp_bet_${userId}_${Date.now()}_${Math.random()}`;

      const { bet, isDuplicate } = await sevenUpDownEngine.placeBet({
        userId,
        betType: betItem.betType,
        stakePaise: itemStakePaise,
        idempotencyKey: itemKey,
      });

      placedBets.push({
        id: bet.id,
        roundId: bet.round_id || roundId,
        betType: bet.bet_type || betItem.betType,
        stake: parseInt(bet.stake || itemStakePaise, 10) / 100,
        stakePaise: parseInt(bet.stake || itemStakePaise, 10),
        status: bet.status,
        isDuplicate,
      });
    }

    const updatedWallet = await walletRepo.getWalletByUserId(userId);

    return res.status(200).json({
      status: 'success',
      data: {
        bets: placedBets,
        wallet: updatedWallet,
      },
    });
  } catch (err) {
    logger.error('Failed to place bet in 7 Up Down', { userId: req.user?.id, error: err.message });
    return res.status(400).json({
      status: 'error',
      message: err.message || 'Failed to place bet',
    });
  }
});

// GET /api/games/7updown/history
router.get('/7updown/history', async (req, res) => {
  try {
    const history = await gameRepo.getRecentRoundsFromDb(50);
    return res.status(200).json({
      status: 'success',
      data: history,
    });
  } catch (err) {
    logger.error('Failed to fetch 7 Up Down history', { error: err.message });
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch round history',
    });
  }
});

// GET /api/games/7updown/round/:roundId
router.get('/7updown/round/:roundId', async (req, res) => {
  try {
    const { roundId } = req.params;
    const round = await gameRepo.getRoundByIdFromDb(roundId);

    if (!round) {
      return res.status(404).json({
        status: 'error',
        message: 'Round not found',
      });
    }

    let userBets = [];
    if (req.user) {
      userBets = await gameRepo.getUserBetsForRoundInDb(roundId, req.user.id);
    }

    return res.status(200).json({
      status: 'success',
      data: {
        round,
        userBets,
      },
    });
  } catch (err) {
    logger.error('Failed to fetch round details', { roundId: req.params.roundId, error: err.message });
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch round details',
    });
  }
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
