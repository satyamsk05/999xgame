const crypto = require('crypto');
const { query, getClient } = require('../../database/db');
const logger = require('../../utils/logger');
const financialService = require('../../services/financial.service');
const { DRAGON_TIGER_PAYOUTS, DRAGON_TIGER_TIE_PUSH_RATIO, DEFAULT_STAKE_LIMITS_PAISE } = require('../game.config');

/**
 * Dragon Tiger repository — server-authoritative, atomic (sec 23).
 *
 * Payouts come from the centralized game.config (never hardcoded here). Settlement is
 * a single atomic transaction that credits winners, records settlements and marks the
 * round SETTLED together, so a round can never be "settled" without its payouts.
 */

async function createRoundInDb(roundId, serverSeed, serverSeedHash) {
  try {
    const res = await query(
      `INSERT INTO game_rounds (id, game_id, round_number, status, server_seed, server_seed_hash, started_at, created_at)
       VALUES ($1, 'dragon_tiger',
         (SELECT COALESCE(MAX(round_number), 0) + 1 FROM game_rounds WHERE game_id = 'dragon_tiger'),
         'CREATED', $2, $3, NOW(), NOW())
       RETURNING *`,
      [roundId, serverSeed, serverSeedHash]
    );
    return res.rows[0];
  } catch (err) {
    logger.error('Failed to insert Dragon Tiger round into DB', { roundId, error: err.message });
    throw err;
  }
}

async function updateRoundInDb(roundId, status, dragonCard = null, tigerCard = null, winningBetType = null) {
  try {
    const res = await query(
      `UPDATE game_rounds
       SET status = $2,
           result = COALESCE($3::jsonb, result),
           ended_at = CASE WHEN $2 IN ('SETTLED', 'CANCELLED') THEN NOW() ELSE ended_at END
       WHERE id = $1
       RETURNING *`,
      [
        roundId,
        status,
        dragonCard ? JSON.stringify({ dragonCard, tigerCard, winningBetType }) : null,
      ]
    );
    return res.rows[0];
  } catch (err) {
    logger.error('Failed to update Dragon Tiger round in DB', { roundId, status, error: err.message });
    throw err;
  }
}

/** DB-controlled stake limits (sec 21.7 / 23). Falls back to centralized defaults. */
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

/** Payout multiplier for a bet type — centralized (sec 23). */
function getPayoutMultiplier(betType) {
  const m = DRAGON_TIGER_PAYOUTS[betType];
  if (m === undefined) throw new Error(`Invalid bet type: ${betType}`);
  return m;
}

