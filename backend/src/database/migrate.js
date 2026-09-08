const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Idempotent, ordered SQL migration runner (sec 29).
 *
 * Design rules:
 *  - Migrations live in ./migrations as NNN_name.sql and are applied in lexical
 *    (numeric) order exactly once. Applied versions are tracked in the
 *    `schema_migrations` table.
 *  - Each migration runs inside its own transaction. If it throws, the
 *    transaction is rolled back and the error propagates so initDb() can mark the
 *    database NOT ready (fail closed). We never half-apply a migration.
 *  - The runner NEVER drops a table and NEVER deletes production data. Migration
 *    files themselves are written with IF NOT EXISTS / ON CONFLICT guards so they
 *    are safe to run against both fresh and pre-existing databases.
 *  - Re-running is a no-op: already-applied versions are skipped.
 */

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Ensure the bookkeeping table exists. Safe to call on every boot.
 */
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(191) PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Return the sorted list of migration files present on disk.
 */
function readMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Apply all pending migrations using the supplied connected client.
 * @returns {Promise<{applied: string[], skipped: number}>}
 */
async function runMigrations(client) {
  await ensureMigrationsTable(client);

  const files = readMigrationFiles();
  const appliedRes = await client.query('SELECT version FROM schema_migrations');
  const appliedSet = new Set(appliedRes.rows.map((r) => r.version));

  const applied = [];
  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW()) ON CONFLICT (version) DO NOTHING',
        [file]
      );
      await client.query('COMMIT');
      applied.push(file);
      logger.info('Applied database migration', { migration: file });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Database migration failed; rolled back', {
        migration: file,
        error: err.message || String(err),
      });
      throw err;
    }
  }

  return { applied, skipped: files.length - applied.length };
}

module.exports = { runMigrations, readMigrationFiles, MIGRATIONS_DIR };
