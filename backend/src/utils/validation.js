/**
 * Input validation layer (sec 51).
 *
 * Pure, dependency-free validators for the money-critical request fields. Every
 * validator either RETURNS a normalized value or THROWS an Error carrying
 * `statusCode` (400 for malformed input) and a human-safe message.
 *
 * Client numbers are NEVER trusted: rupee inputs are converted to integer paise and
 * re-checked; floats, negatives, NaN and Infinity are rejected. Internal money is
 * always a positive integer number of paise.
 */

// Game identity whitelist (sec 51: validate gameId).
const GAME_IDS = ['seven_up_down', '7updown', 'dragon_tiger', 'crush', 'mines'];

// Allowed bet types per game (mirror game.config.js payouts). Crush has no betType.
const BET_TYPES_BY_GAME = {
  seven_up_down: ['UP', 'DOWN', 'SEVEN'],
  '7updown': ['UP', 'DOWN', 'SEVEN'],
  dragon_tiger: ['DRAGON', 'TIGER', 'TIE'],
  crush: [],
  mines: [],
};

const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const UTR_REGEX = /^\d{12}$/;
const IDEMPOTENCY_REGEX = /^[A-Za-z0-9._:\-]{1,100}$/;

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

/**
 * Validate an authoritative integer-paise amount (number or numeric string).
 * Rejects floats, negatives, zero, NaN and Infinity.
 */
function toPaise(value, field = 'amount') {
  if (value === null || value === undefined || value === '') {
    throw badRequest(`${field} is required`);
  }
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw badRequest(`${field} must be an integer number of paise`);
  }
  if (n <= 0) {
    throw badRequest(`${field} must be a positive integer in paise`);
  }
  return n;
}

/** Convert a rupee amount (number or numeric string) to integer paise, validated. */
function rupeesToPaise(value, field = 'amount') {
  if (value === null || value === undefined || value === '') {
    throw badRequest(`${field} is required`);
  }
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw badRequest(`${field} must be a positive number`);
  }
  const paise = Math.round(n * 100);
  if (!Number.isInteger(paise) || paise <= 0) {
    throw badRequest(`${field} must be a positive amount`);
  }
  return paise;
}

/**
 * Resolve a stake to integer paise. `stakePaise` (integer) is authoritative; if
 * absent, `stake` (rupees) is converted. At least one must be present and positive.
 */
function resolveStakePaise({ stakePaise, stake } = {}, field = 'stake') {
  if (stakePaise !== undefined && stakePaise !== null && stakePaise !== '') {
    return toPaise(stakePaise, field);
  }
  if (stake !== undefined && stake !== null && stake !== '') {
    return rupeesToPaise(stake, field);
  }
  throw badRequest(`${field} is required`);
}

/** Coarse guard against absurd stakes. Authoritative min/max stay DB-driven (games row). */
function assertWithinStakeLimits(paise, { min, max } = {}) {
  if (typeof min === 'number' && paise < min) {
    throw badRequest(`stake is below the minimum allowed (₹${(min / 100).toFixed(2)})`);
  }
  if (typeof max === 'number' && paise > max) {
    throw badRequest(`stake exceeds the maximum allowed (₹${(max / 100).toFixed(2)})`);
  }
  return paise;
}

function validateGameId(value) {
  if (typeof value !== 'string' || !GAME_IDS.includes(value)) {
    throw badRequest(`Unknown or unsupported gameId: ${value}`);
  }
  return value;
}

function validateBetType(value, gameId) {
  if (typeof value !== 'string' || !value) {
    throw badRequest('betType is required');
  }
  const allowed = BET_TYPES_BY_GAME[gameId];
  if (allowed && allowed.length && !allowed.includes(value)) {
    throw badRequest(`Invalid betType '${value}' for game '${gameId}'`);
  }
  return value;
}

function validateRoundId(value) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 64) {
    throw badRequest('roundId is invalid');
  }
  return value.trim();
}

/** Optional-by-default format check for idempotency keys. */
function validateIdempotencyKey(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest('idempotencyKey is required');
    return null;
  }
  if (typeof value !== 'string' || !IDEMPOTENCY_REGEX.test(value)) {
    throw badRequest('idempotencyKey must be 1-100 chars of [A-Za-z0-9._:-]');
  }
  return value;
}

function validateUtr(value) {
  if (typeof value !== 'string' || !UTR_REGEX.test(value.trim())) {
    throw badRequest('Invalid UTR format. UTR must be exactly 12 numeric digits.');
  }
  return value.trim();
}

function validateUpiId(value) {
  if (typeof value !== 'string' || !UPI_REGEX.test(value.trim())) {
    throw badRequest('Invalid UPI ID format (e.g. username@bank)');
  }
  return value.trim();
}

/** Crush cashout request: only betId is trusted (server computes the multiplier). */
function validateCashoutRequest(body = {}) {
  const betId = body && body.betId;
  if (typeof betId !== 'string' || betId.trim().length === 0 || betId.length > 64) {
    throw badRequest('betId is required');
  }
  return { betId: betId.trim() };
}

module.exports = {
  GAME_IDS,
  BET_TYPES_BY_GAME,
  toPaise,
  rupeesToPaise,
  resolveStakePaise,
  assertWithinStakeLimits,
  validateGameId,
  validateBetType,
  validateRoundId,
  validateIdempotencyKey,
  validateUtr,
  validateUpiId,
  validateCashoutRequest,
};
