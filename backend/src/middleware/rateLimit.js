/** Distributed Redis-backed rate limiting for multi-instance AWS deployments. */
const rateLimit = require('express-rate-limit');
const { getClient, isRedisReady } = require('../database/redis');

const MINUTE = 60 * 1000;
const isTestEnv = () => process.env.NODE_ENV === 'test';

class RedisRateLimitStore {
  constructor(prefix = 'rl') { this.prefix = prefix; this.windowMs = 60000; }
  init(options) { this.windowMs = options.windowMs; }
  async increment(key) {
    const client = getClient();
    if (!isRedisReady() || !client) throw new Error('RATE_LIMIT_STORE_UNAVAILABLE');
    const redisKey = `${this.prefix}:${key}`;
    const totalHits = await client.incr(redisKey);
    if (totalHits === 1) await client.pExpire(redisKey, this.windowMs);
    const ttl = await client.pTTL(redisKey);
    return { totalHits, resetTime: new Date(Date.now() + Math.max(ttl, 0)) };
  }
  async decrement(key) {
    const client = getClient();
    if (!isRedisReady() || !client) return;
    const redisKey = `${this.prefix}:${key}`;
    const value = await client.decr(redisKey);
    if (value <= 0) await client.del(redisKey);
  }
  async resetKey(key) {
    const client = getClient();
    if (!isRedisReady() || !client) return;
    await client.del(`${this.prefix}:${key}`);
  }
}

function makeLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTestEnv(),
    validate: false,
    store: new RedisRateLimitStore(`999xgame:ratelimit:${windowMs}`),
    handler: (req, res) => res.status(429).json({ status: 'error', code: 'RATE_LIMITED', message }),
  });
}

const authLimiter = makeLimiter({ windowMs: 15 * MINUTE, limit: 20, message: 'Too many requests. Please try again later.' });
const adminAuthLimiter = makeLimiter({ windowMs: 15 * MINUTE, limit: 20, message: 'Too many admin login attempts. Please try again later.' });
const depositLimiter = makeLimiter({ windowMs: 15 * MINUTE, limit: 50, message: 'Too many deposit requests. Please try again later.' });
const withdrawalLimiter = makeLimiter({ windowMs: 15 * MINUTE, limit: 50, message: 'Too many withdrawal requests. Please try again later.' });
const betLimiter = makeLimiter({ windowMs: MINUTE, limit: 120, message: 'Too many bets placed. Please slow down.' });
const cashoutLimiter = makeLimiter({ windowMs: MINUTE, limit: 120, message: 'Too many cashout requests. Please slow down.' });

module.exports = { RedisRateLimitStore, makeLimiter, authLimiter, adminAuthLimiter, depositLimiter, withdrawalLimiter, betLimiter, cashoutLimiter };
