const crypto = require('crypto');
const { query, getClient } = require('../../database/db');
const logger = require('../../utils/logger');
const financialService = require('../../services/financial.service');

/**
 * Crush repository — server-authoritative money operations (sec 24, 25, 26, 27).
 *
 * Rules enforced here:
 *  - The client NEVER decides the payout multiplier. Cashout uses a server-computed
 *    multiplier and is validated against the DB round state (FLYING) and crash_point.
 *  - Every credit/debit is atomic within ONE transaction sharing the same client.
 *  - Settlement NEVER swallows errors: a failure rolls back and rethrows so the round
 *    is not reported settled and recovery/monitoring can act.
 *  - All payouts are idempotent (settlement UNIQUE(bet_id) + ledger idempotency key),
 *    so concurrent/duplicate cashouts credit exactly once.
 */

function readCrashPoint(round) {
  if (round.crash_point !== null && round.crash_point !== undefined) {
    return parseFloat(round.crash_point);
  }
  if (round.result && typeof round.result === 'object' && round.result.crashPoint != null) {
    return parseFloat(round.result.crashPoint);
  }
  return null;
}

async function createRoundInDb(roundId, serverSeed, serverSeedHash, crashPoint) {
  try {
    // round_number is DB-derived (MAX+1 scoped to the game) so it survives restarts
    // and never collides with the UNIQUE(game_id, round_number) constraint.
    const res = await query(
      `INSERT INTO game_rounds
         (id, game_id, round_number, status, server_seed, server_seed_hash, crash_point, result, started_at, created_at)
       VALUES
         ($1, 'crush',
          (SELECT COALESCE(MAX(round_number), 0) + 1 FROM game_rounds WHERE game_id = 'crush'),
          'CREATED', $2, $3, $4, $5::jsonb, NOW(), NOW())
       RETURNING *`,
      [roundId, serverSeed, serverSeedHash, crashPoint, JSON.stringify({ crashPoint })]
    );
    return res.rows[0];
  } catch (err) {
    logger.error('Failed to insert Crush round into DB', { roundId, error: err.message });
    throw err;
  }
}

async function updateRoundInDb(roundId, status) {
  try {
    const res = await query(
      `UPDATE game_rounds
       SET status = $2,
           ended_at = CASE WHEN $2 IN ('CRASHED', 'SETTLED', 'CANCELLED') THEN NOW() ELSE ended_at END
       WHERE id = $1
       RETURNING *`,
      [roundId, status]
    );
    return res.rows[0];
  } catch (err) {
    logger.error('Failed to update Crush round in DB', { roundId, status, error: err.message });
    throw err;
  }
}

/**
 * Fetch DB-controlled stake limits for a game (sec 21.7). Falls back to defaults.
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

async function placeBetInDb({ userId, roundId, stakePaise, autoCashoutMultiplier, idempotencyKey, stakeLimits }) {
  const stake = parseInt(stakePaise, 10);
  if (!Number.isInteger(stake) || stake <= 0) {
    const e = new Error('Stake must be a positive integer in paise');
    e.statusCode = 400;
    throw e;
  }
  if (stakeLimits) {
    if (stake < stakeLimits.min) {
      const e = new Error(`Minimum bet is ₹${(stakeLimits.min / 100).toFixed(2)}`);
      e.statusCode = 400;
      throw e;
    }
    if (stake > stakeLimits.max) {
      const e = new Error(`Maximum bet is ₹${(stakeLimits.max / 100).toFixed(2)}`);
      e.statusCode = 400;
      throw e;
    }
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // DB-authoritative round status (sec 21.6): accept bets only while FLYING-eligible BETTING_OPEN.
    const roundRes = await client.query('SELECT id, status FROM game_rounds WHERE id = $1 FOR UPDATE', [roundId]);
    if (!roundRes.rows.length || roundRes.rows[0].status !== 'BETTING_OPEN') {
      const e = new Error('Betting is closed for this Crush round');
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

    const betId = `crush_bet_${crypto.randomUUID()}`;
    // payout_multiplier stores the OPTIONAL auto-cashout target (NULL = manual only).
    const autoTarget = Number.isFinite(autoCashoutMultiplier) ? autoCashoutMultiplier : null;

    // Insert the bet FIRST (UNIQUE idempotency_key guards races), then debit atomically.
    const betInsertRes = await client.query(
      `INSERT INTO bets (id, round_id, user_id, bet_type, stake, payout_multiplier, status, idempotency_key, created_at)
       VALUES ($1, $2, $3, 'CRUSH_BET', $4, $5, 'ACCEPTED', $6, NOW())
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [betId, roundId, userId, stake, autoTarget, idempotencyKey || null]
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
      idempotencyKey: `crush_debit_${betId}`,
      metadata: { gameId: 'crush', roundId, stakePaise: stake, autoCashoutMultiplier: autoTarget },
    });

    await client.query('COMMIT');
    logger.info('Crush bet placed & wallet debited', { userId, roundId, betId, stakePaise: stake });
    return { bet: betInsertRes.rows[0], wallet: debitResult.wallet, duplicate: false };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to place Crush bet in DB', { userId, roundId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Server-authoritative cashout (sec 25). `cashoutMultiplier` is computed by the SERVER
 * from authoritative round timing — never taken from the client as truth.
 */
