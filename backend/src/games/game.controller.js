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
const validation = require('../utils/validation');
const { betLimiter, cashoutLimiter } = require('../middleware/rateLimit');

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

// 7 Up Down Round History (public) — recent rounds for the game UI.
router.get('/7updown/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const rounds = await gameRepo.getRecentRoundsFromDb(limit);
    // Provably-fair: reveal the server seed ONLY for SETTLED rounds; the commitment
    // hash is always safe. Never leak the seed of an in-flight round (sec 21).
    const safe = rounds.map((r) => ({ ...r, serverSeed: r.status === 'SETTLED' ? r.serverSeed : null }));
    return res.status(200).json({ status: 'success', data: safe });
  } catch (err) {
    logger.error('Failed to fetch 7 Up Down history', { error: err.message });
    return res.status(500).json({ status: 'error', message: 'Failed to fetch game history' });
  }
});

// Deprecated legacy join endpoint — returns an explicit 400 (never a silent 404).
router.post('/join', (req, res) => {
  return res.status(400).json({
    status: 'error',
    message: 'This endpoint is deprecated. Use the game-specific bet endpoints (e.g. POST /api/games/7updown/bets).',
  });
});

// 7 Up Down Place Bet
router.post('/7updown/bets', betLimiter, authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { roundId, bets, betType, stake, stakePaise, idempotencyKey } = req.body;

    let betList = [];
    if (Array.isArray(bets) && bets.length > 0) {
      betList = bets;
    } else if (betType) {
      betList = [{ betType, stakePaise, stake, idempotencyKey }];
    } else {
      return res.status(400).json({ status: 'error', message: 'bets array or betType is required' });
    }

    // Authoritative round the bets attach to — used for deterministic idempotency (sec 21.8).
    const activeRoundId = (sevenUpDownEngine.currentRound && sevenUpDownEngine.currentRound.roundId) || roundId;

    // sec 51: validate + normalize the WHOLE batch up-front so one bad item can never
    // cause a partial fill (debit item 1, then 400 on item 2). Client numbers are never
    // trusted — stake resolves to a positive integer number of paise.
    validation.validateIdempotencyKey(idempotencyKey);
    const normalizedBets = betList.map((betItem, i) => {
      const itemStakePaise = validation.resolveStakePaise(
        { stakePaise: betItem.stakePaise, stake: betItem.stake },
        'stake'
      );
      validation.validateBetType(betItem.betType, 'seven_up_down');
      // Prefer the client key; otherwise derive a STABLE key from request fields so a
      // retry never produces a second debit (never Date.now()/Math.random()).
      const clientKey = validation.validateIdempotencyKey(betItem.idempotencyKey);
      const itemKey = clientKey || idempotencyKey
        || `sud_${userId}_${activeRoundId}_${betItem.betType}_${itemStakePaise}_${i}`;
      return { betType: betItem.betType, stakePaise: itemStakePaise, idempotencyKey: itemKey };
    });

    const placedBets = [];
    for (let i = 0; i < normalizedBets.length; i++) {
      const betItem = normalizedBets[i];
      const itemStakePaise = betItem.stakePaise;

      const { bet, isDuplicate } = await sevenUpDownEngine.placeBet({
        userId,
        betType: betItem.betType,
        stakePaise: itemStakePaise,
        idempotencyKey: betItem.idempotencyKey,
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
    const status = err.statusCode || 400;
    if (status >= 500) logger.error('7 Up Down bet failed', { userId: req.user && req.user.id, error: err.message });
    return res.status(status).json({ status: 'error', message: err.message || 'Failed to place bet' });
  }
});

// Dragon Tiger Place Bet
router.post('/dragon_tiger/bets', betLimiter, authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { betType, stake, stakePaise, idempotencyKey } = req.body;
    // sec 51: never trust client numbers — resolve to integer paise and check the enum.
    const computedStakePaise = validation.resolveStakePaise({ stakePaise, stake });
    validation.validateBetType(betType, 'dragon_tiger');
    validation.validateIdempotencyKey(idempotencyKey);

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
    const status = err.statusCode || 400;
    if (status >= 500) logger.error('Dragon Tiger bet failed', { userId: req.user && req.user.id, error: err.message });
    return res.status(status).json({ status: 'error', message: err.message });
  }
});

// Crush Place Bet
router.post('/crush/bets', betLimiter, authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { stake, stakePaise, autoCashoutMultiplier, idempotencyKey } = req.body;
    // sec 51: never trust client numbers — resolve stake to integer paise.
    const computedStakePaise = validation.resolveStakePaise({ stakePaise, stake });
    validation.validateIdempotencyKey(idempotencyKey);

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
    const status = err.statusCode || 400;
    if (status >= 500) logger.error('Crush bet failed', { userId: req.user && req.user.id, error: err.message });
    return res.status(status).json({ status: 'error', message: err.message });
  }
});

// Crush Cashout — SERVER-AUTHORITATIVE (sec 25). The client's `multiplier` is a UI
// hint only and is NEVER trusted as truth: the server computes the payout multiplier
// from the authoritative flight clock and validates ownership/state atomically.
router.post('/crush/cashout', cashoutLimiter, authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    // sec 51: only betId is taken from the client; the payout multiplier is computed
    // server-side (sec 25). Throws 400 'betId is required' when missing/invalid.
    const { betId } = validation.validateCashoutRequest(req.body);

    const result = await crushEngine.cashoutBet({ betId, userId });

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    const status = err.statusCode || 400;
    if (status >= 500) logger.error('Crush cashout failed', { userId: req.user.id, error: err.message });
    return res.status(status).json({ status: 'error', message: err.message });
  }
});

// Authenticated User Bet History Endpoint
router.get('/bet-history', authMiddleware, async (req, res) => {
  try {
    // Derive the real game identity from the round (sec 27) — never hardcode it.
    const dbRes = await query(
      `SELECT b.id, b.round_id as "roundId", b.bet_type as "betType", 
              b.stake, b.win_amount as "winAmount", b.status, b.created_at as timestamp,
              r.game_id as "gameId"
       FROM bets b
       LEFT JOIN game_rounds r ON r.id = b.round_id
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    const betsHistory = dbRes.rows.map((row) => ({
      id: row.id,
      roundId: row.roundId,
      gameId: row.gameId || null,
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
