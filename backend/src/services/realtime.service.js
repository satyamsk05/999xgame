const { createClient } = require('redis');
const config = require('../config/env');
const logger = require('../utils/logger');

const CHANNEL = '999xgame:realtime:v1';
let publisher = null;
let subscriber = null;
let ready = false;
let io = null;

function redisUrl() {
  return process.env.REDIS_URL || `redis://${config.redis.password ? `:${config.redis.password}@` : ''}${config.redis.host}:${config.redis.port}`;
}

async function initRealtime(socketServer) {
  io = socketServer;
  if (process.env.DISABLE_REDIS === 'true') return false;

  try {
    publisher = createClient({ url: redisUrl(), socket: { connectTimeout: 3000, reconnectStrategy: (retries) => (retries > 3 ? false : Math.min(retries * 100, 1000)) } });
    subscriber = publisher.duplicate();
    publisher.on('error', (err) => { ready = false; logger.warn('Realtime Redis publisher error', { error: err.message }); });
    subscriber.on('error', (err) => { ready = false; logger.warn('Realtime Redis subscriber error', { error: err.message }); });
    await Promise.all([publisher.connect(), subscriber.connect()]);
    await subscriber.subscribe(CHANNEL, (message) => {
      try {
        const event = JSON.parse(message);
        if (!event?.name) return;
        io?.emit(event.name, event.payload);
      } catch (err) {
        logger.warn('Invalid realtime Redis message ignored', { error: err.message });
      }
    });
    ready = true;
    logger.info('Realtime Redis fanout enabled');
    return true;
  } catch (err) {
    ready = false;
    logger.warn('Realtime Redis fanout unavailable; using local Socket.IO only', { error: err.message });
    await closeRealtime();
    return false;
  }
}

function emit(name, payload) {
  if (!io) return;
  if (!ready || !publisher) {
    io.emit(name, payload);
    return;
  }
  publisher.publish(CHANNEL, JSON.stringify({ name, payload })).catch((err) => {
    logger.warn('Realtime Redis publish failed; emitting locally', { name, error: err.message });
    io.emit(name, payload);
  });
}

async function closeRealtime() {
  ready = false;
  const clients = [subscriber, publisher].filter(Boolean);
  subscriber = null;
  publisher = null;
  for (const client of clients) {
    try { if (client.isOpen) await client.quit(); } catch (_) { try { client.disconnect(); } catch (_) {} }
  }
}

module.exports = { initRealtime, emit, closeRealtime, CHANNEL };
