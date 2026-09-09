const { Pool } = require('pg');
const config = require('../config/env');
const logger = require('../utils/logger');
const { runMigrations } = require('./migrate');

/**
 * PostgreSQL is the ONLY authoritative financial database.
 *
 * SECURITY / MONEY-INTEGRITY RULE (fail closed):
 *  - If PostgreSQL is unavailable, financial operations MUST fail with HTTP 503.
 *  - There is NO in-memory fallback in production.
 */

const ssl = config.db.ssl
  ? {
      rejectUnauthorized: config.db.sslRejectUnauthorized,
      ...(config.db.sslCa ? { ca: config.db.sslCa } : {}),
    }
  : false;

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  ssl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '15000', 10),
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '20000', 10),
});

pool.on('error', (err) => {
  dbState.ready = false;
  logger.warn('PostgreSQL pool connection error', { error: err.message || String(err) });
});

const dbState = {
  ready: false,
  schemaInitialized: false,
  lastInitAttempt: 0,
  lastError: null,
};

const INIT_RETRY_INTERVAL_MS = 5000;

function databaseUnavailableError(cause) {
  const err = new Error('Database is currently unavailable. Please try again shortly.');
  err.statusCode = 503;
  err.code = 'DATABASE_UNAVAILABLE';
  if (cause) err.cause = cause;
  return err;
}

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
    await client.query('SELECT 1');

    if (!dbState.schemaInitialized) {
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

async function ensureReady() {
  if (!dbState.ready) await initDb();
  if (!dbState.ready) throw databaseUnavailableError(dbState.lastError);
}

async function query(text, params) {
  await ensureReady();
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    logger.debug('Executed DB Query', { duration: Date.now() - start, rows: res.rowCount });
    return res;
  } catch (err) {
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
  return (
    code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT' ||
    code === '57P01' || code === '57P02' || code === '57P03' ||
    code === '28000' || code === '3D000' ||
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
