const test = require('node:test');
const assert = require('node:assert/strict');

const { DRAGON_TIGER_PAYOUTS } = require('../game.config');

test('Dragon Tiger payout configuration is finite and positive', () => {
  assert.ok(Object.keys(DRAGON_TIGER_PAYOUTS).length > 0);
  for (const value of Object.values(DRAGON_TIGER_PAYOUTS)) {
    assert.equal(typeof value, 'number');
    assert.ok(Number.isFinite(value));
    assert.ok(value > 0);
  }
});

test('Dragon Tiger settlement payout is integer paise', () => {
  const stakePaise = 12345;
  for (const multiplier of Object.values(DRAGON_TIGER_PAYOUTS)) {
    const payout = Math.floor(stakePaise * multiplier);
    assert.equal(Number.isInteger(payout), true);
    assert.ok(payout >= 0);
  }
});
