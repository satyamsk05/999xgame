const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * JWT signing/verification built on the maintained `jsonwebtoken` library (sec 9).
 *
 * Security properties enforced here:
 *  - explicit algorithm restriction (HS256 only) — blocks `alg: none` and RS/HS confusion.
 *  - issuer (`iss`) and audience (`aud`) validation on every verify.
 *  - separate secrets + audiences for USER vs ADMIN tokens so a user token can never be
 *    replayed against an admin route (and vice versa).
 *  - explicit `type` claim ("USER" | "ADMIN") — no ambiguous isAdmin/role sniffing (sec 8).
 *  - expiration via `expiresIn`.
 *
 * The public helpers remain SYNCHRONOUS (signToken/verifyToken) so existing callers and
 * the test-suite require no control-flow changes.
 */

const ALGORITHM = 'HS256';
const ALLOWED_ALGORITHMS = [ALGORITHM];

function authError(message, code = 'TOKEN_INVALID') {
  const err = new Error(message);
  err.statusCode = 401;
  err.code = code;
  return err;
}

/**
 * Resolve an expiresIn value from either a legacy "seconds" number, an options object,
 * or a provided default.
 */
function resolveExpiresIn(optionsOrSeconds, defaultSeconds) {
  if (typeof optionsOrSeconds === 'number' && Number.isFinite(optionsOrSeconds)) {
    return optionsOrSeconds;
  }
  if (optionsOrSeconds && typeof optionsOrSeconds === 'object' && optionsOrSeconds.expiresIn) {
    return optionsOrSeconds.expiresIn;
  }
  return defaultSeconds;
}

function buildBody(payload, type, subjectValue) {
  const body = { ...(payload || {}) };
  // jsonwebtoken rejects a payload that already carries exp/iat when expiresIn is set.
  delete body.exp;
  delete body.iat;
  body.type = type;
  if (subjectValue !== undefined && subjectValue !== null) {
    body.sub = String(subjectValue);
  }
  return body;
}

/**
 * Sign a USER application token.
 * Backward compatible: signToken(payload) and signToken(payload, expiresInSeconds).
 */
function signToken(payload = {}, optionsOrSeconds) {
  const expiresIn = resolveExpiresIn(optionsOrSeconds, config.jwt.userTtlSeconds);
  const body = buildBody(payload, 'USER', payload.userId || payload.sub);
  return jwt.sign(body, config.jwtSecret, {
    algorithm: ALGORITHM,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    expiresIn,
  });
}

/**
 * Sign an ADMIN token with explicit type=ADMIN and the admin audience/secret (sec 8).
 */
function signAdminToken(payload = {}, optionsOrSeconds) {
  const expiresIn = resolveExpiresIn(optionsOrSeconds, config.jwt.adminTtlSeconds);
  const body = buildBody(payload, 'ADMIN', payload.adminId || payload.sub);
  return jwt.sign(body, config.adminJwtSecret, {
    algorithm: ALGORITHM,
    issuer: config.jwt.issuer,
    audience: config.jwt.adminAudience,
    expiresIn,
  });
}

/**
 * Verify a USER token. Throws a 401-marked error on any failure.
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    throw authError('Token is required');
  }
  try {
    return jwt.verify(token, config.jwtSecret, {
      algorithms: ALLOWED_ALGORITHMS,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      throw authError('JWT token has expired', 'TOKEN_EXPIRED');
    }
    throw authError(err && err.message ? err.message : 'Invalid JWT token');
  }
}

/**
 * Verify an ADMIN token against the admin secret + audience. Throws a 401-marked error.
 */
function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') {
    throw authError('Token is required');
  }
  try {
    return jwt.verify(token, config.adminJwtSecret, {
      algorithms: ALLOWED_ALGORITHMS,
      issuer: config.jwt.issuer,
      audience: config.jwt.adminAudience,
    });
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      throw authError('Admin token has expired', 'TOKEN_EXPIRED');
    }
    throw authError(err && err.message ? err.message : 'Invalid admin JWT token');
  }
}

module.exports = {
  signToken,
  signAdminToken,
  verifyToken,
  verifyAdminToken,
};
