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
const SESSION_TTL_SECONDS = 300;
const SESSION_KEY = (token) => `loggin:session:${token}`;

async function createToken() {
  try {
    const { token, link } = loggin.createToken(config.logginAppKey);
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    const sessionData = {
      token,
      status: 'PENDING',
      createdAt: Date.now(),
      expiresAt,
      link,
      verifiedPhone: null,
    };

    await redisService.set(SESSION_KEY(token), sessionData, SESSION_TTL_SECONDS);
    logger.info('Created Loggin WhatsApp token session', { maskedToken: token.slice(0, 4) + '***', expiresAt });
    startBackgroundListener(token);
    return { token, link, expiresAt };
  } catch (err) {
    logger.error('Failed to create Loggin token', { error: err.message });
    throw new Error(`Loggin token creation error: ${err.message}`);
  }
}

function startBackgroundListener(token) {
  if (activeListeners.has(token)) return;
  activeListeners.add(token);
  const maskedToken = token.slice(0, 4) + '***';
  logger.info('Subscribing background listener for Loggin verification...', { maskedToken });

  loggin.waitForVerify(token, SESSION_TTL_SECONDS * 1000)
    .then(async (result) => {
      activeListeners.delete(token);
      if (result && result.phone) {
        logger.info('Loggin verification completed in background', { maskedPhone: result.phone.slice(-4) });
        const existing = await redisService.getJson(SESSION_KEY(token));
        if (existing) {
          existing.status = 'VERIFIED';
          existing.verifiedPhone = result.phone;
          await redisService.set(SESSION_KEY(token), existing, SESSION_TTL_SECONDS);
        }
      }
    })
    .catch(async (err) => {
      activeListeners.delete(token);
      logger.warn('Background Loggin listener failed/expired', { maskedToken, error: err.message });
      const existing = await redisService.getJson(SESSION_KEY(token));
      if (existing && existing.status === 'PENDING') {
        existing.status = 'EXPIRED';
        await redisService.set(SESSION_KEY(token), existing, 60);
      }
    });
}

async function getStatus(token) {
  if (!token) return { status: 'EXPIRED' };
  const session = await redisService.getJson(SESSION_KEY(token));
  if (!session) return { status: 'EXPIRED' };
  if (session.status === 'PENDING' && Date.now() > new Date(session.expiresAt).getTime()) {
    session.status = 'EXPIRED';
    await redisService.set(SESSION_KEY(token), session, 60);
  }
  return session;
}

/**
 * Atomically consumes a VERIFIED session. Only the request that wins the atomic
 * GET+DELETE receives the phone number; concurrent requests get null.
 */
async function consumeVerifiedSession(token) {
  if (!token) return null;
  const session = await redisService.getAndDeleteJson(SESSION_KEY(token));
  if (!session || session.status !== 'VERIFIED' || !session.verifiedPhone) return null;
  if (Date.now() > new Date(session.expiresAt).getTime()) return null;
  return session;
}

async function verifyToken(token) {
  const session = await getStatus(token);
  if (session && session.status === 'VERIFIED') {
    const consumed = await consumeVerifiedSession(token);
    if (!consumed) {
      const err = new Error('Loggin verification token already used');
      err.code = 'ALREADY_CONSUMED';
      throw err;
    }
    return { verifiedPhone: consumed.verifiedPhone };
  }
  if (session && session.status === 'EXPIRED') {
    const err = new Error('Loggin verification link expired');
    err.code = 'TOKEN_EXPIRED';
    throw err;
  }
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
