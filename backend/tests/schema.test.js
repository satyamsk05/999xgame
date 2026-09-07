const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('PostgreSQL Money Flow Schema Definition Test', () => {
  const schemaPath = path.join(__dirname, '../src/database/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // Verify wallets table schema
  assert.ok(sql.includes('available_balance BIGINT NOT NULL DEFAULT 0 CHECK (available_balance >= 0)'));
  assert.ok(sql.includes('reserved_balance BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance >= 0)'));
  assert.ok(sql.includes('version BIGINT NOT NULL DEFAULT 1'));

  // Verify wallet_ledger schema
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS wallet_ledger'));
  assert.ok(sql.includes("direction VARCHAR(10) NOT NULL DEFAULT 'CREDIT' CHECK (direction IN ('CREDIT', 'DEBIT'))"));
  assert.ok(sql.includes('reference_type VARCHAR(50) NOT NULL DEFAULT'));

  // Verify deposits table schema & constraints
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS deposits'));
  assert.ok(sql.includes('deposit_id VARCHAR(64) UNIQUE NOT NULL'));
  assert.ok(sql.includes('utr VARCHAR(100) UNIQUE'));
  assert.ok(sql.includes("status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UTR_SUBMITTED', 'CONFIRMED', 'REJECTED', 'EXPIRED'))"));
  assert.ok(sql.includes('submitted_at TIMESTAMP WITH TIME ZONE'));
  assert.ok(sql.includes('confirmed_at TIMESTAMP WITH TIME ZONE'));

  // Verify withdrawals table schema & constraints
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS withdrawals'));
  assert.ok(sql.includes('withdrawal_id VARCHAR(64) UNIQUE NOT NULL'));
  assert.ok(sql.includes("status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'REJECTED'))"));
  assert.ok(sql.includes('payout_address_or_upi VARCHAR(256) NOT NULL'));
  assert.ok(sql.includes('requested_at TIMESTAMP WITH TIME ZONE'));
  assert.ok(sql.includes('processing_at TIMESTAMP WITH TIME ZONE'));

  // Verify indexes
  assert.ok(sql.includes('idx_deposits_utr'));
  assert.ok(sql.includes('idx_deposits_status'));
  assert.ok(sql.includes('idx_withdrawals_status'));
});
