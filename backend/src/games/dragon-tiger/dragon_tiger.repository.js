const { query, getClient } = require('../../database/db');
const logger = require('../../utils/logger');
const financialService = require('../../services/financial.service');

async function createRoundInDb(roundId, roundNumber, serverSeed, serverSeedHash) {
  try {
    const res = await query(
      `INSERT INTO game_rounds (id, game_id, round_number, status, server_seed, started_at, created_at)
       VALUES ($1, 'dragon_tiger', $2, 'CREATED', $3, NOW(), NOW())
       RETURNING *`,
      [roundId, roundNumber, serverSeed]
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
           ended_at = CASE WHEN $2 = 'SETTLED' THEN NOW() ELSE ended_at END
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

async function placeBetInDb({ userId, roundId, betType, stakePaise, idempotencyKey }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const roundRes = await client.query('SELECT * FROM game_rounds WHERE id = $1 FOR UPDATE', [roundId]);
    if (!roundRes.rows.length || roundRes.rows[0].status !== 'BETTING_OPEN') {
      throw new Error('Betting is closed for this round');
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
      metadata: { gameId: 'dragon_tiger', roundId, betType, stakePaise },
    });

    const betId = `dt_bet_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const payoutMultiplier = betType === 'TIE' ? 8.0 : 2.0;

    const betInsertRes = await client.query(
      `INSERT INTO bets (id, round_id, user_id, bet_type, stake, payout_multiplier, status, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACCEPTED', $7, NOW())
       RETURNING *`,
      [betId, roundId, userId, betType, stakePaise, payoutMultiplier, idempotencyKey || null]
    );

    await client.query('COMMIT');

    return {
      bet: betInsertRes.rows[0],
      wallet: debitResult.wallet,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to place Dragon Tiger bet in DB', { userId, roundId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

async function settleRoundInDb(roundId, winningBetType) {
  const client = await getClient();
  const settlements = [];

  try {
    await client.query('BEGIN');

    const betsRes = await client.query('SELECT * FROM bets WHERE round_id = $1 AND status = \'ACCEPTED\' FOR UPDATE', [roundId]);
    const bets = betsRes.rows;

    for (const bet of bets) {
      const isWin = bet.bet_type === winningBetType;
      const isTiePush = winningBetType === 'TIE' && (bet.bet_type === 'DRAGON' || bet.bet_type === 'TIGER');
      
      let winAmountPaise = 0;
      let newStatus = 'LOST';

      if (isWin) {
        winAmountPaise = Math.floor(parseInt(bet.stake, 10) * parseFloat(bet.payout_multiplier));
        newStatus = 'WON';
      } else if (isTiePush) {
        // Tie push returns 50% of stake back on main bets
        winAmountPaise = Math.floor(parseInt(bet.stake, 10) * 0.5);
        newStatus = 'REFUNDED';
      }

      if (winAmountPaise > 0) {
        await financialService.creditWallet(client, winAmountPaise, {
          userId: bet.user_id,
          type: 'WIN_CREDIT',
          referenceType: 'GAME_WIN',
          referenceId: bet.id,
          idempotencyKey: `dt_win_${bet.id}`,
          metadata: { gameId: 'dragon_tiger', roundId, betId: bet.id, winAmountPaise },
        });
      }

      await client.query(
        `UPDATE bets SET status = $2, win_amount = $3, settled_at = NOW() WHERE id = $1`,
        [bet.id, newStatus, winAmountPaise]
      );

      const stlId = `dt_stl_${bet.id}`;
      await client.query(
        `INSERT INTO settlements (id, bet_id, round_id, user_id, win_amount, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'SETTLED', NOW())
         ON CONFLICT (bet_id) DO NOTHING`,
        [stlId, bet.id, roundId, bet.user_id, winAmountPaise]
      );

      settlements.push({
        betId: bet.id,
        userId: bet.user_id,
        winAmountRupees: winAmountPaise / 100,
        status: newStatus,
      });
    }

    await client.query('COMMIT');
    return settlements;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to settle Dragon Tiger round in DB', { roundId, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createRoundInDb,
  updateRoundInDb,
  placeBetInDb,
  settleRoundInDb,
};
