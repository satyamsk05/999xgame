const { createClient } = require('redis');
const config = require('../config/env');
const logger = require('../utils/logger');

// In-Memory Fallback Cache for local development without Redis
class MemoryCache {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
  }

  set(key, value, ttlSeconds) {
    const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    this.store.set(key, valStr);
    if (this.ttls.has(key)) {
      clearTimeout(this.ttls.get(key));
    }
    if (ttlSeconds) {
      const timer = setTimeout(() => {
        this.del(key);
      }, ttlSeconds * 1000);
      this.ttls.set(key, timer);
    }
  }

  get(key) {
    return this.store.get(key) || null;
  }

  del(key) {
    if (this.ttls.has(key)) {
      clearTimeout(this.ttls.get(key));
      this.ttls.delete(key);
    }
    return this.store.delete(key);
  }
}

let redisClient = null;
let isConnected = false;
const memoryCache = new MemoryCache();

async function initRedis() {
  if (process.env.DISABLE_REDIS === 'true') {
    logger.info('Redis explicitly disabled via DISABLE_REDIS=true. Using memory cache fallback.');
    return;
  }

  try {
    const redisUrl = process.env.REDIS_URL || `redis://${config.redis.password ? `:${config.redis.password}@` : ''}${config.redis.host}:${config.redis.port}`;
    redisClient = createClient({ url: redisUrl, socket: { connectTimeout: 3000, reconnectStrategy: (retries) => (retries > 3 ? false : Math.min(retries * 100, 1000)) } });

    redisClient.on('error', (err) => {
      if (isConnected) {
        logger.warn('Redis connection error, falling back to memory cache', { error: err.message });
      }
      isConnected = false;
    });

    redisClient.on('connect', () => {
      isConnected = true;
      logger.info('Connected to Redis server successfully');
    });

    await redisClient.connect();
  } catch (err) {
    logger.warn('Failed to connect to Redis server, using in-memory fallback', { error: err.message });
    isConnected = false;
    redisClient = null;
  }
}

initRedis().catch(() => {});

async function set(key, value, ttlSeconds = 300) {
  const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (isConnected && redisClient) {
    try {
      if (ttlSeconds) {
        await redisClient.set(key, valStr, { EX: ttlSeconds });
      } else {
        await redisClient.set(key, valStr);
      }
      return;
    } catch (err) {
      logger.warn('Redis set error, falling back to memory cache', { key, error: err.message });
    }
  }
  memoryCache.set(key, valStr, ttlSeconds);
}

async function get(key) {
  if (isConnected && redisClient) {
    try {
      return await redisClient.get(key);
    } catch (err) {
      logger.warn('Redis get error, falling back to memory cache', { key, error: err.message });
    }
  }
  return memoryCache.get(key);
}

async function del(key) {
  if (isConnected && redisClient) {
    try {
      await redisClient.del(key);
      return;
    } catch (err) {
      logger.warn('Redis del error, falling back to memory cache', { key, error: err.message });
    }
  }
  memoryCache.del(key);
}

async function getJson(key) {
  const val = await get(key);
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch (_) {
    return val;
  }
}

function isAvailable() {
  return isConnected;
}

module.exports = {
  set,
  get,
  del,
  getJson,
  isAvailable,
  memoryCache,
};
