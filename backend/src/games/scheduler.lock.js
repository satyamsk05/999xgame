const { getClient, isDatabaseReady } = require('../database/db');
const logger = require('../utils/logger');

/**
 * Distributed game-loop leader election (sec 47).
 *
 * In a multi-instance deployment every process would otherwise run its own game
 * loop and create/settle its OWN rounds, producing duplicate rounds and racing
 * settlements. We use a PostgreSQL session-level advisory lock as a leader lock:
 * exactly ONE instance holds the lock per game and runs that game's loop. All
 * other instances idle and re-poll each cycle.
 *
 * Failover is automatic: the advisory lock is bound to the DB session, so if the
 * leader's connection drops (crash, network, deploy) PostgreSQL releases the lock
 * and another instance acquires it on its next poll. The leader health-checks its
 * lock connection at the start of every cycle and steps down if it is gone.
 */

// Fixed, stable 64-bit lock keys (one per game). Arbitrary but must never collide.
const LOCK_KEYS = {
  seven_up_down: 990001,
  dragon_tiger: 990002,
  crush: 990003,
};

class GameLeaderLock {
  constructor(gameId) {
    this.gameId = gameId;
    this.key = LOCK_KEYS[gameId] || 990000;
    this.client = null; // dedicated client that owns the session lock
    this.isLeader = false;
  }

  /**
   * Attempt to become (or remain) the leader for this game.
   * @returns {Promise<boolean>} true only if THIS instance may run the loop cycle.
   */
  async acquire() {
    // Already leader -> verify the lock session is still alive before doing work.
    if (this.isLeader && this.client) {
      try {
        await this.client.query('SELECT 1');
        return true;
      } catch (err) {
        logger.warn('Game leader lock session lost; stepping down for re-election', {
          gameId: this.gameId,
          error: err.message,
        });
        await this.release();
      }
    }

    // Fail closed: never run a game loop without a ready database.
    if (!isDatabaseReady()) return false;

    let client = null;
    try {
      client = await getClient();
      const res = await client.query('SELECT pg_try_advisory_lock($1::bigint) AS locked', [this.key]);
      const locked = !!(res.rows[0] && res.rows[0].locked);
      if (locked) {
        this.client = client; // keep the client checked out to retain the session lock
        this.isLeader = true;
        logger.info('Acquired game leader lock — this instance runs the loop', { gameId: this.gameId });
        return true;
      }
      // Another instance is leader; return the probe client to the pool.
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

  /**
   * Release leadership (graceful shutdown / step-down).
   */
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
