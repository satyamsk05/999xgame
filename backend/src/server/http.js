const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const config = require('../config/env');
const logger = require('../utils/logger');
const { verifyToken } = require('../auth/jwt');
const userRepo = require('../users/user.repository');
const { gameManager } = require('../games/game.manager');
const { initDb } = require('../database/db');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
  },
});

// Socket.IO authentication (sec 46) — uses the SAME canonical user JWT rules as HTTP.
// An invalid/expired/wrong-type token is REJECTED (never silently treated as authed).
// A connection with NO token is allowed only as an anonymous spectator of PUBLIC game
// events; it never joins a user room, so it cannot receive per-user/sensitive events.
io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');

    if (!token) {
      socket.user = null;
      return next();
    }

    // A token was presented: it MUST be fully valid.
    const decoded = verifyToken(token); // throws on bad signature/exp/iss/aud/alg
    if (!decoded || decoded.type !== 'USER') {
      return next(new Error('UNAUTHORIZED'));
    }
    const userId = decoded.sub || decoded.userId;
    if (!userId) {
      return next(new Error('UNAUTHORIZED'));
    }

    // Authoritative DB check (sec 10): the user must exist and not be blocked.
    const user = await userRepo.getUserById(userId); // throws -> fail closed
    if (!user) {
      return next(new Error('UNAUTHORIZED'));
    }
    if (user.is_blocked) {
      return next(new Error('FORBIDDEN'));
    }

    socket.user = { id: user.id, phone: user.phone };
    await socket.join(`user:${user.id}`);
    logger.info('Socket connection authenticated', { socketId: socket.id, userId: user.id });
    return next();
  } catch (err) {
    const isDb = err && (err.statusCode === 503 || err.code === 'DATABASE_UNAVAILABLE');
    logger.warn('Socket authentication rejected', { socketId: socket.id, error: err.message, dbUnavailable: !!isDb });
    return next(new Error(isDb ? 'SERVICE_UNAVAILABLE' : 'UNAUTHORIZED'));
  }
});

app.setOnlineUsersGetter(() => io.engine.clientsCount);

io.on('connection', (socket) => {
  logger.info('Client connected to Socket.io', { socketId: socket.id, activeUsers: io.engine.clientsCount });

  // Broadcast realtime online users count
  io.emit('ONLINE_USERS', { count: io.engine.clientsCount });

  socket.on('disconnect', (reason) => {
    logger.info('Client disconnected', { socketId: socket.id, reason, activeUsers: io.engine.clientsCount });
    io.emit('ONLINE_USERS', { count: io.engine.clientsCount });
  });
});

server.listen(config.port, async () => {
  logger.info(`Ingames Backend Server running on port ${config.port}`, {
    env: config.nodeEnv,
    port: config.port,
  });

  // Initialize the database (schema + readiness) BEFORE starting game workers so the
  // schedulers never fire against a not-ready DB (fail-closed boot ordering, sec 4/47).
  const dbReady = await initDb();
  if (!dbReady) {
    logger.error('Database not ready at boot — game workers will stay idle until it recovers (fail closed).');
  }

  // Start GameManager workers for all live games (7 Up Down, Dragon Tiger, Crush)
  gameManager.init(io);
});

// Graceful Shutdown
function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  // Stop game loops and release advisory leader locks so another instance can take over.
  const stopWorkers = Promise.resolve()
    .then(() => gameManager.stopAll())
    .catch((err) => logger.warn('Error stopping game workers', { error: err.message }));

  stopWorkers.finally(() => {
    server.close(() => {
      logger.info('HTTP server closed cleanly.');
      process.exit(0);
    });
  });

  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { server, io };
