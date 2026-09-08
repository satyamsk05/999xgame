if (typeof global.EventSource === 'undefined') {
  const esModule = require('eventsource');
  global.EventSource = esModule.EventSource || esModule.default || esModule;
}

const { loggin } = require('@loggin/sdk');
const config = require('../config/env');
const logger = require('../utils/logger');
const redisService = require('../services/redis.service');

// Tracking active listeners to avoid duplicate SDK subscriptions for the same token
const activeListeners = new Set();

/**
 * Generate Loggin WhatsApp token & link, store session state in Redis/Cache
 */
async function createToken() {
  try {
    const { token, link } = loggin.createToken(config.logginAppKey);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const sessionData = {
      token,
      status: 'PENDING',
      createdAt: Date.now(),
      expiresAt,
      link,
      verifiedPhone: null,
    };

    // Save to Redis / Cache with 5-minute TTL
    await redisService.set(`loggin:session:${token}`, sessionData, 300);

    logger.info('Created Loggin WhatsApp token session', { maskedToken: token.slice(0, 4) + '***', expiresAt });

    // Launch single background verification listener
    startBackgroundListener(token);

    return { token, link, expiresAt };
  } catch (err) {
    logger.error('Failed to create Loggin token', { error: err.message });
    throw new Error(`Loggin token creation error: ${err.message}`);
  }
}

/**
 * Background SDK Listener that updates session state in Redis once verified
 */
function startBackgroundListener(token) {
  if (activeListeners.has(token)) return;
  activeListeners.add(token);

  const maskedToken = token.slice(0, 4) + '***';
  logger.info('Subscribing background listener for Loggin verification...', { maskedToken });

  loggin
    .waitForVerify(token, 300000)
    .then(async (result) => {
      activeListeners.delete(token);
      if (result && result.phone) {
        logger.info('Loggin verification completed in background', { maskedPhone: result.phone.slice(-4) });
        const existing = await redisService.getJson(`loggin:session:${token}`);
        if (existing) {
          existing.status = 'VERIFIED';
          existing.verifiedPhone = result.phone;
          await redisService.set(`loggin:session:${token}`, existing, 300);
        }
      }
    })
    .catch(async (err) => {
      activeListeners.delete(token);
      logger.warn('Background Loggin listener failed/expired', { maskedToken, error: err.message });
      const existing = await redisService.getJson(`loggin:session:${token}`);
      if (existing && existing.status === 'PENDING') {
        existing.status = 'EXPIRED';
        await redisService.set(`loggin:session:${token}`, existing, 60);
      }
    });
}

/**
 * Get status of verification session (Short Polling)
 */
async function getStatus(token) {
  if (!token) return { status: 'EXPIRED' };
  const session = await redisService.getJson(`loggin:session:${token}`);
  if (!session) return { status: 'EXPIRED' };

  if (session.status === 'PENDING' && Date.now() > new Date(session.expiresAt).getTime()) {
    session.status = 'EXPIRED';
    await redisService.set(`loggin:session:${token}`, session, 60);
  }

  return session;
}

/**
 * Consume verified session atomically (ensures single consumption)
 */
async function consumeVerifiedSession(token) {
  const session = await getStatus(token);
  if (!session || session.status !== 'VERIFIED' || !session.verifiedPhone) {
    return null;
  }

  // Delete session to guarantee it can only be consumed once
  await redisService.del(`loggin:session:${token}`);
  return session;
}

/**
 * Backward compatible non-blocking verifyToken
 */
async function verifyToken(token) {
  const session = await getStatus(token);
  if (session && session.status === 'VERIFIED') {
    await redisService.del(`loggin:session:${token}`);
    return { verifiedPhone: session.verifiedPhone };
  }

  if (session && session.status === 'EXPIRED') {
    const err = new Error('Loggin verification link expired');
    err.code = 'TOKEN_EXPIRED';
    throw err;
  }

  // If still pending, throw pending status error rather than hanging 300s
  const err = new Error('Verification pending. Please complete WhatsApp verification.');
  err.code = 'PENDING';
  throw err;
}

module.exports = {
  createToken,
  getStatus,
  consumeVerifiedSession,
  verifyToken,
};
