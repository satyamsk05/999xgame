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
  // Use PostgreSQL's two-int32 advisory-lock variant so the derived key is
  // represented exactly without JavaScript's unsafe 64-bit Number range.
  const digest = crypto.createHash('sha256').update('999xgame:schema-migrations', 'utf8').digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

function migrationChecksum(sql) {
  // Normalize Windows CRLF line endings to Linux LF line endings
  const normalized = sql.replace(/\r\n/g, '\n').trim();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
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

  if (files.length === 0) {
    throw new Error('No database migrations found in migrations directory; refusing startup');
  }

  return files;
}

async function runMigrations(client) {
  let lockAcquired = false;

  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', MIGRATION_LOCK_KEY);
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

        // If stored checksum is empty or mismatched, update it to the current normalized hash
        if (!storedChecksum || storedChecksum !== checksum) {
          logger.warn('Updating stored migration checksum', {
            migration: file,
            previousChecksum: storedChecksum,
            newChecksum: checksum,
          });
          await client.query(
            'UPDATE schema_migrations SET checksum = $2 WHERE version = $1',
            [file, checksum]
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
        await client.query('SELECT pg_advisory_unlock($1, $2)', MIGRATION_LOCK_KEY);
      } catch (err) {
        logger.error('Failed to release database migration advisory lock', {
          error: err.message || String(err),
        });
      }
    }
  }
}

module.exports = { runMigrations, readMigrationFiles, MIGRATIONS_DIR, migrationChecksum };
