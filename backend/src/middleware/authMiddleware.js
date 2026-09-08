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
 *  6. User not found -> 401.
 *  7. Blocked user -> 403.
 *  8. DB unavailable -> 503 (fail closed).
 *  9. GAME_SESSION tokens are restricted to game APIs and the read-only profile endpoint.
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

function isAllowedGameSessionRoute(req) {
  if (req.baseUrl === '/api/games') return true;
  return req.baseUrl === '/api/user' && req.method === 'GET' && req.path === '/profile';
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

  if (!decoded || decoded.type !== 'USER') {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Invalid token type.',
    });
  }

  // GAME_SESSION is deliberately narrow: it can operate the game and read the profile
  // needed by the game UI, but cannot be replayed against wallet, deposit, withdrawal,
  // profile mutation, or other user-management endpoints.
  if (decoded.scope === 'GAME_SESSION' && !isAllowedGameSessionRoute(req)) {
    return res.status(401).json({
      status: 'error',
      code: 'GAME_SESSION_SCOPE_DENIED',
      message: 'This game session is not valid for this API.',
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

  req.user = {
    id: user.id,
    phone: user.phone,
  };

  next();
}

module.exports = authMiddleware;
