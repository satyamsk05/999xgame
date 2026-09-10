const test = require('node:test');
const assert = require('node:assert');
const { SevenUpDownEngine, BetTypes } = require('../src/games/seven-up-down/engine');
const userRepo = require('../src/users/user.repository');
const { getClient } = require('../src/database/db');
const financialService = require('../src/services/financial.service');

test('7 Up Down Game Engine Unit Test', async () => {
  const engine = new SevenUpDownEngine();

  let testUserId = 'usr_player1';
  try {
    const { user } = await userRepo.findOrCreateUserByPhone('+919999999999');
    testUserId = user.id;
  } catch (_) {}

  try {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await financialService.creditWallet(client, 10000, {
        userId: testUserId,
        type: 'DEPOSIT',
        referenceType: 'TEST',
        referenceId: `test_${Date.now()}`,
        idempotencyKey: `test_dep_${testUserId}_${Date.now()}`,
      });
      await client.query('COMMIT');
    } catch (_) {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('engine.test.js creditWallet failed:', err.message);
  }

  const round = await engine.createRound();
  assert.strictEqual(round.status, 'CREATED');
  assert.strictEqual(round.gameId, 'seven_up_down');
  const publicCreated = JSON.parse(JSON.stringify(round));
  assert.strictEqual(publicCreated.serverSeed, undefined, 'server seed must not be exposed before result');
  assert.ok(publicCreated.serverSeedHash);

  await engine.openBetting();
  assert.strictEqual(round.status, 'BETTING_OPEN');

  const { bet: bet1, isDuplicate: dup1 } = await engine.placeBet({
    userId: testUserId,
    betType: BetTypes.UP,
    stakePaise: 2000,
    idempotencyKey: `idemp_key_${Date.now()}`,
  });
  assert.strictEqual(dup1, false);
  assert.strictEqual(bet1.bet_type || bet1.betType, 'UP');

  const resultRound = await engine.closeBettingAndRoll();
  assert.strictEqual(resultRound.status, 'RESULT');
  assert.ok(resultRound.dice1 >= 1 && resultRound.dice1 <= 6);
  assert.ok(resultRound.dice2 >= 1 && resultRound.dice2 <= 6);
  assert.ok(resultRound.diceSum >= 2 && resultRound.diceSum <= 12);
  assert.ok(['DOWN', 'SEVEN', 'UP'].includes(resultRound.winningBetType));
  const publicResult = JSON.parse(JSON.stringify(resultRound));
  assert.strictEqual(publicResult.serverSeed, undefined, 'seed is not exposed through current-round before settlement');

  const { round: settledRound } = await engine.settleRound();
  assert.strictEqual(settledRound.status, 'SETTLED');
  const publicSettled = JSON.parse(JSON.stringify(settledRound));
  assert.ok(publicSettled.serverSeed, 'settled round should reveal seed for verification');
});