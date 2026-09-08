const test = require('node:test');
const assert = require('node:assert');
const { query } = require('../src/database/db');
const userRepo = require('../src/users/user.repository');
const financial = require('../src/services/financial.service');
const recon = require('../src/services/reconciliation.service');

// A fresh phone per run guarantees a clean, ledger-backed wallet (no cross-run drift),
// because findOrCreateUserByPhone provisions an all-zero wallet with no ledger rows.
const uniquePhone = () => `+9190${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;

test('reconciliation: a ledger-backed wallet is reported consistent', async () => {
  const { user } = await userRepo.findOrCreateUserByPhone(uniquePhone());

  // creditWallet writes the wallet row AND the wallet_ledger atomically.
  await financial.creditWallet(user.id, 50000, {
    type: 'DEPOSIT',
    referenceType: 'DEPOSIT',
    referenceId: `DEP_RECON_${user.id}`,
    idempotencyKey: `recon_credit_${user.id}`,
  });

  const report = await recon.runReconciliation({ userId: user.id });
  assert.strictEqual(report.ok, true, `expected consistent, got ${JSON.stringify(report.inconsistencies)}`);
  assert.strictEqual(report.counts.balanceMismatch, 0);
  assert.strictEqual(report.counts.reservedMismatch, 0);
  assert.strictEqual(report.totalInconsistencies, 0);
});

test('reconciliation: detects out-of-band balance drift and never auto-fixes', async () => {
  const { user } = await userRepo.findOrCreateUserByPhone(uniquePhone());

  await financial.creditWallet(user.id, 20000, {
    type: 'DEPOSIT',
    referenceType: 'DEPOSIT',
    referenceId: `DEP_RECON_${user.id}`,
    idempotencyKey: `recon_credit_${user.id}`,
  });

  // Simulate corruption: bump available_balance with NO matching ledger entry.
  await query('UPDATE wallets SET available_balance = available_balance + 7000 WHERE user_id = $1', [user.id]);

  const report = await recon.runReconciliation({ userId: user.id });
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.counts.balanceMismatch, 1);

  const mismatch = report.inconsistencies.balanceMismatch[0];
  assert.strictEqual(mismatch.userId, user.id);
  assert.strictEqual(mismatch.ledgerAvailable, 20000);
  assert.strictEqual(mismatch.available, 27000);

  // Reconciliation is READ-ONLY: it must NOT have repaired the wallet.
  const after = await query('SELECT available_balance FROM wallets WHERE user_id = $1', [user.id]);
  assert.strictEqual(parseInt(after.rows[0].available_balance, 10), 27000);

  // Test hygiene: restore the corrupted balance.
  await query('UPDATE wallets SET available_balance = available_balance - 7000 WHERE user_id = $1', [user.id]);
});

test('reconciliation: detects a CONFIRMED deposit with no ledger credit', async () => {
  const { user } = await userRepo.findOrCreateUserByPhone(uniquePhone());

  // A CONFIRMED deposit row with NO corresponding wallet_ledger DEPOSIT entry.
  const depositId = `DEP_RECON_ORPHAN_${Date.now()}`;
  await query(
    `INSERT INTO deposits (id, deposit_id, user_id, amount, currency, status, payment_method, created_at, updated_at)
     VALUES ($1, $2, $3, 15000, 'INR', 'CONFIRMED', 'UPI', NOW(), NOW())`,
    [`dep_recon_${Date.now()}`, depositId, user.id]
  );

  const report = await recon.runReconciliation({ userId: user.id });
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.counts.depositConfirmedWithoutLedger, 1);
  assert.strictEqual(report.inconsistencies.depositConfirmedWithoutLedger[0].depositId, depositId);
});

test('reconciliation: detects a SUCCESS withdrawal with no finalization ledger', async () => {
  const { user } = await userRepo.findOrCreateUserByPhone(uniquePhone());

  const withdrawalId = `WDR_RECON_ORPHAN_${Date.now()}`;
  await query(
    `INSERT INTO withdrawals (id, withdrawal_id, user_id, amount, currency, status, payout_method, payout_address_or_upi, upi_id, created_at, updated_at)
     VALUES ($1, $2, $3, 12000, 'INR', 'SUCCESS', 'UPI', 'recon@bank', 'recon@bank', NOW(), NOW())`,
    [`wdr_recon_${Date.now()}`, withdrawalId, user.id]
  );

  const report = await recon.runReconciliation({ userId: user.id });
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.counts.withdrawalSuccessWithoutFinalization, 1);
  assert.strictEqual(report.inconsistencies.withdrawalSuccessWithoutFinalization[0].withdrawalId, withdrawalId);
});
