const { getClient, isDatabaseReady } = require('../database/db');
const logger = require('../utils/logger');

/**
 * Distributed game-loop leader election.
 *
 * A dedicated PostgreSQL session owns the advisory lock. Losing that session
 * releases the lock automatically, and workers verify the session periodically
 * so a stale process cannot continue running a game cycle after leadership loss.
 */

const LOCK_KEYS = {
  seven_up_down: 990001,
  dragon_tiger: 990002,
  crush: 990003,
};

class GameLeaderLock {
  constructor(gameId) {
    this.gameId = gameId;
    this.key = LOCK_KEYS[gameId] || 990000;
    this.client = null;
    this.isLeader = false;
  }

  async acquire() {
    if (this.isLeader && this.client) {
      return this.assertLeadership();
    }

    if (!isDatabaseReady()) return false;

    let client = null;
    try {
      client = await getClient();
      const res = await client.query('SELECT pg_try_advisory_lock($1::bigint) AS locked', [this.key]);
      const locked = !!(res.rows[0] && res.rows[0].locked);
      if (locked) {
        this.client = client;
        this.isLeader = true;
        logger.info('Acquired game leader lock — this instance runs the loop', { gameId: this.gameId });
        return true;
      }
      client.release();
      this.isLeader = false;
      return false;
    } catch (err) {
      if (client) {
        try { client.release(); } catch (_) { /* ignore */ }
      }
      this.isLeader = false;
      logger.warn('Failed to acquire game leader lock', { gameId: this.gameId, error: err.message });
      return false;
    }
  }

  /** Verify the dedicated DB session is still alive. */
  async assertLeadership() {
    if (!this.isLeader || !this.client) return false;
    try {
      await this.client.query('SELECT 1');
      return true;
    } catch (err) {
      logger.warn('Game leader lock session lost; stepping down', {
        gameId: this.gameId,
        error: err.message,
      });
      await this.release();
      return false;
    }
  }

  async release() {
    const client = this.client;
    this.client = null;
    this.isLeader = false;
    if (!client) return;
    try {
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [this.key]);
    } catch (_) { /* connection may already be gone; PG releases on disconnect */ }
    try { client.release(); } catch (_) { /* ignore */ }
  }
}

module.exports = { GameLeaderLock, LOCK_KEYS };
