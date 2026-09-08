const test = require('node:test');
const assert = require('node:assert/strict');
const financialService = require('../src/services/financial.service');
const { query, getClient } = require('../src/database/db');

test('Concurrency Safety Test — Multiple concurrent debits on same wallet', async (t) => {
  let client;
  try {
    client = await getClient();
    const testUserId = `test_concurrency_${Date.now()}`;
    
    // Create user & wallet with ₹100 (10,000 paise)
    await client.query('BEGIN');
    await client.query(`INSERT INTO users (id, phone, username) VALUES ($1, $2, $3)`, [testUserId, `999${Date.now()}`.slice(0, 10), 'Tester']);
    await client.query(`INSERT INTO wallets (id, user_id, available_balance, reserved_balance) VALUES ($1, $2, 10000, 0)`, [`wlt_${testUserId}`, testUserId]);
    await client.query('COMMIT');

    // Perform 20 concurrent ₹10 (1000 paise) debit requests (Total = ₹200 requested, but balance is only ₹100)
    const debitPromises = Array.from({ length: 20 }, async (_, i) => {
      let reqClient;
      try {
        reqClient = await getClient();
        return await financialService.debitWallet(reqClient, 1000, {
          userId: testUserId,
          type: 'BET_DEBIT',
          referenceType: 'GAME_BET',
          referenceId: `round_${i}`,
          idempotencyKey: `idemp_${testUserId}_${i}`,
        });
      } catch (err) {
        return { error: err.message };
      } finally {
        if (reqClient) reqClient.release();
      }
    });

    const results = await Promise.all(debitPromises);
    const successes = results.filter((r) => !r.error);
    const failures = results.filter((r) => r.error);

    // Exactly 10 debits of ₹10 should succeed (₹100 total)
    assert.equal(successes.length, 10, 'Exactly 10 debits should succeed before funds run out');
    assert.equal(failures.length, 10, '10 debits should fail due to INSUFFICIENT_FUNDS');

    // Verify final wallet balance is 0 and never negative
    const finalWallet = await query('SELECT available_balance FROM wallets WHERE user_id = $1', [testUserId]);
    assert.equal(parseInt(finalWallet.rows[0].available_balance, 10), 0, 'Final wallet balance must be exactly 0 paise');

  } catch (err) {
    if (err.message.includes('ECONNREFUSED') || err.message.includes('database')) {
      t.skip('Database unavailable, skipping live PostgreSQL concurrency test');
    } else {
      throw err;
    }
  } finally {
    if (client) client.release();
  }
});
