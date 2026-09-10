/** Distributed Redis-backed rate limiting for multi-instance AWS deployments. */
const rateLimit = require('express-rate-limit');
const { getClient, isRedisReady } = require('../database/redis');

const MINUTE = 60 * 1000;
const isTestEnv = () => process.env.NODE_ENV === 'test';

class RedisRateLimitStore {
  constructor(prefix = 'rl') {
    this.prefix = prefix;
    this.windowMs = 60000;
    this.memoryHits = new Map();
  }
  init(options) { this.windowMs = options.windowMs || 60000; }
  async increment(key) {
    const client = getClient();
    if (isRedisReady() && client) {
      try {
        const redisKey = `${this.prefix}:${key}`;
        const totalHits = await client.incr(redisKey);
        if (totalHits === 1) await client.pExpire(redisKey, this.windowMs);
        const ttl = await client.pTTL(redisKey);
        return { totalHits, resetTime: new Date(Date.now() + Math.max(ttl, 0)) };
      } catch (_) {}
    }
    const now = Date.now();
    const entry = this.memoryHits.get(key);
    if (!entry || now > entry.resetTime) {
      const resetTime = now + this.windowMs;
      this.memoryHits.set(key, { totalHits: 1, resetTime });
      return { totalHits: 1, resetTime: new Date(resetTime) };
    }
    entry.totalHits += 1;
    return { totalHits: entry.totalHits, resetTime: new Date(entry.resetTime) };
  }
  async decrement(key) {
    const client = getClient();
    if (isRedisReady() && client) {
      try {
        const redisKey = `${this.prefix}:${key}`;
        const value = await client.decr(redisKey);
        if (value <= 0) await client.del(redisKey);
        return;
      } catch (_) {}
    }
    const entry = this.memoryHits.get(key);
    if (entry && entry.totalHits > 0) entry.totalHits -= 1;
  }
  async resetKey(key) {
    const client = getClient();
    if (isRedisReady() && client) {
      try {
        await client.del(`${this.prefix}:${key}`);
        return;
      } catch (_) {}
    }
    this.memoryHits.delete(key);
  }
}

function makeLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit: process.env.NODE_ENV === 'development' ? Math.max(limit * 10, 500) : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTestEnv(),
    validate: false,
    store: new RedisRateLimitStore(`999xgame:ratelimit:${windowMs}`),
    handler: (req, res) => res.status(429).json({ status: 'error', code: 'RATE_LIMITED', message }),
  });
}

const authLimiter = makeLimiter({ windowMs: 15 * MINUTE, limit: 60, message: 'Too many requests. Please try again later.' });
const adminAuthLimiter = makeLimiter({ windowMs: 15 * MINUTE, limit: 60, message: 'Too many admin login attempts. Please try again later.' });
const depositLimiter = makeLimiter({ windowMs: 15 * MINUTE, limit: 100, message: 'Too many deposit requests. Please try again later.' });
const withdrawalLimiter = makeLimiter({ windowMs: 15 * MINUTE, limit: 100, message: 'Too many withdrawal requests. Please try again later.' });
const betLimiter = makeLimiter({ windowMs: MINUTE, limit: 120, message: 'Too many bets placed. Please slow down.' });
const cashoutLimiter = makeLimiter({ windowMs: MINUTE, limit: 120, message: 'Too many cashout requests. Please slow down.' });

module.exports = { RedisRateLimitStore, makeLimiter, authLimiter, adminAuthLimiter, depositLimiter, withdrawalLimiter, betLimiter, cashoutLimiter };
