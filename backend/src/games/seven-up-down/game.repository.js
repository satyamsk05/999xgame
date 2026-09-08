const crypto = require('crypto');
const { query, getClient } = require('../../database/db');
const logger = require('../../utils/logger');
const financialService = require('../../services/financial.service');
const { SEVEN_UP_DOWN_PAYOUTS, DEFAULT_STAKE_LIMITS_PAISE } = require('../game.config');

/**
 * Persist a new 7 Up Down round (sec 21.1). Stores BOTH server_seed and
 * server_seed_hash (commit/reveal) and derives round_number from the DB so it
 * survives restarts and never collides with UNIQUE(game_id, round_number).
 */
async function createRoundInDb(roundId, serverSeed, serverSeedHash) {
  const res = await query(
    `INSERT INTO game_rounds (id, game_id, round_number, status, server_seed, server_seed_hash, created_at)
     VALUES ($1, 'seven_up_down',
       (SELECT COALESCE(MAX(round_number), 0) + 1 FROM game_rounds WHERE game_id = 'seven_up_down'),
       'CREATED', $2, $3, NOW())
     RETURNING *`,
    [roundId, serverSeed, serverSeedHash]
  );
  return res.rows[0];
}

/**
 * DB-controlled stake limits (sec 21.7). Falls back to centralized defaults.
 */
async function getStakeLimits(gameId, fallback) {
  try {
    const res = await query('SELECT min_stake, max_stake FROM games WHERE id = $1', [gameId]);
    if (res.rows.length) {
      return {
        min: parseInt(res.rows[0].min_stake, 10) || fallback.min,
        max: parseInt(res.rows[0].max_stake, 10) || fallback.max,
      };
    }
  } catch (err) {
    logger.warn('Failed to read stake limits; using defaults', { gameId, error: err.message });
  }
  return fallback;
}

/**
 * Update round status & result in PostgreSQL
 */
async function updateRoundInDb(roundId, status, dice1 = null, dice2 = null, diceSum = null, winningBetType = null) {
  const resultObj = (diceSum !== null) ? JSON.stringify({ dice1, dice2, diceSum, winningBetType }) : null;
  const res = await query(
    `UPDATE game_rounds
     SET status = $2::varchar,
         result = COALESCE($3::jsonb, result),
         betting_closed_at = CASE WHEN $2::varchar = 'BETTING_CLOSED' THEN NOW() ELSE betting_closed_at END,
         ended_at = CASE WHEN $2::varchar = 'SETTLED' THEN NOW() ELSE ended_at END
     WHERE id = $1
     RETURNING *`,
    [roundId, status, resultObj]
  );
  return res.rows[0];
}

/**
 * Place Bet with Atomic PostgreSQL Wallet Debit + Ledger + DB Idempotency
 */
