const test = require('node:test');
const assert = require('node:assert/strict');
const financialService = require('../src/services/financial.service');
const { query, getClient } = require('../src/database/db');
const crypto = require('crypto');

/**
 * Concurrency safety: 20 simultaneous ₹10 debits against a ₹100 wallet.
 *
 * Each concurrent operation runs in its OWN transaction on its OWN pooled client — exactly
 * like 20 simultaneous real requests. `SELECT ... FOR UPDATE` inside debitWallet must
 * serialize them so that EXACTLY 10 succeed, 10 fail with INSUFFICIENT_FUNDS, and the final
 * balance is 0 (never negative, never over-debited).
 *
 * The wallet setup mirrors the production bucket invariant: available_balance must equal the
 * sum of spendable deposit/winnings/rewards buckets before a debit can proceed.
 */
test('Concurrency Safety Test — Multiple concurrent debits on same wallet', async (t) => {
  let testUserId = null;

  try {
    const uniq = crypto.randomBytes(6).toString('hex');
    testUserId = `test_conc_${uniq}`;
    const testPhone = `9${crypto.randomInt(0, 1e11).toString().padStart(11, '0')}`;

    const setupClient = await getClient();
    try {
      await setupClient.query('BEGIN');
      await setupClient.query(
        `INSERT INTO users (id, phone, username) VALUES ($1, $2, $3)`,
        [testUserId, testPhone, 'Tester']
      );
      await setupClient.query(
        `INSERT INTO wallets (id, user_id, available_balance, reserved_balance, deposit_balance, winnings_balance, rewards_balance) VALUES ($1, $2, 10000, 0, 10000, 0, 0)`,
        [`wlt_${testUserId}`, testUserId]
      );
      await setupClient.query('COMMIT');
    } catch (setupErr) {
      try { await setupClient.query('ROLLBACK'); } catch (_) {}
      throw setupErr;
    } finally {
      setupClient.release();
    }

    const debitPromises = Array.from({ length: 20 }, async (_, i) => {
      let reqClient;
      try {
        reqClient = await getClient();
        await reqClient.query('BEGIN');
        const result = await financialService.debitWallet(reqClient, 1000, {
          userId: testUserId,
          type: 'BET_DEBIT',
          referenceType: 'GAME_BET',
          referenceId: `round_${i}`,
          idempotencyKey: `idemp_${testUserId}_${i}`,
        });
        await reqClient.query('COMMIT');
        return result;
      } catch (err) {
        if (reqClient) {
          try { await reqClient.query('ROLLBACK'); } catch (_) {}
        }
        return { error: err.message };
      } finally {
        if (reqClient) reqClient.release();
      }
    });

    const results = await Promise.all(debitPromises);
    const successes = results.filter((r) => !r.error);
    const failures = results.filter((r) => r.error);

    assert.equal(successes.length, 10, 'Exactly 10 debits should succeed before funds run out');
    assert.equal(failures.length, 10, '10 debits should fail due to INSUFFICIENT_FUNDS');

    const finalWallet = await query('SELECT available_balance, deposit_balance, winnings_balance, rewards_balance FROM wallets WHERE user_id = $1', [testUserId]);
    assert.equal(parseInt(finalWallet.rows[0].available_balance, 10), 0, 'Final wallet balance must be exactly 0 paise');
    assert.equal(parseInt(finalWallet.rows[0].deposit_balance, 10), 0, 'Final deposit bucket must be exactly 0 paise');
    assert.equal(parseInt(finalWallet.rows[0].winnings_balance, 10), 0, 'Final winnings bucket must be exactly 0 paise');
    assert.equal(parseInt(finalWallet.rows[0].rewards_balance, 10), 0, 'Final rewards bucket must be exactly 0 paise');
  } catch (err) {
    if (err && (err.code === 'DATABASE_UNAVAILABLE' || err.statusCode === 503 || /ECONNREFUSED|database/i.test(err.message || ''))) {
      t.skip('Database unavailable, skipping live PostgreSQL concurrency test');
    } else {
      throw err;
    }
  } finally {
    if (testUserId) {
      try {
        await query('DELETE FROM wallet_ledger WHERE user_id = $1', [testUserId]);
        await query('DELETE FROM wallets WHERE user_id = $1', [testUserId]);
        await query('DELETE FROM users WHERE id = $1', [testUserId]);
      } catch (_) {}
    }
  }
});
