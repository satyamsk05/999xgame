const { query, getClient } = require('../../database/db');
const logger = require('../../utils/logger');
const financialService = require('../../services/financial.service');

async function createRoundInDb(roundId, roundNumber, serverSeed, serverSeedHash, crashPoint) {
  try {
    const res = await query(
      `INSERT INTO game_rounds (id, game_id, round_number, status, server_seed, client_seed, result, started_at, created_at)
       VALUES ($1, 'crush', $2, 'CREATED', $3, $4, $5::jsonb, NOW(), NOW())
       RETURNING *`,
      [roundId, roundNumber, serverSeed, serverSeedHash, JSON.stringify({ crashPoint })]
    );
    return res.rows[0];
  } catch (err) {
    logger.error('Failed to insert Crush round into DB', { roundId, error: err.message });
    throw err;
  }
}

async function updateRoundInDb(roundId, status, crashPoint = null) {
  try {
    const res = await query(
      `UPDATE game_rounds
       SET status = $2,
           ended_at = CASE WHEN $2 IN ('CRASHED', 'SETTLED') THEN NOW() ELSE ended_at END
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

async function placeBetInDb({ userId, roundId, stakePaise, autoCashoutMultiplier, idempotencyKey }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const roundRes = await client.query('SELECT * FROM game_rounds WHERE id = $1 FOR UPDATE', [roundId]);
    if (!roundRes.rows.length || roundRes.rows[0].status !== 'BETTING_OPEN') {
      throw new Error('Betting is closed for this Crush round');
    }

    if (idempotencyKey) {
      const dupRes = await client.query('SELECT * FROM bets WHERE idempotency_key = $1', [idempotencyKey]);
      if (dupRes.rows.length > 0) {
        await client.query('COMMIT');
        return { bet: dupRes.rows[0], duplicate: true };
      }
    }

    const debitResult = await financialService.debitWallet(client, stakePaise, {
      userId,
      type: 'BET_DEBIT',
      referenceType: 'GAME_BET',
      referenceId: roundId,
      idempotencyKey,
      metadata: { gameId: 'crush', roundId, stakePaise, autoCashoutMultiplier },
    });

    const betId = `crush_bet_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const betInsertRes = await client.query(
      `INSERT INTO bets (id, round_id, user_id, bet_type, stake, payout_multiplier, status, idempotency_key, created_at)
       VALUES ($1, $2, $3, 'CRUSH_BET', $4, $5, 'ACCEPTED', $6, NOW())
       RETURNING *`,
      [betId, roundId, userId, stakePaise, autoCashoutMultiplier || 2.0, idempotencyKey || null]
    );

    await client.query('COMMIT');

    return {
      bet: betInsertRes.rows[0],
      wallet: debitResult.wallet,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to place Crush bet in DB', { userId, roundId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

async function cashoutBetInDb({ betId, userId, roundId, cashoutMultiplier }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const betRes = await client.query('SELECT * FROM bets WHERE id = $1 AND user_id = $2 FOR UPDATE', [betId, userId]);
    if (!betRes.rows.length) throw new Error('Bet not found');

    const bet = betRes.rows[0];
    if (bet.status !== 'ACCEPTED') {
      throw new Error(`Bet is already ${bet.status}`);
    }

    const winAmountPaise = Math.floor(parseInt(bet.stake, 10) * cashoutMultiplier);

    await financialService.creditWallet(client, winAmountPaise, {
      userId,
      type: 'WIN_CREDIT',
      referenceType: 'GAME_WIN',
      referenceId: bet.id,
      idempotencyKey: `crush_cashout_${bet.id}`,
      metadata: { gameId: 'crush', roundId, betId, cashoutMultiplier, winAmountPaise },
    });

    const updatedBetRes = await client.query(
      `UPDATE bets SET status = 'WON', win_amount = $2, payout_multiplier = $3, settled_at = NOW() WHERE id = $1 RETURNING *`,
      [betId, winAmountPaise, cashoutMultiplier]
    );

    await client.query(
      `INSERT INTO settlements (id, bet_id, round_id, user_id, win_amount, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'SETTLED', NOW())
       ON CONFLICT (bet_id) DO NOTHING`,
      [`crush_stl_${betId}`, betId, roundId, userId, winAmountPaise]
    );

    await client.query('COMMIT');

    return {
      bet: updatedBetRes.rows[0],
      winAmountRupees: winAmountPaise / 100,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to cashout Crush bet in DB', { betId, userId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

async function settleCrashedRoundInDb(roundId) {
  try {
    await query(
      `UPDATE bets SET status = 'LOST', settled_at = NOW() WHERE round_id = $1 AND status = 'ACCEPTED'`,
      [roundId]
    );
  } catch (err) {
    logger.error('Failed to settle crashed Crush round in DB', { roundId, error: err.message });
  }
}

module.exports = {
  createRoundInDb,
  updateRoundInDb,
  placeBetInDb,
  cashoutBetInDb,
  settleCrashedRoundInDb,
};
