const test = require('node:test');
const assert = require('node:assert');
const { SevenUpDownEngine, BetTypes } = require('../src/games/seven-up-down/engine');
const userRepo = require('../src/users/user.repository');
const walletRepo = require('../src/wallet/wallet.repository');

test('7 Up Down Game Engine Unit Test', async (t) => {
  const engine = new SevenUpDownEngine();

  // Seed test user & wallet in DB
  let testUserId = 'usr_player1';
  try {
    const { user } = await userRepo.findOrCreateUserByPhone('+919999999999');
    testUserId = user.id;
  } catch (_) {}

  // Ensure wallet has balance for test
  try {
    await walletRepo.addCash(testUserId, 100, 'TEST_CARD');
  } catch (err) {
    console.error('engine.test.js addCash failed:', err.message);
  }

  // 1. Create Round
  const round = await engine.createRound();
  assert.strictEqual(round.status, 'CREATED');
  assert.strictEqual(round.gameId, 'seven_up_down');

  // 2. Open Betting
  await engine.openBetting();
  assert.strictEqual(round.status, 'BETTING_OPEN');

  // 3. Place Bets
  const { bet: bet1, isDuplicate: dup1 } = await engine.placeBet({
    userId: testUserId,
    betType: BetTypes.UP,
    stakePaise: 2000,
    idempotencyKey: `idemp_key_${Date.now()}`,
  });
  assert.strictEqual(dup1, false);
  assert.strictEqual(bet1.bet_type || bet1.betType, 'UP');

  // 4. Roll Dice
  const resultRound = await engine.closeBettingAndRoll();
  assert.strictEqual(resultRound.status, 'RESULT');
  assert.ok(resultRound.dice1 >= 1 && resultRound.dice1 <= 6);
  assert.ok(resultRound.dice2 >= 1 && resultRound.dice2 <= 6);
  assert.ok(resultRound.diceSum >= 2 && resultRound.diceSum <= 12);
  assert.ok(['DOWN', 'SEVEN', 'UP'].includes(resultRound.winningBetType));

  // 5. Settle Round
  const { round: settledRound, settlements } = await engine.settleRound();
  assert.strictEqual(settledRound.status, 'SETTLED');
});
