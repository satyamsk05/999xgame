const { createClient } = require('redis');
const config = require('../config/env');
const logger = require('../utils/logger');

let redisClient = null;
let isConnected = false;

function initRedis() {
  if (redisClient) return redisClient;
  const url = config.redis.url || `redis://${config.redis.password ? `:${encodeURIComponent(config.redis.password)}@` : ''}${config.redis.host}:${config.redis.port}`;
  redisClient = createClient({ url });

  redisClient.on('connect', () => { isConnected = true; logger.info('Connected to Redis server'); });
  redisClient.on('ready', () => { isConnected = true; logger.info('Redis client ready'); });
  redisClient.on('end', () => { isConnected = false; logger.warn('Redis connection ended'); });
  redisClient.on('error', (err) => { isConnected = false; logger.warn('Redis client error - operating in degraded mode', { error: err.message }); });

  redisClient.connect().catch((err) => {
    isConnected = false;
    logger.warn('Redis initial connection failed - operating in degraded mode', { error: err.message });
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
