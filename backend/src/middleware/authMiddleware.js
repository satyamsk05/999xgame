const { verifyToken } = require('../auth/jwt');
const logger = require('../utils/logger');

function authMiddleware(req, res, next) {
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

    // Attach authenticated user context from cryptographically verified token
    req.user = {
      id: decoded.userId,
      phone: decoded.phone,
    };

    next();
  } catch (err) {
    logger.warn('JWT Verification failed', { token, error: err.message });
    return res.status(401).json({
      status: 'error',
      message: `Unauthorized: ${err.message}`,
    });
  }
}

module.exports = authMiddleware;