async function cashoutBetInDb({ betId, userId, roundId, cashoutMultiplier }) {
  const multiplier = parseFloat(cashoutMultiplier);
  if (!Number.isFinite(multiplier) || multiplier < 1) {
    const e = new Error('Invalid cashout multiplier');
    e.statusCode = 400;
    throw e;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const roundRes = await client.query('SELECT id, status, crash_point, result FROM game_rounds WHERE id = $1 FOR UPDATE', [roundId]);
    if (!roundRes.rows.length) {
      const e = new Error('Round not found');
      e.statusCode = 404;
      throw e;
    }
    const round = roundRes.rows[0];
    if (round.status !== 'FLYING') {
      const e = new Error(round.status === 'CRASHED' || round.status === 'SETTLED'
        ? 'Rocket crashed before cashout'
        : 'Cashout is only available while the rocket is flying');
      e.statusCode = 409;
      throw e;
    }

    const crashPoint = readCrashPoint(round);
    if (crashPoint !== null && multiplier >= crashPoint) {
      const e = new Error('Rocket crashed before cashout');
      e.statusCode = 409;
      throw e;
    }

    const betRes = await client.query('SELECT * FROM bets WHERE id = $1 AND user_id = $2 FOR UPDATE', [betId, userId]);
    if (!betRes.rows.length) {
      const e = new Error('Bet not found');
      e.statusCode = 404;
      throw e;
    }
    const bet = betRes.rows[0];
    if (bet.status !== 'ACCEPTED') {
      const e = new Error(`Cashout already completed (bet is ${bet.status})`);
      e.statusCode = 409;
      throw e;
    }
    if (bet.round_id !== roundId) {
      const e = new Error('Bet does not belong to the active round');
      e.statusCode = 400;
      throw e;
    }

    const winAmountPaise = Math.floor(parseInt(bet.stake, 10) * multiplier);

    await financialService.creditWallet(client, winAmountPaise, {
      userId,
      type: 'WIN_CREDIT',
      referenceType: 'GAME_WIN',
      referenceId: bet.id,
      idempotencyKey: `crush_cashout_${bet.id}`,
      metadata: { gameId: 'crush', roundId, betId, cashoutMultiplier: multiplier, winAmountPaise },
    });

    const updatedBetRes = await client.query(
      `UPDATE bets SET status = 'WON', win_amount = $2, payout_multiplier = $3, settled_at = NOW()
       WHERE id = $1 RETURNING *`,
      [betId, winAmountPaise, multiplier]
    );

    await client.query(
      `INSERT INTO settlements (id, bet_id, round_id, user_id, win_amount, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'SETTLED', NOW())
       ON CONFLICT (bet_id) DO NOTHING`,
      [`crush_stl_${betId}`, betId, roundId, userId, winAmountPaise]
    );

    await client.query('COMMIT');
    logger.info('Crush cashout executed (server-authoritative)', { betId, userId, roundId, multiplier, winAmountPaise });
    return { bet: updatedBetRes.rows[0], winAmountPaise, winAmountRupees: winAmountPaise / 100, cashoutMultiplier: multiplier };
  } catch (err) {
    await client.query('ROLLBACK');
    if (!err.statusCode) logger.error('Failed to cashout Crush bet in DB', { betId, userId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Auto-cashout enforcement (sec 26). Cashes out every ACCEPTED bet whose stored
 * auto-cashout target has been reached by the authoritative server multiplier.
 * Fully atomic + idempotent; safe to call on every tick.
 */
async function processAutoCashoutsInDb(roundId, upToMultiplier) {
  const cap = parseFloat(upToMultiplier);
  if (!Number.isFinite(cap) || cap < 1) return [];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const betsRes = await client.query(
      `SELECT * FROM bets
       WHERE round_id = $1 AND status = 'ACCEPTED'
         AND payout_multiplier IS NOT NULL
         AND payout_multiplier <= $2
       FOR UPDATE`,
      [roundId, cap]
    );

    const cashed = [];
    for (const bet of betsRes.rows) {
      const target = parseFloat(bet.payout_multiplier);
      const winAmountPaise = Math.floor(parseInt(bet.stake, 10) * target);

      await financialService.creditWallet(client, winAmountPaise, {
        userId: bet.user_id,
        type: 'WIN_CREDIT',
        referenceType: 'GAME_WIN',
        referenceId: bet.id,
        idempotencyKey: `crush_auto_${bet.id}`,
        metadata: { gameId: 'crush', roundId, betId: bet.id, autoCashoutMultiplier: target, winAmountPaise },
      });

      await client.query(
        `UPDATE bets SET status = 'WON', win_amount = $2, settled_at = NOW() WHERE id = $1`,
        [bet.id, winAmountPaise]
      );
      await client.query(
        `INSERT INTO settlements (id, bet_id, round_id, user_id, win_amount, status, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, 'SETTLED', $6, NOW())
         ON CONFLICT (bet_id) DO NOTHING`,
        [`crush_stl_${bet.id}`, bet.id, roundId, bet.user_id, winAmountPaise, JSON.stringify({ auto: true, multiplier: target })]
      );
      cashed.push({ betId: bet.id, userId: bet.user_id, multiplier: target, winAmountPaise });
    }

    await client.query('COMMIT');
    if (cashed.length) logger.info('Crush auto-cashouts executed', { roundId, count: cashed.length, upToMultiplier: cap });
    return cashed;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to process Crush auto-cashouts', { roundId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Crash settlement (sec 24). NEVER swallows errors — rolls back and rethrows.
 * Safety-net: honors any auto-cashout target <= crashPoint that a tick may have missed,
 * then marks all remaining ACCEPTED bets LOST. Records a settlement row for every bet and
 * moves the round to SETTLED atomically.
 */
async function settleCrashedRoundInDb(roundId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const roundRes = await client.query('SELECT id, status, crash_point, result FROM game_rounds WHERE id = $1 FOR UPDATE', [roundId]);
    if (!roundRes.rows.length) {
      const e = new Error(`Cannot settle: round ${roundId} not found`);
      e.statusCode = 404;
      throw e;
    }
    const round = roundRes.rows[0];
    if (round.status === 'SETTLED' || round.status === 'CANCELLED') {
      await client.query('COMMIT');
      return { settlements: [], alreadySettled: true };
    }

    const crashPoint = readCrashPoint(round);
    if (crashPoint === null) {
      throw new Error(`Cannot settle round ${roundId}: crash point unknown`);
    }

    const betsRes = await client.query(
      `SELECT * FROM bets WHERE round_id = $1 AND status = 'ACCEPTED' FOR UPDATE`,
      [roundId]
    );

    const settlements = [];
    for (const bet of betsRes.rows) {
      const autoTarget = bet.payout_multiplier !== null && bet.payout_multiplier !== undefined
        ? parseFloat(bet.payout_multiplier)
        : null;
      // A bet auto-cashes if its target was reached before the crash.
      const winsByAuto = autoTarget !== null && autoTarget <= crashPoint;
      const winAmountPaise = winsByAuto ? Math.floor(parseInt(bet.stake, 10) * autoTarget) : 0;
      const newStatus = winsByAuto ? 'WON' : 'LOST';

      if (winAmountPaise > 0) {
        await financialService.creditWallet(client, winAmountPaise, {
          userId: bet.user_id,
          type: 'WIN_CREDIT',
          referenceType: 'GAME_WIN',
          referenceId: bet.id,
          idempotencyKey: `crush_auto_${bet.id}`,
          metadata: { gameId: 'crush', roundId, betId: bet.id, autoCashoutMultiplier: autoTarget, winAmountPaise, atCrash: true },
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
        [`crush_stl_${bet.id}`, bet.id, roundId, bet.user_id, winAmountPaise, JSON.stringify({ crashPoint, auto: winsByAuto })]
      );
      settlements.push({ betId: bet.id, userId: bet.user_id, status: newStatus, winAmountPaise });
    }

    await client.query(`UPDATE game_rounds SET status = 'SETTLED', ended_at = NOW() WHERE id = $1`, [roundId]);
    await client.query('COMMIT');
    logger.info('Crush round settled', { roundId, crashPoint, totalBets: betsRes.rows.length });
    return { settlements, alreadySettled: false };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to settle Crush round in DB', { roundId, error: err.message });
    throw err; // sec 24: never swallow — the round must NOT be reported settled.
  } finally {
    client.release();
  }
}

/**
 * Recovery helper (sec 22/24): refund every ACCEPTED bet of a round that can no longer
 * be played fairly (e.g. server restarted mid-betting). Atomic + idempotent.
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
        idempotencyKey: `crush_refund_${bet.id}`,
        metadata: { gameId: 'crush', roundId, betId: bet.id, reason },
      });
      await client.query(`UPDATE bets SET status = 'REFUNDED', win_amount = 0, settled_at = NOW() WHERE id = $1`, [bet.id]);
      await client.query(
        `INSERT INTO settlements (id, bet_id, round_id, user_id, win_amount, status, metadata, created_at)
         VALUES ($1, $2, $3, $4, 0, 'REFUNDED', $5, NOW())
         ON CONFLICT (bet_id) DO NOTHING`,
        [`crush_stl_${bet.id}`, bet.id, roundId, bet.user_id, JSON.stringify({ reason })]
      );
    }

    await client.query(`UPDATE game_rounds SET status = 'CANCELLED', ended_at = NOW() WHERE id = $1`, [roundId]);
    await client.query('COMMIT');
    logger.warn('Crush round refunded (voided)', { roundId, refunded: betsRes.rows.length, reason });
    return { refunded: betsRes.rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to refund Crush round', { roundId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Non-terminal rounds for recovery on startup (sec 22).
 */
async function getInFlightRoundsFromDb() {
  const res = await query(
    `SELECT id, round_number, status, server_seed, server_seed_hash, crash_point, result, started_at, created_at
     FROM game_rounds
     WHERE game_id = 'crush'
       AND status IN ('CREATED','BETTING_OPEN','BETTING_CLOSED','FLYING','CRASHED','SETTLING')
     ORDER BY created_at ASC`
  );
  return res.rows;
}

module.exports = {
  createRoundInDb,
  updateRoundInDb,
  getStakeLimits,
  placeBetInDb,
  cashoutBetInDb,
  processAutoCashoutsInDb,
  settleCrashedRoundInDb,
  refundRoundInDb,
  getInFlightRoundsFromDb,
  readCrashPoint,
};
