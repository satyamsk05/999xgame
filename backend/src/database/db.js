const { Pool } = require('pg');
const config = require('../config/env');
const logger = require('../utils/logger');
const { runMigrations } = require('./migrate');

/**
 * PostgreSQL is the ONLY authoritative financial database.
 *
 * SECURITY / MONEY-INTEGRITY RULE (fail closed):
 *  - If PostgreSQL is unavailable, financial operations MUST fail with HTTP 503.
 *  - There is NO in-memory fallback in production. A failed DB connection must
 *    never look healthy and must never produce fake wallet/bet/deposit/settlement
 *    success.
 *
 * A dedicated mock client for tests lives in the test suite itself
 * (see tests/financial.test.js createMockClient) and is NOT wired into runtime.
 */

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  // An idle client errored. Mark DB as not-ready so callers fail closed until it recovers.
  dbState.ready = false;
  logger.warn('PostgreSQL pool connection error', { error: err.message || String(err) });
});

/**
 * Explicit database availability state.
 *  - ready: a live connection + schema migration succeeded.
 *  - schemaInitialized: all pending migrations have been applied this process.
 *  - lastInitAttempt: throttle so we do not hammer a down DB on every query.
 */
const dbState = {
  ready: false,
  schemaInitialized: false,
  lastInitAttempt: 0,
  lastError: null,
};

const INIT_RETRY_INTERVAL_MS = 5000;

/**
 * Build the standardized fail-closed error surfaced to the error handler.
 */
function databaseUnavailableError(cause) {
  const err = new Error('Database is currently unavailable. Please try again shortly.');
  err.statusCode = 503;
  err.code = 'DATABASE_UNAVAILABLE';
  if (cause) err.cause = cause;
  return err;
}

/**
 * Initialize the DB connection and apply the (idempotent) schema.
 * Safe to call repeatedly. Sets explicit readiness state. Never throws for a
 * down database — it records the failure and leaves the DB marked not-ready so
 * that query()/getClient() fail closed.
 */
async function initDb({ force = false } = {}) {
  if (dbState.ready && dbState.schemaInitialized && !force) return dbState.ready;

  const now = Date.now();
  if (!force && dbState.lastInitAttempt && now - dbState.lastInitAttempt < INIT_RETRY_INTERVAL_MS) {
    return dbState.ready;
  }
  dbState.lastInitAttempt = now;

  let client = null;
  try {
    client = await pool.connect();
    // Connectivity confirmed.
    await client.query('SELECT 1');

    if (!dbState.schemaInitialized) {
      // sec 29: apply ordered, idempotent migrations (tracked in schema_migrations)
      // instead of executing a huge schema.sql on every startup. The runner never
      // drops tables and never deletes data; a failure rolls back and fails closed.
      await runMigrations(client);
      dbState.schemaInitialized = true;
      logger.info('PostgreSQL money-flow schema initialized & migrated successfully');
    }

    dbState.ready = true;
    dbState.lastError = null;
    return true;
  } catch (err) {
    dbState.ready = false;
    dbState.lastError = err.message || String(err);
    logger.error(
      `PostgreSQL connection/initialization failed (${dbState.lastError}). ` +
      `Financial operations will fail closed with HTTP 503. No in-memory fallback is used.`
    );
    return false;
  } finally {
    if (client) client.release();
  }
}

/**
 * Explicit readiness probe used by /ready and health checks.
 */
async function checkDatabase() {
  try {
    await pool.query('SELECT 1');
    dbState.ready = true;
    dbState.lastError = null;
    return true;
  } catch (err) {
    dbState.ready = false;
    dbState.lastError = err.message || String(err);
    return false;
  }
}

function isDatabaseReady() {
  return dbState.ready === true;
}

function getDatabaseState() {
  return {
    ready: dbState.ready,
    schemaInitialized: dbState.schemaInitialized,
    lastError: dbState.lastError,
  };
}

/**
 * Ensure we have attempted initialization and that the DB is ready.
 * Throws a fail-closed 503 error when PostgreSQL is unavailable.
 */
async function ensureReady() {
  if (!dbState.ready) {
    await initDb();
  }
  if (!dbState.ready) {
    throw databaseUnavailableError(dbState.lastError);
  }
}

async function query(text, params) {
  await ensureReady();

  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed DB Query', { duration, rows: res.rowCount });
    return res;
  } catch (err) {
    // Connection-level failures mark the DB not-ready so subsequent calls fail
    // closed fast (and recover automatically once PG is back).
    if (isConnectionError(err)) dbState.ready = false;
    logger.warn('DB Query failed', { error: err.message || String(err), code: err.code });
    throw err;
  }
}

async function getClient() {
  await ensureReady();
  try {
    return await pool.connect();
  } catch (err) {
    if (isConnectionError(err)) dbState.ready = false;
    logger.warn('Failed to acquire DB client', { error: err.message || String(err), code: err.code });
    throw databaseUnavailableError(err);
  }
}

function isConnectionError(err) {
  if (!err) return false;
  const code = err.code;
  // Common pg connection/system error codes.
  return (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === '57P01' || // admin_shutdown
    code === '57P02' || // crash_shutdown
    code === '57P03' || // cannot_connect_now
    code === '28000' || // auth failure
    code === '3D000' || // invalid catalog name (db does not exist)
    err.message === 'Connection terminated unexpectedly'
  );
}

module.exports = {
  pool,
  query,
  getClient,
  initDb,
  checkDatabase,
  isDatabaseReady,
  getDatabaseState,
};
