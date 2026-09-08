const crypto = require('crypto');
const { query, getClient } = require('../../database/db');
const logger = require('../../utils/logger');
const financialService = require('../../services/financial.service');

/**
 * Persist new 7 Up Down round in PostgreSQL
 */
async function createRoundInDb(roundId, roundNumber, serverSeed, serverSeedHash) {
  const res = await query(
    `INSERT INTO game_rounds (id, game_id, round_number, status, server_seed, created_at)
     VALUES ($1, 'seven_up_down', $2, 'CREATED', $3, NOW())
     RETURNING *`,
    [roundId, roundNumber, serverSeed]
  );
  return res.rows[0];
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
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Check round status in DB
    const roundRes = await client.query('SELECT status FROM game_rounds WHERE id = $1', [roundId]);
    if (roundRes.rows.length === 0 || roundRes.rows[0].status !== 'BETTING_OPEN') {
      throw new Error('Betting is closed or invalid for current round');
    }

    // 2. Insert Bet Record (UNIQUE constraint on idempotency_key at SQL level)
    const betId = `bet_${crypto.randomUUID()}`;
    const betRes = await client.query(
      `INSERT INTO bets (id, round_id, user_id, bet_type, stake, payout_multiplier, status, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACCEPTED', $7, NOW())
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [betId, roundId, userId, betType, stakePaise, getMultiplier(betType), idempotencyKey]
    );

    if (betRes.rows.length === 0) {
      // Idempotency triggered — fetch existing bet
      const existingBetRes = await client.query('SELECT * FROM bets WHERE idempotency_key = $1', [idempotencyKey]);
      await client.query('ROLLBACK');
      return { bet: existingBetRes.rows[0], isDuplicate: true };
    }

    // 3. Debit wallet using financialService inside client transaction
    await financialService.debitWallet(client, stakePaise, {
      userId,
      type: 'BET_DEBIT',
      referenceType: 'GAME_BET',
      referenceId: betId,
      idempotencyKey: `idemp_bet_${betId}`,
      metadata: { roundId, betType },
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
    `SELECT id as "roundId", round_number as "roundNumber", status, result, created_at as "createdAt", ended_at as "endedAt"
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

function getMultiplier(betType) {
  if (betType === 'SEVEN') return 5.0;
  if (betType === 'DOWN' || betType === 'UP') return 2.0;
  throw new Error(`Invalid bet type: ${betType}`);
}

module.exports = {
  createRoundInDb,
  updateRoundInDb,
  placeBetInDb,
  settleRoundInDb,
  getRecentRoundsFromDb,
  getRoundByIdFromDb,
  getUserBetsForRoundInDb,
};

