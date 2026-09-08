/**
 * Centralized, authoritative game business rules (sec 21.7, 23, 27).
 *
 * Payout multipliers, stake limits and tie behaviour are defined ONCE here so they
 * are never duplicated/drifted across engines, repositories and controllers.
 * Stake limits are DB-controlled (games.min_stake / games.max_stake); these
 * constants are the safe fallback when a games row is missing.
 */

// 7 Up Down — sum of two dice.
const SEVEN_UP_DOWN_PAYOUTS = {
  DOWN: 2.0, // sum 2..6
  SEVEN: 5.0, // sum 7
  UP: 2.0, // sum 8..12
};

// Dragon Tiger — DRAGON/TIGER pay 1:1 (stake returned + stake profit = 2.0x),
// TIE pays 8.0x.
const DRAGON_TIGER_PAYOUTS = {
  DRAGON: 2.0,
  TIGER: 2.0,
  TIE: 8.0,
};

// Dragon Tiger tie behaviour (explicitly defined, sec 23): when the result is a TIE,
// DRAGON and TIGER main bets PUSH 50% of the stake back (status REFUNDED); a TIE bet wins.
const DRAGON_TIGER_TIE_PUSH_RATIO = 0.5;

// Crush — the crash point is derived per round from the server seed; the multiplier
// curve is time-based (see crush.engine). Cashout pays stake * serverMultiplier.
const CRUSH_CURVE_RATE = 0.06; // mult = e^(rate * elapsedSeconds)
const CRUSH_MAX_MULTIPLIER = 100.0;
const CRUSH_MIN_AUTO_CASHOUT = 1.01;

// Fallback stake limits in paise (₹10 .. ₹5000). DB games row overrides these.
const DEFAULT_STAKE_LIMITS_PAISE = { min: 1000, max: 500000 };

module.exports = {
  SEVEN_UP_DOWN_PAYOUTS,
  DRAGON_TIGER_PAYOUTS,
  DRAGON_TIGER_TIE_PUSH_RATIO,
  CRUSH_CURVE_RATE,
  CRUSH_MAX_MULTIPLIER,
  CRUSH_MIN_AUTO_CASHOUT,
  DEFAULT_STAKE_LIMITS_PAISE,
};
