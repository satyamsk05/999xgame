const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const { query } = require('../database/db');
const logger = require('../utils/logger');
const { sevenUpDownEngine } = require('./seven-up-down/engine');
const { dragonTigerEngine } = require('./dragon-tiger/dragon_tiger.engine');
const { crushEngine } = require('./crush/crush.engine');
const gameRepo = require('./seven-up-down/game.repository');
const walletRepo = require('../wallet/wallet.repository');

// Catalog of Games
router.get('/', async (req, res) => {
  try {
    const dbRes = await query('SELECT * FROM games ORDER BY created_at ASC');
    const imageMap = {
      seven_up_down: 'Assets/images/7updown.png',
      '7updown': 'Assets/images/7updown.png',
      dragon_tiger: 'Assets/images/dtgame.png',
      crush: 'Assets/images/classic_dice.png',
      mines: 'Assets/images/mines.png',
    };

    const gamesList = dbRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      isAvailable: row.status === 'LIVE',
      entryFee: parseInt(row.entry_fee || 1000, 10) / 100,
      prizePool: (parseInt(row.entry_fee || 1000, 10) * 1.8) / 100,
      route: `/games/${row.id}/index.html`,
      gameUrl: `/games/${row.id}/index.html`,
      imagePath: imageMap[row.id] || `Assets/images/${row.id}.png`,
    }));

    return res.status(200).json({ status: 'success', data: gamesList });
  } catch (err) {
    logger.error('Failed to fetch games catalog', { error: err.message });
    return res.status(500).json({ status: 'error', message: 'Failed to fetch games catalog' });
  }
});

// Generic Current State & Resync Endpoint
router.get('/:gameId/current-state', async (req, res) => {
  const { gameId } = req.params;
  try {
    let engine = null;
    if (gameId === 'seven_up_down' || gameId === '7updown') engine = sevenUpDownEngine;
    else if (gameId === 'dragon_tiger') engine = dragonTigerEngine;
    else if (gameId === 'crush') engine = crushEngine;

    if (!engine) {
      return res.status(404).json({ status: 'error', message: `Unknown game: ${gameId}` });
    }

    const currentRound = engine.currentRound || (await engine.createRound());
    const now = Date.now();
    const closesAt = new Date(currentRound.bettingClosesAt || currentRound.createdAt).getTime();

    return res.status(200).json({
      status: 'success',
      data: {
        gameId,
        currentRound,
        serverTime: new Date().toISOString(),
        timeRemainingMs: Math.max(0, closesAt - now),
      },
    });
  } catch (err) {
    logger.error('Failed to fetch game state', { gameId, error: err.message });
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 7 Up Down Current Round
router.get('/7updown/current-round', async (req, res) => {
  try {
    const currentRound = await sevenUpDownEngine.getOrStartCurrentRound();
    return res.status(200).json({
      status: 'success',
      data: currentRound,
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 7 Up Down Place Bet
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
      return res.status(400).json({ status: 'error', message: 'bets array or betType is required' });
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
    return res.status(200).json({ status: 'success', data: { bets: placedBets, wallet: updatedWallet } });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message || 'Failed to place bet' });
  }
});

// Dragon Tiger Place Bet
router.post('/dragon_tiger/bets', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { betType, stake, stakePaise, idempotencyKey } = req.body;
    const computedStakePaise = stakePaise || (stake ? Math.round(parseFloat(stake) * 100) : 0);

    const { bet, wallet } = await dragonTigerEngine.placeBet({
      userId,
      betType,
      stakePaise: computedStakePaise,
      idempotencyKey,
    });

    return res.status(200).json({
      status: 'success',
      data: { bet, wallet },
    });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
});

// Crush Place Bet
router.post('/crush/bets', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { stake, stakePaise, autoCashoutMultiplier, idempotencyKey } = req.body;
    const computedStakePaise = stakePaise || (stake ? Math.round(parseFloat(stake) * 100) : 0);

    const { bet, wallet } = await crushEngine.placeBet({
      userId,
      stakePaise: computedStakePaise,
      autoCashoutMultiplier,
      idempotencyKey,
    });

    return res.status(200).json({
      status: 'success',
      data: { bet, wallet },
    });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
});

// Crush Cashout
router.post('/crush/cashout', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { betId, multiplier } = req.body;

    const result = await crushEngine.cashoutBet({
      betId,
      userId,
      multiplier: parseFloat(multiplier),
    });

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
});

// Authenticated User Bet History Endpoint
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

    return res.status(200).json({ status: 'success', data: betsHistory });
  } catch (err) {
    logger.error('Failed to fetch user bet history', { userId: req.user.id, error: err.message });
    return res.status(500).json({ status: 'error', message: 'Failed to fetch bet history' });
  }
});

module.exports = router;
