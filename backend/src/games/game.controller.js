const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const { signToken } = require('../auth/jwt');
const { query } = require('../database/db');
const logger = require('../utils/logger');
const { sevenUpDownEngine } = require('./seven-up-down/engine');
const { dragonTigerEngine } = require('./dragon-tiger/dragon_tiger.engine');
const { crushEngine } = require('./crush/crush.engine');
const gameRepo = require('./seven-up-down/game.repository');
const walletRepo = require('../wallet/wallet.repository');
const validation = require('../utils/validation');
const { betLimiter, cashoutLimiter } = require('../middleware/rateLimit');

const GAME_ALIASES = { '7updown': 'seven_up_down' };
const ENGINES = {
  seven_up_down: sevenUpDownEngine,
  dragon_tiger: dragonTigerEngine,
  crush: crushEngine,
};

async function requireLiveGame(gameId) {
  const canonicalId = GAME_ALIASES[gameId] || gameId;
  if (!ENGINES[canonicalId]) {
    const error = new Error(`Unknown game: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const result = await query('SELECT status FROM games WHERE id = $1 LIMIT 1', [canonicalId]);
  if (result.rows[0]?.status !== 'LIVE') {
    const error = new Error('Game is currently unavailable.');
    error.statusCode = 409;
    error.code = 'GAME_NOT_LIVE';
    throw error;
  }
  return { gameId: canonicalId, engine: ENGINES[canonicalId] };
}

router.post('/session', authMiddleware, async (req, res) => {
  const requestedGameId = String(req.body?.gameId || '');
  try {
    const { gameId } = await requireLiveGame(requestedGameId);
    const expiresIn = 5 * 60;
    const token = signToken({ userId: req.user.id, phone: req.user.phone, scope: 'GAME_SESSION', gameId }, expiresIn);
    return res.status(200).json({ status: 'success', data: { token, gameId, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() } });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) logger.error('Failed to create game session token', { userId: req.user?.id, gameId: requestedGameId, error: err.message });
    return res.status(status).json({ status: 'error', code: err.code || 'GAME_SESSION_FAILED', message: status >= 500 ? 'Unable to start the game session.' : err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const dbRes = await query('SELECT * FROM games ORDER BY created_at ASC');
    const imageMap = { seven_up_down: 'Assets/images/7updown.png', '7updown': 'Assets/images/7updown.png', dragon_tiger: 'Assets/images/dtgame.png', crush: 'Assets/images/classic_dice.png', mines: 'Assets/images/mines.png' };
    const gamesList = dbRes.rows.map((row) => ({ id: row.id, title: row.title, status: row.status, isAvailable: row.status === 'LIVE', entryFee: parseInt(row.entry_fee || 1000, 10) / 100, prizePool: (parseInt(row.entry_fee || 1000, 10) * 1.8) / 100, route: `/games/${row.id}/index.html`, gameUrl: `/games/${row.id}/index.html`, imagePath: imageMap[row.id] || `Assets/images/${row.id}.png` }));
    return res.status(200).json({ status: 'success', data: gamesList });
  } catch (err) {
    logger.error('Failed to fetch games catalog', { error: err.message });
    return res.status(500).json({ status: 'error', message: 'Failed to fetch games catalog' });
  }
});

router.get('/:gameId/current-state', async (req, res) => {
  const { gameId: requestedGameId } = req.params;
  try {
    const { gameId, engine } = await requireLiveGame(requestedGameId);
    const currentRound = engine.currentRound;
    if (!currentRound) return res.status(503).json({ status: 'error', code: 'GAME_NOT_READY', message: 'Game worker is not ready yet.' });
    const now = Date.now();
    const closesAt = new Date(currentRound.bettingClosesAt || currentRound.bettingClosedAt || currentRound.createdAt).getTime();
    return res.status(200).json({ status: 'success', data: { gameId, currentRound, serverTime: new Date().toISOString(), timeRemainingMs: Math.max(0, closesAt - now) } });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) logger.error('Failed to fetch game state', { gameId: requestedGameId, error: err.message });
    return res.status(status).json({ status: 'error', code: err.code || 'GAME_STATE_FAILED', message: status >= 500 ? 'Failed to fetch game state' : err.message });
  }
});

router.get('/7updown/current-round', async (req, res) => {
  try {
    const { engine } = await requireLiveGame('seven_up_down');
    const currentRound = engine.currentRound;
    if (!currentRound) return res.status(503).json({ status: 'error', code: 'GAME_NOT_READY', message: '7 Up Down worker is not ready yet.' });
    const now = Date.now();
    const createdAtMs = Date.parse(currentRound.createdAt || '');
    const closedAtMs = Date.parse(currentRound.bettingClosedAt || '');
    const bettingClosesAtMs = Number.isFinite(closedAtMs) && closedAtMs > 0 ? closedAtMs : (Number.isFinite(createdAtMs) ? createdAtMs + 15000 : now);
    return res.status(200).json({ status: 'success', data: { gameId: 'seven_up_down', roundId: currentRound.roundId, currentRound, serverTime: new Date(now).toISOString(), timeRemainingMs: Math.max(0, bettingClosesAtMs - now), bettingClosesAt: new Date(bettingClosesAtMs).toISOString() } });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) logger.error('Failed to fetch 7 Up Down current round', { error: err.message });
    return res.status(status).json({ status: 'error', code: err.code || 'GAME_ROUND_FAILED', message: status >= 500 ? 'Failed to fetch current game round' : err.message });
  }
});

router.get('/7updown/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const rounds = await gameRepo.getRecentRoundsFromDb(limit);
    const safe = rounds.map((r) => ({ ...r, serverSeed: r.status === 'SETTLED' ? r.serverSeed : null }));
    return res.status(200).json({ status: 'success', data: safe });
  } catch (err) {
    logger.error('Failed to fetch 7 Up Down history', { error: err.message });
    return res.status(500).json({ status: 'error', message: 'Failed to fetch game history' });
  }
});

// Backward-compatible adapter for the bundled 7 Up Down client.
router.post('/join', betLimiter, authMiddleware, async (req, res) => {
  try {
    await requireLiveGame('seven_up_down');
    const { gameId, roundId, betType, stakeAmount, stake, stakePaise, idempotencyKey } = req.body || {};
    if (gameId && !['game_7_up_down', 'seven_up_down', '7updown'].includes(String(gameId))) return res.status(400).json({ status: 'error', code: 'INVALID_GAME', message: 'Unsupported game.' });
    if (!betType) return res.status(400).json({ status: 'error', code: 'BET_TYPE_REQUIRED', message: 'betType is required' });
    const computedStakePaise = validation.resolveStakePaise({ stakePaise, stake: stake !== undefined ? stake : stakeAmount }, 'stake');
    validation.validateBetType(betType, 'seven_up_down');
    validation.validateIdempotencyKey(idempotencyKey);
    const { bet, isDuplicate } = await sevenUpDownEngine.placeBet({ userId: req.user.id, betType, stakePaise: computedStakePaise, idempotencyKey });
    const wallet = await walletRepo.getWalletByUserId(req.user.id);
    return res.status(200).json({ status: 'success', data: { bet: { id: bet.id, roundId: bet.round_id || roundId, betType: bet.bet_type || betType, stake: parseInt(bet.stake || computedStakePaise, 10) / 100, stakePaise: parseInt(bet.stake || computedStakePaise, 10), status: bet.status, isDuplicate }, wallet } });
  } catch (err) {
    const status = err.statusCode || 400;
    if (status >= 500) logger.error('Legacy game join failed', { userId: req.user?.id, error: err.message });
    return res.status(status).json({ status: 'error', code: err.code || 'BET_FAILED', message: err.message || 'Failed to place bet' });
  }
});

router.post('/7updown/bets', betLimiter, authMiddleware, async (req, res) => {
  try {
    await requireLiveGame('seven_up_down');
    const userId = req.user.id;
    const { roundId, bets, betType, stake, stakePaise, idempotencyKey } = req.body;
    let betList = [];
    if (Array.isArray(bets) && bets.length > 0) betList = bets;
    else if (betType) betList = [{ betType, stakePaise, stake, idempotencyKey }];
    else return res.status(400).json({ status: 'error', message: 'bets array or betType is required' });
    const activeRoundId = sevenUpDownEngine.currentRound?.roundId || roundId;
    if (!activeRoundId) return res.status(503).json({ status: 'error', code: 'GAME_NOT_READY', message: 'Game worker is not ready yet.' });
    validation.validateIdempotencyKey(idempotencyKey);
    const normalizedBets = betList.map((betItem, i) => {
      const itemStakePaise = validation.resolveStakePaise({ stakePaise: betItem.stakePaise, stake: betItem.stake }, 'stake');
      validation.validateBetType(betItem.betType, 'seven_up_down');
      const clientKey = validation.validateIdempotencyKey(betItem.idempotencyKey);
      const itemKey = clientKey || idempotencyKey || `sud_${userId}_${activeRoundId}_${betItem.betType}_${itemStakePaise}_${i}`;
      return { betType: betItem.betType, stakePaise: itemStakePaise, idempotencyKey: itemKey };
    });
    const placedBets = [];
    for (const betItem of normalizedBets) {
      const { bet, isDuplicate } = await sevenUpDownEngine.placeBet({ userId, betType: betItem.betType, stakePaise: betItem.stakePaise, idempotencyKey: betItem.idempotencyKey });
      placedBets.push({ id: bet.id, roundId: bet.round_id || roundId, betType: bet.bet_type || betItem.betType, stake: parseInt(bet.stake || betItem.stakePaise, 10) / 100, stakePaise: parseInt(bet.stake || betItem.stakePaise, 10), status: bet.status, isDuplicate });
    }
    const updatedWallet = await walletRepo.getWalletByUserId(userId);
    return res.status(200).json({ status: 'success', data: { bets: placedBets, wallet: updatedWallet } });
  } catch (err) {
    const status = err.statusCode || 400;
    if (status >= 500) logger.error('7 Up Down bet failed', { userId: req.user?.id, error: err.message });
    return res.status(status).json({ status: 'error', code: err.code || 'BET_FAILED', message: err.message || 'Failed to place bet' });
  }
});

router.post('/dragon_tiger/bets', betLimiter, authMiddleware, async (req, res) => {
  try {
    await requireLiveGame('dragon_tiger');
    const userId = req.user.id;
    const { betType, stake, stakePaise, idempotencyKey } = req.body;
    const computedStakePaise = validation.resolveStakePaise({ stakePaise, stake });
    validation.validateBetType(betType, 'dragon_tiger');
    validation.validateIdempotencyKey(idempotencyKey);
    const { bet, wallet } = await dragonTigerEngine.placeBet({ userId, betType, stakePaise: computedStakePaise, idempotencyKey });
    return res.status(200).json({ status: 'success', data: { bet, wallet } });
  } catch (err) {
    const status = err.statusCode || 400;
    if (status >= 500) logger.error('Dragon Tiger bet failed', { userId: req.user?.id, error: err.message });
    return res.status(status).json({ status: 'error', code: err.code || 'BET_FAILED', message: err.message });
  }
});

router.post('/crush/bets', betLimiter, authMiddleware, async (req, res) => {
  try {
    await requireLiveGame('crush');
    const userId = req.user.id;
    const { stake, stakePaise, autoCashoutMultiplier, idempotencyKey } = req.body;
    const computedStakePaise = validation.resolveStakePaise({ stakePaise, stake });
    validation.validateIdempotencyKey(idempotencyKey);
    const { bet, wallet } = await crushEngine.placeBet({ userId, stakePaise: computedStakePaise, autoCashoutMultiplier, idempotencyKey });
    return res.status(200).json({ status: 'success', data: { bet, wallet } });
  } catch (err) {
    const status = err.statusCode || 400;
    if (status >= 500) logger.error('Crush bet failed', { userId: req.user?.id, error: err.message });
    return res.status(status).json({ status: 'error', code: err.code || 'BET_FAILED', message: err.message });
  }
});

router.post('/crush/cashout', cashoutLimiter, authMiddleware, async (req, res) => {
  try {
    await requireLiveGame('crush');
    const userId = req.user.id;
    const { betId } = validation.validateCashoutRequest(req.body);
    const result = await crushEngine.cashoutBet({ betId, userId });
    return res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    const status = err.statusCode || 400;
    if (status >= 500) logger.error('Crush cashout failed', { userId: req.user?.id, error: err.message });
    return res.status(status).json({ status: 'error', code: err.code || 'CASHOUT_FAILED', message: err.message });
  }
});

router.get('/bet-history', authMiddleware, async (req, res) => {
  try {
    const dbRes = await query('SELECT b.id, b.round_id as "roundId", b.bet_type as "betType", b.stake, b.win_amount as "winAmount", b.status, b.created_at timestamp, r.game_id as "gameId" FROM bets b LEFT JOIN game_rounds r ON r.id = b.round_id WHERE b.user_id = $1 ORDER BY b.created_at DESC LIMIT 50', [req.user.id]);
    return res.status(200).json({ status: 'success', data: dbRes.rows });
  } catch (err) {
    logger.error('Failed to fetch bet history', { userId: req.user?.id, error: err.message });
    return res.status(500).json({ status: 'error', message: 'Failed to fetch bet history' });
  }
});

module.exports = router;
