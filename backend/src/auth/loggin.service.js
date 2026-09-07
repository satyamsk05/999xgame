// Polyfill global EventSource for @loggin/sdk in Node.js CommonJS
if (typeof global.EventSource === 'undefined') {
  const esModule = require('eventsource');
  global.EventSource = esModule.EventSource || esModule.default || esModule;
}

const { loggin } = require('@loggin/sdk');
const config = require('../config/env');
const logger = require('../utils/logger');

// Store active verification sessions in memory / cache with 5-minute expiration
const activeTokens = new Map(); // token -> { createdAt, link }

/**
 * Generate Loggin WhatsApp token & link
 */
function createToken() {
  try {
    const { token, link } = loggin.createToken(config.logginAppKey);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes TTL

    activeTokens.set(token, {
      createdAt: Date.now(),
      expiresAt,
      link,
    });

    logger.info('Created Loggin WhatsApp token', { maskedToken: token.slice(0, 4) + '***', expiresAt });
    return { token, link, expiresAt };
  } catch (err) {
    logger.error('Failed to create Loggin token', { error: err.message });
    throw new Error(`Loggin token creation error: ${err.message}`);
  }
}

/**
 * Wait and verify Loggin WhatsApp token server-side
 * NEVER TRUST CLIENT PHONE NUMBER. Use phone returned by Loggin SDK!
 */
async function verifyToken(token, timeoutMs = 300000) {
  if (!token) {
    throw new Error('Token is required for verification');
  }

  const tokenData = activeTokens.get(token);
  if (tokenData && Date.now() > new Date(tokenData.expiresAt).getTime()) {
    activeTokens.delete(token);
    const err = new Error('Loggin verification link expired after 5 minutes');
    err.code = 'TOKEN_EXPIRED';
    throw err;
  }

  const maskedToken = token.slice(0, 4) + '***';
  try {
    logger.info('Subscribing for Loggin server-side token verification...', { maskedToken });
    const result = await loggin.waitForVerify(token, timeoutMs);

    if (!result || !result.phone) {
      throw new Error('Verification failed: No verified phone number returned');
    }

    activeTokens.delete(token);
    logger.info('Loggin token verified successfully server-side', { maskedPhone: result.phone.slice(-4) });

    return {
      verifiedPhone: result.phone,
    };
  } catch (err) {
    logger.error('Loggin token verification failed/expired', { maskedToken, error: err.message });
    if (err.message.includes('expired')) {
      err.code = 'TOKEN_EXPIRED';
    }
    throw err;
  }
}

module.exports = {
  createToken,
  verifyToken,
};
