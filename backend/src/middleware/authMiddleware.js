const { verifyToken } = require('../auth/jwt');
const userRepo = require('../users/user.repository');
const logger = require('../utils/logger');

/**
 * USER authentication middleware (sec 10).
 *
 * Rules enforced:
 *  1. Authorization header required.
 *  2. JWT verified (signature + iss + aud + expiry + algorithm).
 *  3. token.type === "USER" required.
 *  4. Subject (userId) required.
 *  5. User loaded from PostgreSQL (authoritative).
 *  6. User not found -> 401 (never treat an unknown user as authenticated).
 *  7. Blocked user -> 403.
 *  8. DB unavailable -> 503 (fail closed).
 *
 * req.user is always { id, phone } sourced from the authoritative DB row.
 */

function isDbUnavailable(err) {
  if (!err) return false;
  if (err.statusCode === 503) return true;
  const code = err.code;
  return (
    code === 'DATABASE_UNAVAILABLE' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03' ||
    code === '28000' ||
    code === '3D000'
  );
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Authorization token required in header (Bearer <token>)',
    });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    const maskedToken = token ? `${token.substring(0, 8)}***` : 'none';
    logger.warn('JWT verification failed', { maskedToken, error: err.message });
    return res.status(401).json({
      status: 'error',
      code: err.code || 'UNAUTHORIZED',
      message: `Unauthorized: ${err.message}`,
    });
  }

  // Explicit token type check (sec 8/10) — an ADMIN token must never authenticate a user route.
  if (!decoded || decoded.type !== 'USER') {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Invalid token type.',
    });
  }

  const userId = decoded.sub || decoded.userId;
  if (!userId) {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Invalid token payload.',
    });
  }

  // Load the authoritative user from PostgreSQL. Fail closed on DB errors.
  let user;
  try {
    user = await userRepo.getUserById(userId);
  } catch (err) {
    if (isDbUnavailable(err)) {
      logger.error('Auth blocked: database unavailable', { userId, error: err.message });
      return res.status(503).json({
        status: 'error',
        code: 'DATABASE_UNAVAILABLE',
        message: 'Service temporarily unavailable. Please try again shortly.',
      });
    }
    logger.error('Auth user lookup failed', { userId, error: err.message });
    return res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Authentication failed due to an internal error.',
    });
  }

  // Unknown user -> 401. Never treat an unknown user as authenticated.
  if (!user) {
    logger.warn('Auth rejected: token subject not found', { userId });
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Account no longer exists.',
    });
  }

  if (user.is_blocked) {
    return res.status(403).json({
      status: 'error',
      code: 'ACCOUNT_BLOCKED',
      message: 'Account is blocked/suspended. Please contact support.',
    });
  }

  // Attach authenticated user context from the authoritative DB row.
  req.user = {
    id: user.id,
    phone: user.phone,
  };

  next();
}

module.exports = authMiddleware;