async function placeBetInDb({ userId, roundId, betType, stakePaise, idempotencyKey }) {
  const stake = parseInt(stakePaise, 10);
  if (!Number.isInteger(stake) || stake <= 0) {
    const e = new Error('Stake must be a positive integer in paise');
    e.statusCode = 400;
    throw e;
  }
  const limits = await getStakeLimits('seven_up_down', DEFAULT_STAKE_LIMITS_PAISE);
  if (stake < limits.min) {
    const e = new Error(`Minimum bet is ₹${(limits.min / 100).toFixed(2)}`);
    e.statusCode = 400;
    throw e;
  }
  if (stake > limits.max) {
    const e = new Error(`Maximum bet is ₹${(limits.max / 100).toFixed(2)}`);
    e.statusCode = 400;
    throw e;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. DB-authoritative round status (sec 21.6): lock the round row.
    const roundRes = await client.query('SELECT status FROM game_rounds WHERE id = $1 FOR UPDATE', [roundId]);
    if (roundRes.rows.length === 0 || roundRes.rows[0].status !== 'BETTING_OPEN') {
      const e = new Error('Betting is closed or invalid for current round');
      e.statusCode = 409;
      throw e;
    }

    // 2. Insert Bet Record (UNIQUE constraint on idempotency_key at SQL level)
    const betId = `bet_${crypto.randomUUID()}`;
    const betRes = await client.query(
      `INSERT INTO bets (id, round_id, user_id, bet_type, stake, payout_multiplier, status, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACCEPTED', $7, NOW())
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [betId, roundId, userId, betType, stake, getMultiplier(betType), idempotencyKey]
    );

    if (betRes.rows.length === 0) {
      // Idempotency triggered — fetch existing bet
      const existingBetRes = await client.query('SELECT * FROM bets WHERE idempotency_key = $1', [idempotencyKey]);
      await client.query('ROLLBACK');
      return { bet: existingBetRes.rows[0], isDuplicate: true };
    }

    // 3. Debit wallet using financialService inside client transaction
    await financialService.debitWallet(client, stake, {
      userId,
      type: 'BET_DEBIT',
      referenceType: 'GAME_BET',
      referenceId: betId,
      idempotencyKey: `idemp_bet_${betId}`,
      metadata: { gameId: 'seven_up_down', roundId, betType, stakePaise: stake },
    });

    await client.query('COMMIT');

    logger.info('Bet placed & wallet debited in PostgreSQL', { userId, roundId, betId, stakePaise });

    return { bet: betRes.rows[0], isDuplicate: false };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to place bet in DB', { userId, roundId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Settle Round Bets in PostgreSQL with Atomic Wallet Credit + Ledger
 */
async function settleRoundInDb(roundId, winningBetType) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Fetch all accepted bets for this round
    const betsRes = await client.query('SELECT * FROM bets WHERE round_id = $1 AND status = \'ACCEPTED\' FOR UPDATE', [roundId]);
    const bets = betsRes.rows;
    const settlements = [];

    for (const bet of bets) {
      const isWinner = (bet.bet_type === winningBetType);

      const stakePaise = parseInt(bet.stake, 10);
      const mult = parseFloat(bet.payout_multiplier);
      const winAmountPaise = isWinner ? Math.floor(stakePaise * mult) : 0;

      // Update bet status
      await client.query(
        `UPDATE bets SET status = $2, win_amount = $3, settled_at = NOW() WHERE id = $1`,
        [bet.id, isWinner ? 'WON' : 'LOST', winAmountPaise]
      );

      // Insert Settlement record (UNIQUE on bet_id at SQL level)
      const settlementId = `set_${bet.id}`;
      await client.query(
        `INSERT INTO settlements (id, bet_id, round_id, user_id, win_amount, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'SETTLED', NOW())
         ON CONFLICT (bet_id) DO NOTHING`,
        [settlementId, bet.id, roundId, bet.user_id, winAmountPaise]
      );

      // If Winner, Credit Wallet using financialService inside client transaction
      if (isWinner && winAmountPaise > 0) {
        await financialService.creditWallet(client, winAmountPaise, {
          userId: bet.user_id,
          type: 'WIN_CREDIT',
          referenceType: 'GAME_WIN',
          referenceId: bet.id,
          idempotencyKey: `idemp_win_${bet.id}`,
          metadata: { roundId, winningBetType },
        });
      }

      settlements.push({
        betId: bet.id,
        userId: bet.user_id,
        betType: bet.bet_type,
        isWinner,
        winAmountPaise,
      });
    }

    // Update Round status to SETTLED
    await client.query(`UPDATE game_rounds SET status = 'SETTLED', ended_at = NOW() WHERE id = $1`, [roundId]);

    await client.query('COMMIT');
    logger.info('Round settled in PostgreSQL DB', { roundId, totalBets: bets.length, winningBetType });

    return settlements;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to settle round in DB', { roundId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Fetch recent finished/active game rounds for history
 */
async function getRecentRoundsFromDb(limit = 50) {
  const res = await query(
    `SELECT id as "roundId", round_number as "roundNumber", status, result,
            server_seed as "serverSeed", server_seed_hash as "serverSeedHash",
            created_at as "createdAt", ended_at as "endedAt"
     FROM game_rounds
     WHERE game_id = 'seven_up_down'
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows.map(row => ({
    roundId: row.roundId,
    roundNumber: row.roundNumber,
    status: row.status,
    dice1: row.result?.dice1 ?? null,
    dice2: row.result?.dice2 ?? null,
    diceSum: row.result?.diceSum ?? null,
    winningBetType: row.result?.winningBetType ?? null,
    serverSeed: row.serverSeed ?? null,
    serverSeedHash: row.serverSeedHash ?? null,
    createdAt: row.createdAt,
    endedAt: row.endedAt,
  }));
}

/**
 * Fetch round by ID from DB
 */
async function getRoundByIdFromDb(roundId) {
  const res = await query(
    `SELECT id as "roundId", round_number as "roundNumber", status, result, created_at as "createdAt", ended_at as "endedAt"
     FROM game_rounds
     WHERE id = $1`,
    [roundId]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    roundId: row.roundId,
    roundNumber: row.roundNumber,
    status: row.status,
    dice1: row.result?.dice1 ?? null,
    dice2: row.result?.dice2 ?? null,
    diceSum: row.result?.diceSum ?? null,
    winningBetType: row.result?.winningBetType ?? null,
    createdAt: row.createdAt,
    endedAt: row.endedAt,
  };
}

/**
 * Fetch user bets for a given round
 */
async function getUserBetsForRoundInDb(roundId, userId) {
  const res = await query(
    `SELECT id, round_id as "roundId", bet_type as "betType", stake, payout_multiplier as "payoutMultiplier", win_amount as "winAmount", status, created_at as "createdAt"
     FROM bets
     WHERE round_id = $1 AND user_id = $2
     ORDER BY created_at ASC`,
    [roundId, userId]
  );
  return res.rows.map(row => ({
    id: row.id,
    roundId: row.roundId,
    betType: row.betType,
    stake: parseInt(row.stake || 0, 10) / 100,
    winAmount: parseInt(row.winAmount || 0, 10) / 100,
    status: row.status,
    createdAt: row.createdAt,
  }));
}

/**
 * Recovery (sec 22): void a round that can no longer be resolved fairly and refund
 * every ACCEPTED bet. Atomic + idempotent (credit key per bet, settlement UNIQUE).
 */
async function refundRoundInDb(roundId, reason = 'ROUND_VOIDED') {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const roundRes = await client.query('SELECT id, status FROM game_rounds WHERE id = $1 FOR UPDATE', [roundId]);
    if (!roundRes.rows.length) {
      await client.query('COMMIT');
      return { refunded: 0 };
    }
    if (['SETTLED', 'CANCELLED'].includes(roundRes.rows[0].status)) {
      await client.query('COMMIT');
      return { refunded: 0, alreadyFinal: true };
    }
    const betsRes = await client.query(`SELECT * FROM bets WHERE round_id = $1 AND status = 'ACCEPTED' FOR UPDATE`, [roundId]);
    for (const bet of betsRes.rows) {
      const stake = parseInt(bet.stake, 10);
      await financialService.creditWallet(client, stake, {
        userId: bet.user_id,
        type: 'REFUND',
        referenceType: 'GAME_BET',
        referenceId: bet.id,
        idempotencyKey: `sud_refund_${bet.id}`,
        metadata: { gameId: 'seven_up_down', roundId, betId: bet.id, reason },
      });
      await client.query(`UPDATE bets SET status = 'REFUNDED', win_amount = 0, settled_at = NOW() WHERE id = $1`, [bet.id]);
      await client.query(
        `INSERT INTO settlements (id, bet_id, round_id, user_id, win_amount, status, metadata, created_at)
         VALUES ($1, $2, $3, $4, 0, 'REFUNDED', $5, NOW())
         ON CONFLICT (bet_id) DO NOTHING`,
        [`set_${bet.id}`, bet.id, roundId, bet.user_id, JSON.stringify({ reason })]
      );
    }
    await client.query(`UPDATE game_rounds SET status = 'CANCELLED', ended_at = NOW() WHERE id = $1`, [roundId]);
    await client.query('COMMIT');
    logger.warn('7 Up Down round refunded (voided)', { roundId, refunded: betsRes.rows.length, reason });
    return { refunded: betsRes.rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to refund 7 Up Down round', { roundId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Non-terminal rounds for startup recovery (sec 22), oldest first.
 */
async function getInFlightRoundsFromDb() {
  const res = await query(
    `SELECT id as "roundId", round_number as "roundNumber", status, result,
            server_seed as "serverSeed", server_seed_hash as "serverSeedHash",
            created_at as "createdAt"
     FROM game_rounds
     WHERE game_id = 'seven_up_down'
       AND status IN ('CREATED','BETTING_OPEN','BETTING_CLOSED','ROLLING','RESULT','SETTLING')
     ORDER BY created_at ASC`
  );
  return res.rows.map(row => ({
    roundId: row.roundId,
    roundNumber: row.roundNumber,
    status: row.status,
    dice1: row.result?.dice1 ?? null,
    dice2: row.result?.dice2 ?? null,
    diceSum: row.result?.diceSum ?? null,
    winningBetType: row.result?.winningBetType ?? null,
    serverSeed: row.serverSeed ?? null,
    serverSeedHash: row.serverSeedHash ?? null,
    createdAt: row.createdAt,
  }));
}

function getMultiplier(betType) {
  const m = SEVEN_UP_DOWN_PAYOUTS[betType];
  if (m === undefined) throw new Error(`Invalid bet type: ${betType}`);
  return m;
}

module.exports = {
  createRoundInDb,
  updateRoundInDb,
  placeBetInDb,
  settleRoundInDb,
  getStakeLimits,
  refundRoundInDb,
  getInFlightRoundsFromDb,
  getRecentRoundsFromDb,
  getRoundByIdFromDb,
  getUserBetsForRoundInDb,
};