async function placeBetInDb({ userId, roundId, betType, stakePaise, idempotencyKey }) {
  const stake = parseInt(stakePaise, 10);
  if (!Number.isInteger(stake) || stake <= 0) {
    const e = new Error('Stake must be a positive integer in paise');
    e.statusCode = 400;
    throw e;
  }
  const limits = await getStakeLimits('dragon_tiger', DEFAULT_STAKE_LIMITS_PAISE);
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

  const payoutMultiplier = getPayoutMultiplier(betType);
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // DB-authoritative round status (sec 23): lock the round row.
    const roundRes = await client.query('SELECT id, status FROM game_rounds WHERE id = $1 FOR UPDATE', [roundId]);
    if (!roundRes.rows.length || roundRes.rows[0].status !== 'BETTING_OPEN') {
      const e = new Error('Betting is closed for this round');
      e.statusCode = 409;
      throw e;
    }

    // Idempotent replay: return the original bet without debiting again.
    if (idempotencyKey) {
      const dupRes = await client.query('SELECT * FROM bets WHERE idempotency_key = $1', [idempotencyKey]);
      if (dupRes.rows.length > 0) {
        await client.query('COMMIT');
        return { bet: dupRes.rows[0], duplicate: true };
      }
    }

    const betId = `dt_bet_${crypto.randomUUID()}`;
    // Insert the bet FIRST (UNIQUE idempotency_key guards races), then debit atomically.
    const betInsertRes = await client.query(
      `INSERT INTO bets (id, round_id, user_id, bet_type, stake, payout_multiplier, status, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACCEPTED', $7, NOW())
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [betId, roundId, userId, betType, stake, payoutMultiplier, idempotencyKey || null]
    );

    if (betInsertRes.rows.length === 0) {
      const existing = await client.query('SELECT * FROM bets WHERE idempotency_key = $1', [idempotencyKey]);
      await client.query('COMMIT');
      return { bet: existing.rows[0], duplicate: true };
    }

    const debitResult = await financialService.debitWallet(client, stake, {
      userId,
      type: 'BET_DEBIT',
      referenceType: 'GAME_BET',
      referenceId: betId,
      idempotencyKey: `dt_debit_${betId}`,
      metadata: { gameId: 'dragon_tiger', roundId, betType, stakePaise: stake },
    });

    await client.query('COMMIT');
    logger.info('Dragon Tiger bet placed & wallet debited', { userId, roundId, betId, stakePaise: stake });
    return { bet: betInsertRes.rows[0], wallet: debitResult.wallet, duplicate: false };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to place Dragon Tiger bet in DB', { userId, roundId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Atomic settlement (sec 23): credits winners, records a settlement per bet and marks
 * the round SETTLED — all in ONE transaction. Idempotent (round-status guard +
 * settlement UNIQUE(bet_id) + ledger idempotency), so a retry/recovery never double-pays.
 * Tie behaviour is explicit: DRAGON/TIGER main bets push 50% (REFUNDED); a TIE bet wins.
 */
async function settleRoundInDb(roundId, winningBetType) {
  const client = await getClient();
  const settlements = [];
  try {
    await client.query('BEGIN');

    const roundRes = await client.query('SELECT id, status FROM game_rounds WHERE id = $1 FOR UPDATE', [roundId]);
    if (!roundRes.rows.length) {
      const e = new Error(`Cannot settle: round ${roundId} not found`);
      e.statusCode = 404;
      throw e;
    }
    if (['SETTLED', 'CANCELLED'].includes(roundRes.rows[0].status)) {
      await client.query('COMMIT');
      return { settlements: [], alreadySettled: true };
    }

    const betsRes = await client.query(`SELECT * FROM bets WHERE round_id = $1 AND status = 'ACCEPTED' FOR UPDATE`, [roundId]);

    for (const bet of betsRes.rows) {
      const isWin = bet.bet_type === winningBetType;
      const isTiePush = winningBetType === 'TIE' && (bet.bet_type === 'DRAGON' || bet.bet_type === 'TIGER');

      let winAmountPaise = 0;
      let newStatus = 'LOST';
      if (isWin) {
        winAmountPaise = Math.floor(parseInt(bet.stake, 10) * parseFloat(bet.payout_multiplier));
        newStatus = 'WON';
      } else if (isTiePush) {
        winAmountPaise = Math.floor(parseInt(bet.stake, 10) * DRAGON_TIGER_TIE_PUSH_RATIO);
        newStatus = 'REFUNDED';
      }

      if (winAmountPaise > 0) {
        await financialService.creditWallet(client, winAmountPaise, {
          userId: bet.user_id,
          type: isTiePush ? 'REFUND' : 'WIN_CREDIT',
          referenceType: isTiePush ? 'GAME_BET' : 'GAME_WIN',
          referenceId: bet.id,
          idempotencyKey: `dt_win_${bet.id}`,
          metadata: { gameId: 'dragon_tiger', roundId, betId: bet.id, winAmountPaise, tiePush: isTiePush },
        });
      }

      await client.query(
        `UPDATE bets SET status = $2, win_amount = $3, settled_at = NOW() WHERE id = $1`,
        [bet.id, newStatus, winAmountPaise]
      );
      await client.query(
        `INSERT INTO settlements (id, bet_id, round_id, user_id, win_amount, status, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, 'SETTLED', $6, NOW())
         ON CONFLICT (bet_id) DO NOTHING`,
        [`dt_stl_${bet.id}`, bet.id, roundId, bet.user_id, winAmountPaise, JSON.stringify({ winningBetType, tiePush: isTiePush })]
      );

      settlements.push({ betId: bet.id, userId: bet.user_id, betType: bet.bet_type, status: newStatus, winAmountRupees: winAmountPaise / 100 });
    }

    // sec 23: mark the round SETTLED inside the SAME transaction as the payouts.
    await client.query(`UPDATE game_rounds SET status = 'SETTLED', ended_at = NOW() WHERE id = $1`, [roundId]);
    await client.query('COMMIT');
    logger.info('Dragon Tiger round settled', { roundId, winningBetType, totalBets: betsRes.rows.length });
    return { settlements, alreadySettled: false };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to settle Dragon Tiger round in DB', { roundId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Recovery (sec 22/23): void a round that cannot be resolved fairly and refund every
 * ACCEPTED bet. Atomic + idempotent.
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
        idempotencyKey: `dt_refund_${bet.id}`,
        metadata: { gameId: 'dragon_tiger', roundId, betId: bet.id, reason },
      });
      await client.query(`UPDATE bets SET status = 'REFUNDED', win_amount = 0, settled_at = NOW() WHERE id = $1`, [bet.id]);
      await client.query(
        `INSERT INTO settlements (id, bet_id, round_id, user_id, win_amount, status, metadata, created_at)
         VALUES ($1, $2, $3, $4, 0, 'REFUNDED', $5, NOW())
         ON CONFLICT (bet_id) DO NOTHING`,
        [`dt_stl_${bet.id}`, bet.id, roundId, bet.user_id, JSON.stringify({ reason })]
      );
    }
    await client.query(`UPDATE game_rounds SET status = 'CANCELLED', ended_at = NOW() WHERE id = $1`, [roundId]);
    await client.query('COMMIT');
    logger.warn('Dragon Tiger round refunded (voided)', { roundId, refunded: betsRes.rows.length, reason });
    return { refunded: betsRes.rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to refund Dragon Tiger round', { roundId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/** Non-terminal rounds for startup recovery (sec 22/23), oldest first. */
async function getInFlightRoundsFromDb() {
  const res = await query(
    `SELECT id as "roundId", round_number as "roundNumber", status, result,
            server_seed as "serverSeed", server_seed_hash as "serverSeedHash", created_at as "createdAt"
     FROM game_rounds
     WHERE game_id = 'dragon_tiger'
       AND status IN ('CREATED','BETTING_OPEN','BETTING_CLOSED','RESULT','SETTLING')
     ORDER BY created_at ASC`
  );
  return res.rows.map(row => ({
    roundId: row.roundId,
    roundNumber: row.roundNumber,
    status: row.status,
    dragonCard: row.result?.dragonCard ?? null,
    tigerCard: row.result?.tigerCard ?? null,
    winningBetType: row.result?.winningBetType ?? null,
    serverSeed: row.serverSeed ?? null,
    serverSeedHash: row.serverSeedHash ?? null,
    createdAt: row.createdAt,
  }));
}

module.exports = {
  createRoundInDb,
  updateRoundInDb,
  getStakeLimits,
  getPayoutMultiplier,
  placeBetInDb,
  settleRoundInDb,
  refundRoundInDb,
  getInFlightRoundsFromDb,
};
