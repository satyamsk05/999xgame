const { verifyToken } = require('../auth/jwt');
const userRepo = require('../users/user.repository');
const logger = require('../utils/logger');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized: Authorization token required in header (Bearer <token>)',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Invalid token payload',
      });
    }

    const user = await userRepo.getUserById(decoded.userId);
    if (user && user.is_blocked) {
      return res.status(403).json({
        status: 'error',
        message: 'Account is blocked/suspended. Please contact support.',
      });
    }

    // Attach authenticated user context from cryptographically verified token
    req.user = {
      id: decoded.userId,
      phone: decoded.phone,
    };

    next();
  } catch (err) {
    const maskedToken = token ? `${token.substring(0, 8)}***` : 'none';
    logger.warn('JWT Verification failed', { maskedToken, error: err.message });
    return res.status(401).json({
      status: 'error',
      message: `Unauthorized: ${err.message}`,
    });
  }
}

module.exports = authMiddleware;
