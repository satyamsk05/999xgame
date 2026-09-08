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

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || (socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) { socket.user = null; return next(); }
    const decoded = verifyToken(token);
    if (!decoded || decoded.type !== 'USER') return next(new Error('UNAUTHORIZED'));
    const userId = decoded.sub || decoded.userId;
    if (!userId) return next(new Error('UNAUTHORIZED'));
    const user = await userRepo.getUserById(userId);
    if (!user) return next(new Error('UNAUTHORIZED'));
    if (user.is_blocked) return next(new Error('FORBIDDEN'));
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
  io.emit('ONLINE_USERS', { count: io.engine.clientsCount });
  socket.on('disconnect', (reason) => {
    logger.info('Client disconnected', { socketId: socket.id, reason, activeUsers: io.engine.clientsCount });
    io.emit('ONLINE_USERS', { count: io.engine.clientsCount });
  });
});

server.listen(config.port, async () => {
  logger.info(`Ingames Backend Server running on port ${config.port}`, { env: config.nodeEnv, port: config.port });

  const dbReady = await initDb();
  if (!dbReady) logger.error('Database not ready at boot — game workers will stay stopped until DB is ready.');

  // IMPORTANT: await status checks before starting workers. Only DB games with LIVE
  // status are allowed to create rounds; COMING_SOON/DISABLED games stay stopped.
  if (dbReady) {
    try {
      await gameManager.init(io);
    } catch (err) {
      logger.error('GameManager initialization failed; workers remain stopped', { error: err.message });
    }
  }
});

function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  const stopWorkers = Promise.resolve().then(() => gameManager.stopAll()).catch((err) => logger.warn('Error stopping game workers', { error: err.message }));
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
