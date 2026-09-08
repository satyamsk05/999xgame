/**
 * Rate limiting (sec 50).
 *
 * express-rate-limit protects the sensitive endpoints:
 *   /api/auth/*, /api/admin/auth/*       -> strict  (login / OTP verification)
 *   /api/deposits/*, /api/withdrawals/*  -> moderate (money movement)
 *   /api/games/* /bets, /cashout         -> bounded but high-frequency (gameplay)
 *
 * Every limiter is SKIPPED when NODE_ENV === 'test' so the automated suite (which
 * fires many rapid requests from a single process/IP) is never throttled. Limits are
 * per-IP by default. When a limit is hit we emit the unified error contract
 * (HTTP 429 + { status:'error', code:'RATE_LIMITED', message }); the responseContract
 * middleware then stamps success:false / error:{ code, message }.
 */
const rateLimit = require('express-rate-limit');

const MINUTE = 60 * 1000;

const isTestEnv = () => process.env.NODE_ENV === 'test';

function makeLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    // Emit the standard RateLimit-* headers; skip the deprecated X-RateLimit-*.
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Never throttle the automated test suite.
    skip: () => isTestEnv(),
    // Silence startup trust-proxy / X-Forwarded-For validation warnings in dev/test.
    validate: false,
    handler: (req, res) => {
      res.status(429).json({
        status: 'error',
        code: 'RATE_LIMITED',
        message,
      });
    },
  });
}

// Strict: login / OTP / verification endpoints (brute-force resistance).
const authLimiter = makeLimiter({
  windowMs: 15 * MINUTE,
  limit: 20,
  message: 'Too many requests. Please try again later.',
});

const adminAuthLimiter = makeLimiter({
  windowMs: 15 * MINUTE,
  limit: 20,
  message: 'Too many admin login attempts. Please try again later.',
});

// Moderate: money-movement endpoints.
const depositLimiter = makeLimiter({
  windowMs: 15 * MINUTE,
  limit: 50,
  message: 'Too many deposit requests. Please try again later.',
});

const withdrawalLimiter = makeLimiter({
  windowMs: 15 * MINUTE,
  limit: 50,
  message: 'Too many withdrawal requests. Please try again later.',
});

// Gameplay: bounded but high-frequency.
const betLimiter = makeLimiter({
  windowMs: MINUTE,
  limit: 120,
  message: 'Too many bets placed. Please slow down.',
});

const cashoutLimiter = makeLimiter({
  windowMs: MINUTE,
  limit: 120,
  message: 'Too many cashout requests. Please slow down.',
});

module.exports = {
  makeLimiter,
  authLimiter,
  adminAuthLimiter,
  depositLimiter,
  withdrawalLimiter,
  betLimiter,
  cashoutLimiter,
};
