const { verifyToken } = require('../auth/jwt');
const userRepo = require('../users/user.repository');
const logger = require('../utils/logger');

/**
 * USER authentication middleware.
 *
 * GAME_SESSION tokens are deliberately narrower than normal USER tokens:
 * - they are accepted only by game APIs and read-only profile
 * - /api/games/session and /api/games/bet-history require a normal USER token
 * - game-session tokens are bound to exactly one game and cannot be replayed
 *   against another game's betting/cashout/state endpoints.
 */

const GAME_ALIASES = { '7updown': 'seven_up_down' };

function canonicalGameId(gameId) {
  const value = String(gameId || '').trim();
  return GAME_ALIASES[value] || value;
}

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

function routeGameId(req) {
  if (req.params?.gameId) return canonicalGameId(req.params.gameId);
  if (req.path.startsWith('/7updown/')) return 'seven_up_down';
  if (req.path.startsWith('/dragon_tiger/')) return 'dragon_tiger';
  if (req.path.startsWith('/crush/')) return 'crush';
  if (req.path === '/join') return 'seven_up_down';
  return null;
}

function isAllowedGameSessionRoute(req, decoded) {
  if (req.baseUrl === '/api/user' && req.method === 'GET' && req.path === '/profile') return true;
  if (req.baseUrl !== '/api/games') return false;

  // Session creation and aggregate history must use the normal USER token.
  if (req.path === '/session' || req.path === '/bet-history') return false;

  const requestedGame = routeGameId(req);
  if (!requestedGame) return false;

  const tokenGame = canonicalGameId(decoded.gameId);
  return Boolean(tokenGame) && tokenGame === requestedGame;
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

  if (decoded.scope === 'GAME_SESSION' && !isAllowedGameSessionRoute(req, decoded)) {
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
  req.auth = decoded;

  next();
}

module.exports = authMiddleware;
