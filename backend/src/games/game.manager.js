const sevenUpDownWorker = require('./seven-up-down/seven_up_down.scheduler');
const dragonTigerWorker = require('./dragon-tiger/dragon_tiger.scheduler');
const crushWorker = require('./crush/crush.scheduler');
const { sevenUpDownEngine } = require('./seven-up-down/engine');
const { dragonTigerEngine } = require('./dragon-tiger/dragon_tiger.engine');
const { crushEngine } = require('./crush/crush.engine');
const { query } = require('../database/db');
const logger = require('../utils/logger');

class GameManager {
  constructor() {
    this.engines = new Map();
    this.workers = new Map();
    this.io = null;
    this.registerGame('seven_up_down', sevenUpDownEngine, sevenUpDownWorker);
    this.registerGame('dragon_tiger', dragonTigerEngine, dragonTigerWorker);
    this.registerGame('crush', crushEngine, crushWorker);
  }

  registerGame(gameId, engine, worker) {
    this.engines.set(gameId, engine);
    this.workers.set(gameId, worker);
    logger.info(`Registered game engine & worker: [${gameId}]`);
  }

  async isGameLive(gameId) {
    try {
      const result = await query('SELECT status FROM games WHERE id = $1', [gameId]);
      return result.rows[0]?.status === 'LIVE';
    } catch (err) {
      logger.error('Cannot read game status; refusing to start worker', { gameId, error: err.message });
      return false;
    }
  }

  async init(io) {
    this.io = io;
    logger.info('Initializing GameManager — starting only LIVE game workers...');
    for (const gameId of this.workers.keys()) {
      if (await this.isGameLive(gameId)) this.startWorker(gameId);
      else logger.info('Game worker kept stopped because game is not LIVE', { gameId });
    }
  }

  startWorker(gameId) {
    const worker = this.workers.get(gameId);
    if (!worker) throw new Error(`Cannot start worker: game [${gameId}] is not registered`);
    if (typeof worker.isWorkerRunning === 'function' && worker.isWorkerRunning()) return false;
    worker.startScheduler(this.io);
    return true;
  }

  async stopWorker(gameId) {
    const worker = this.workers.get(gameId);
    if (!worker) return false;
    if (typeof worker.isWorkerRunning === 'function' && !worker.isWorkerRunning()) return false;
    await worker.stopScheduler();
    return true;
  }

  async setGameLive(gameId, live) {
    if (!this.workers.has(gameId) || !this.getEngine(gameId)) {
      throw new Error(`Game is not registered: ${gameId}`);
    }
    if (live) {
      this.startWorker(gameId);
    } else {
      await this.stopWorker(gameId);
    }
  }

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
