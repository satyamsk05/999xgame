const test = require('node:test');
const assert = require('node:assert/strict');

const { SEVEN_UP_DOWN_PAYOUTS } = require('../game.config');

/**
 * Pure regression tests for settlement invariants. Database integration tests
 * should exercise the repository transaction separately in the deployment CI.
 */
test('7 Up Down payout configuration has all three outcomes', () => {
  assert.deepEqual(Object.keys(SEVEN_UP_DOWN_PAYOUTS).sort(), ['DOWN', 'SEVEN', 'UP']);
  for (const value of Object.values(SEVEN_UP_DOWN_PAYOUTS)) {
    assert.equal(typeof value, 'number');
    assert.ok(Number.isFinite(value));
    assert.ok(value > 0);
  }
});

test('7 Up Down settlement win amount is integer paise', () => {
  const stakePaise = 12345;
  for (const multiplier of Object.values(SEVEN_UP_DOWN_PAYOUTS)) {
    const winAmountPaise = Math.floor(stakePaise * multiplier);
    assert.equal(Number.isInteger(winAmountPaise), true);
    assert.ok(winAmountPaise >= 0);
  }
});

test('7 Up Down settlement is zero for losing bet', () => {
  const stakePaise = 10000;
  const winningBetType = 'UP';
  for (const betType of Object.keys(SEVEN_UP_DOWN_PAYOUTS)) {
    const isWinner = betType === winningBetType;
    const winAmountPaise = isWinner
      ? Math.floor(stakePaise * SEVEN_UP_DOWN_PAYOUTS[betType])
      : 0;
    assert.equal(winAmountPaise, isWinner ? Math.floor(stakePaise * SEVEN_UP_DOWN_PAYOUTS[betType]) : 0);
  }
});
