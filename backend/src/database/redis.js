const { createClient } = require('redis');
const config = require('../config/env');
const logger = require('../utils/logger');

let redisClient = null;
let isConnected = false;

function initRedis() {
  if (redisClient) return redisClient;
  if (process.env.DISABLE_REDIS === 'true') {
    return null;
  }
  const url = config.redis.url || `redis://${config.redis.password ? `:${encodeURIComponent(config.redis.password)}@` : ''}${config.redis.host}:${config.redis.port}`;
  redisClient = createClient({
    url,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (retries) => (retries > 3 ? false : Math.min(retries * 200, 1000)),
    },
  });

  redisClient.on('connect', () => { isConnected = true; logger.info('Connected to Redis server'); });
  redisClient.on('ready', () => { isConnected = true; logger.info('Redis client ready'); });
  redisClient.on('end', () => { isConnected = false; });
  redisClient.on('error', (err) => {
    if (isConnected) logger.warn('Redis client error - operating in degraded mode', { error: err.message });
    isConnected = false;
  });

  redisClient.connect().catch((err) => {
    isConnected = false;
  });
  return redisClient;
}

function getClient() { return redisClient; }

async function get(key) {
  if (!isConnected || !redisClient) return null;
  try { return await redisClient.get(key); }
  catch (err) { logger.error('Redis GET failed', { key, error: err.message }); return null; }
}

async function set(key, value, ttlSeconds = null) {
  if (!isConnected || !redisClient) return false;
  try {
    if (ttlSeconds) await redisClient.set(key, value, { EX: ttlSeconds });
    else await redisClient.set(key, value);
    return true;
  } catch (err) {
    logger.error('Redis SET failed', { key, error: err.message });
    return false;
  }
}

async function del(key) {
  if (!isConnected || !redisClient) return false;
  try { await redisClient.del(key); return true; }
  catch (err) { logger.error('Redis DEL failed', { key, error: err.message }); return false; }
}

function isRedisReady() { return isConnected; }

module.exports = { initRedis, getClient, get, set, del, isRedisReady };
