const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

const ALGORITHM = 'HS256';
const ALLOWED_ALGORITHMS = [ALGORITHM];

function authError(message, code = 'TOKEN_INVALID') {
  const err = new Error(message);
  err.statusCode = 401;
  err.code = code;
  return err;
}

function resolveExpiresIn(optionsOrSeconds, defaultSeconds) {
  if (typeof optionsOrSeconds === 'number' && Number.isFinite(optionsOrSeconds)) return optionsOrSeconds;
  if (optionsOrSeconds && typeof optionsOrSeconds === 'object' && optionsOrSeconds.expiresIn) return optionsOrSeconds.expiresIn;
  return defaultSeconds;
}

function buildBody(payload, type, subjectValue) {
  const body = { ...(payload || {}) };
  delete body.exp;
  delete body.iat;
  body.type = type;
  if (subjectValue !== undefined && subjectValue !== null) body.sub = String(subjectValue);
  return body;
}

function signToken(payload = {}, optionsOrSeconds) {
  const expiresIn = resolveExpiresIn(optionsOrSeconds, config.jwt.userTtlSeconds);
  const body = buildBody(payload, 'USER', payload.userId || payload.sub);
  return jwt.sign(body, config.jwtSecret, { algorithm: ALGORITHM, issuer: config.jwt.issuer, audience: config.jwt.audience, expiresIn });
}

function signAdminToken(payload = {}, optionsOrSeconds) {
  const expiresIn = resolveExpiresIn(optionsOrSeconds, config.jwt.adminTtlSeconds);
  const body = buildBody(payload, 'ADMIN', payload.adminId || payload.sub);
  if (!body.jti) body.jti = crypto.randomUUID();
  return jwt.sign(body, config.adminJwtSecret, { algorithm: ALGORITHM, issuer: config.jwt.issuer, audience: config.jwt.adminAudience, expiresIn });
}

function signPaymentToken(payload = {}, optionsOrSeconds) {
  const expiresIn = resolveExpiresIn(optionsOrSeconds, 30 * 60);
  const body = buildBody(payload, 'PAYMENT', payload.userId || payload.sub);
  return jwt.sign(body, config.jwtSecret, { algorithm: ALGORITHM, issuer: config.jwt.issuer, audience: '999xgame-payment', expiresIn });
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') throw authError('Token is required');
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ALLOWED_ALGORITHMS, issuer: config.jwt.issuer, audience: config.jwt.audience });
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') throw authError('JWT token has expired', 'TOKEN_EXPIRED');
    throw authError(err && err.message ? err.message : 'Invalid JWT token');
  }
}

function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') throw authError('Token is required');
  try {
    return jwt.verify(token, config.adminJwtSecret, { algorithms: ALLOWED_ALGORITHMS, issuer: config.jwt.issuer, audience: config.jwt.adminAudience });
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') throw authError('Admin token has expired', 'TOKEN_EXPIRED');
    throw authError(err && err.message ? err.message : 'Invalid admin JWT token');
  }
}

function verifyPaymentToken(token) {
  if (!token || typeof token !== 'string') throw authError('Payment token is required');
  try {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ALLOWED_ALGORITHMS, issuer: config.jwt.issuer, audience: '999xgame-payment' });
    if (decoded.type !== 'PAYMENT' || !decoded.depositId || !decoded.sub) throw authError('Invalid payment token');
    return decoded;
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') throw authError('Payment link has expired', 'TOKEN_EXPIRED');
    if (err.statusCode) throw err;
    throw authError(err && err.message ? err.message : 'Invalid payment token');
  }
}

module.exports = { signToken, signAdminToken, signPaymentToken, verifyToken, verifyAdminToken, verifyPaymentToken };
