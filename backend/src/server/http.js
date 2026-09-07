const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const config = require('../config/env');
const logger = require('../utils/logger');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
  },
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

server.listen(config.port, () => {
  logger.info(`Ingames Backend Server running on port ${config.port}`, {
    env: config.nodeEnv,
    port: config.port,
  });
});

// Graceful Shutdown
function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed cleanly.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { server, io };
