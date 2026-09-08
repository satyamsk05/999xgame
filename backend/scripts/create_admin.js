#!/usr/bin/env node
/**
 * Secure admin provisioning (sec 7).
 *
 * There is NO hardcoded/config admin login path. Operators must provision at least one
 * admin with this script (or an equivalent audited process). Passwords are bcrypt-hashed
 * before storage and are never printed.
 *
 * Usage:
 *   node scripts/create_admin.js --username=finance_ops --password='Str0ng!Pass' --role=FINANCE_ADMIN
 * Environment fallbacks: ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_ROLE.
 *
 * Roles: SUPER_ADMIN | FINANCE_ADMIN | GAME_ADMIN | SUPPORT_ADMIN | AUDITOR
 *
 * Fails closed: if PostgreSQL is unavailable the script exits non-zero and creates nothing.
 */
const adminRepo = require('../src/admin/admin.repository');
const { initDb } = require('../src/database/db');

const VALID_ROLES = ['SUPER_ADMIN', 'FINANCE_ADMIN', 'GAME_ADMIN', 'SUPPORT_ADMIN', 'AUDITOR'];

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const username = args.username || process.env.ADMIN_USERNAME;
  const password = args.password || process.env.ADMIN_PASSWORD;
  const role = args.role || process.env.ADMIN_ROLE || 'SUPPORT_ADMIN';

  if (!username || !password) {
    console.error('Usage: node scripts/create_admin.js --username=<u> --password=<p> [--role=<ROLE>]');
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }
  if (String(password).length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const ok = await initDb({ force: true });
  if (!ok) {
    console.error('FATAL: Database unavailable. Cannot provision admin (fail closed).');
    process.exit(2);
  }

  try {
    const admin = await adminRepo.createAdmin({ username, password, role, isActive: true });
    console.log(
      `Admin provisioned: id=${admin.id} username=${admin.username} role=${admin.role} active=${admin.is_active}`
    );
    process.exit(0);
  } catch (err) {
    console.error('Failed to provision admin:', err.message);
    process.exit(1);
  }
})();
