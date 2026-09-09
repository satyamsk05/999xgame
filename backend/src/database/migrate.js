const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Idempotent, ordered SQL migration runner.
 *
 * Applied migrations are tracked by filename + SHA-256 checksum. Once a
 * migration has been applied, changing its contents is treated as a startup
 * error instead of silently running a different schema history.
 *
 * A PostgreSQL advisory lock serializes migration runners so multiple AWS
 * instances cannot concurrently create/update the schema.
 */

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_LOCK_KEY = migrationLockKey();

function migrationLockKey() {
  // PostgreSQL advisory locks accept signed 64-bit integers. Derive a stable
  // key from the application name rather than using a magic random value.
  const digest = crypto.createHash('sha256').update('999xgame:schema-migrations', 'utf8').digest();
  return digest.readInt32BE(0) * 0x100000000 + digest.readUInt32BE(4);
}

function migrationChecksum(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(191) PRIMARY KEY,
      checksum CHAR(64),
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Upgrade installations created by the previous runner.
  await client.query(`
    ALTER TABLE schema_migrations
      ADD COLUMN IF NOT EXISTS checksum CHAR(64)
  `);
}

function readMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Database migrations directory is missing: ${MIGRATIONS_DIR}`);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0 && process.env.NODE_ENV === 'production') {
    throw new Error('No database migrations found; refusing production startup');
  }

  return files;
}

async function runMigrations(client) {
  let lockAcquired = false;

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    lockAcquired = true;

    await ensureMigrationsTable(client);

    const files = readMigrationFiles();
    const appliedRes = await client.query('SELECT version, checksum FROM schema_migrations');
    const appliedMap = new Map(appliedRes.rows.map((r) => [r.version, r.checksum]));

    const applied = [];
    let skipped = 0;

    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = migrationChecksum(sql);

      if (appliedMap.has(file)) {
        const storedChecksum = appliedMap.get(file);

        // Existing databases from the old runner have no checksum. Backfill it
        // once, without re-running the already-applied migration.
        if (!storedChecksum) {
          await client.query(
            'UPDATE schema_migrations SET checksum = $2 WHERE version = $1 AND checksum IS NULL',
            [file, checksum]
          );
        } else if (storedChecksum !== checksum) {
          throw new Error(
            `Migration checksum mismatch for ${file}. Applied=${storedChecksum}, current=${checksum}. Restore the original migration file or create a new migration.`
          );
        }

        skipped += 1;
        continue;
      }

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (version, checksum, applied_at)
           VALUES ($1, $2, NOW())`,
          [file, checksum]
        );
        await client.query('COMMIT');
        applied.push(file);
        logger.info('Applied database migration', { migration: file, checksum });
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Database migration failed; rolled back', {
          migration: file,
          error: err.message || String(err),
        });
        throw err;
      }
    }

    return { applied, skipped };
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
      } catch (err) {
        logger.error('Failed to release database migration advisory lock', {
          error: err.message || String(err),
        });
      }
    }
  }
}

module.exports = { runMigrations, readMigrationFiles, MIGRATIONS_DIR, migrationChecksum };
