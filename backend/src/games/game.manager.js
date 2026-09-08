const sevenUpDownWorker = require('./seven-up-down/seven_up_down.scheduler');
const dragonTigerWorker = require('./dragon-tiger/dragon_tiger.scheduler');
const crushWorker = require('./crush/crush.scheduler');
const { sevenUpDownEngine } = require('./seven-up-down/engine');
const { dragonTigerEngine } = require('./dragon-tiger/dragon_tiger.engine');
const { crushEngine } = require('./crush/crush.engine');
const logger = require('../utils/logger');

class GameManager {
  constructor() {
    this.engines = new Map();
    this.workers = new Map();
    this.io = null;

    // Register all active game engines & workers
    this.registerGame('seven_up_down', sevenUpDownEngine, sevenUpDownWorker);
    this.registerGame('dragon_tiger', dragonTigerEngine, dragonTigerWorker);
    this.registerGame('crush', crushEngine, crushWorker);
  }

  registerGame(gameId, engine, worker) {
    this.engines.set(gameId, engine);
    this.workers.set(gameId, worker);
    logger.info(`Registered game engine & worker: [${gameId}]`);
  }

  init(io) {
    this.io = io;
    logger.info('Initializing GameManager — Starting all registered game workers...');
    this.startWorker('seven_up_down');
    this.startWorker('dragon_tiger');
    this.startWorker('crush');
  }

  startWorker(gameId) {
    const worker = this.workers.get(gameId);
    if (!worker) {
      throw new Error(`Cannot start worker: game [${gameId}] is not registered`);
    }
    worker.startScheduler(this.io);
  }

  stopWorker(gameId) {
    const worker = this.workers.get(gameId);
    if (worker) {
      worker.stopScheduler();
    }
  }

  /**
   * Stop every game loop and release advisory leader locks (graceful shutdown).
   * Awaits workers that return a promise from stopScheduler.
   */
  async stopAll() {
    logger.info('Stopping all game workers and releasing leader locks...');
    const results = [];
    for (const [gameId, worker] of this.workers.entries()) {
      try {
        const r = worker.stopScheduler();
        if (r && typeof r.then === 'function') await r;
        results.push(`${gameId}:stopped`);
      } catch (err) {
        logger.warn('Failed to stop game worker cleanly', { gameId, error: err.message });
        results.push(`${gameId}:error`);
      }
    }
    return results;
  }

  isWorkerHealthy(gameId) {
    const worker = this.workers.get(gameId);
    if (!worker) return false;
    return typeof worker.isWorkerRunning === 'function' ? worker.isWorkerRunning() : true;
  }

  getEngine(gameId) {
    return this.engines.get(gameId) || null;
  }

  getRegisteredGames() {
    return Array.from(this.engines.keys());
  }

  getHealthSummary() {
    const summary = {};
    for (const [gameId, worker] of this.workers.entries()) {
      summary[gameId] = {
        registered: true,
        running: typeof worker.isWorkerRunning === 'function' ? worker.isWorkerRunning() : true,
      };
    }
    return summary;
  }
}

const gameManager = new GameManager();

module.exports = {
  gameManager,
  GameManager,
};
