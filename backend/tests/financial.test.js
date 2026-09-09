const test = require('node:test');
const assert = require('node:assert');
const financialService = require('../src/services/financial.service');

function createMockClient() {
  const state = { wallets: {}, ledger: {}, inTransaction: false };

  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = sql.trim().replace(/\s+/g, ' ');

      if (normalizedSql === 'BEGIN') { state.inTransaction = true; return { rowCount: 0, rows: [] }; }
      if (normalizedSql === 'COMMIT') { state.inTransaction = false; return { rowCount: 0, rows: [] }; }
      if (normalizedSql === 'ROLLBACK') { state.inTransaction = false; return { rowCount: 0, rows: [] }; }

      if (normalizedSql.includes('FROM wallet_ledger') && normalizedSql.includes('idempotency_key = $1')) {
        const key = params[0];
        const row = state.ledger[key];
        if (normalizedSql.includes('SELECT user_id')) return { rowCount: row ? 1 : 0, rows: row ? [{ user_id: row.user_id }] : [] };
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }

      if (normalizedSql.includes('SELECT * FROM wallets WHERE user_id = $1')) {
        const wallet = state.wallets[params[0]];
        return { rowCount: wallet ? 1 : 0, rows: wallet ? [wallet] : [] };
      }

      if (normalizedSql.includes('INSERT INTO wallets')) {
        const [id, userId] = params;
        const wallet = { id, user_id: userId, available_balance: 0, reserved_balance: 0, deposit_balance: 0, winnings_balance: 0, rewards_balance: 0, locked_balance: 0, version: 1 };
        state.wallets[userId] = wallet;
        return { rowCount: 1, rows: [wallet] };
      }

      if (normalizedSql.includes('UPDATE wallets SET available_balance = $2, deposit_balance = deposit_balance - $3')) {
        const wallet = Object.values(state.wallets).find((w) => w.id === params[0]);
        if (!wallet) throw new Error('Wallet not found for debit update');
        wallet.available_balance = params[1];
        wallet.deposit_balance -= params[2];
        wallet.winnings_balance -= params[3];
        wallet.rewards_balance -= params[4];
        wallet.version += 1;
        return { rowCount: 1, rows: [wallet] };
      }

      if (normalizedSql.includes('UPDATE wallets SET available_balance = $2,') && normalizedSql.includes('version = version + 1')) {
        const wallet = Object.values(state.wallets).find((w) => w.id === params[0]);
        if (!wallet) throw new Error('Wallet not found for balance update');
        wallet.available_balance = params[1];
        const amount = params[2];
        if (normalizedSql.includes('deposit_balance = deposit_balance + $3')) wallet.deposit_balance += amount;
        else if (normalizedSql.includes('winnings_balance = winnings_balance + $3')) wallet.winnings_balance += amount;
        else if (normalizedSql.includes('rewards_balance = rewards_balance + $3')) wallet.rewards_balance += amount;
        else if (normalizedSql.includes('reserved_balance = $3')) wallet.reserved_balance = params[2];
        wallet.version += 1;
        return { rowCount: 1, rows: [wallet] };
      }

      if (normalizedSql.includes('UPDATE wallets SET reserved_balance = $2')) {
        const wallet = Object.values(state.wallets).find((w) => w.id === params[0]);
        if (!wallet) throw new Error('Wallet not found for reserved update');
        wallet.reserved_balance = params[1];
        wallet.version += 1;
        return { rowCount: 1, rows: [wallet] };
      }

      if (normalizedSql.includes('INSERT INTO wallet_ledger')) {
        const [id, userId, walletId, type, amount, refType, refId, beforeBal, afterBal, idempotencyKey] = params;
        const direction = normalizedSql.includes("'CREDIT'") ? 'CREDIT' : 'DEBIT';
        const entry = { id, user_id: userId, wallet_id: walletId, type, amount, direction, reference_type: refType, reference_id: refId, balance_before: beforeBal, balance_after: afterBal, before_balance: beforeBal, after_balance: afterBal, status: 'COMPLETED', idempotency_key: idempotencyKey };
        if (idempotencyKey) state.ledger[idempotencyKey] = entry;
        return { rowCount: 1, rows: [entry] };
      }

      return { rowCount: 0, rows: [] };
    },
  };
}

test('Financial Service Atomic Credit & Debit Operations', async () => {
  const client = createMockClient();
  const userId = 'usr_fin_test_1';
  const creditRes = await financialService.creditWallet(client, 5000, { userId, type: 'DEPOSIT', referenceType: 'DEPOSIT', referenceId: 'dep_1001', idempotencyKey: 'idemp_credit_1001' });
  assert.strictEqual(creditRes.wallet.available_balance, 5000);
  assert.strictEqual(creditRes.wallet.deposit_balance, 5000);
  assert.strictEqual(creditRes.ledger.amount, 5000);
  assert.strictEqual(creditRes.ledger.direction, 'CREDIT');
  assert.strictEqual(creditRes.ledger.type, 'DEPOSIT');

  const debitRes = await financialService.debitWallet(client, 2000, { userId, type: 'BET_DEBIT', referenceType: 'GAME_BET', referenceId: 'bet_2001', idempotencyKey: 'idemp_debit_2001' });
  assert.strictEqual(debitRes.wallet.available_balance, 3000);
  assert.strictEqual(debitRes.wallet.deposit_balance, 3000);
  assert.strictEqual(debitRes.ledger.before_balance, 5000);
  assert.strictEqual(debitRes.ledger.after_balance, 3000);
  await assert.rejects(() => financialService.debitWallet(client, 5000, { userId }), (err) => { assert.ok(err.message.includes('Insufficient funds')); return true; });
});

test('Financial Service Reserve, Finalize, & Release Operations', async () => {
  const client = createMockClient();
  const userId = 'usr_fin_test_2';
  await financialService.creditWallet(client, 10000, { userId });
  const reserveRes = await financialService.reserveFunds(client, 4000, { userId, referenceId: 'wdr_3001', idempotencyKey: 'idemp_res_3001' });
  assert.strictEqual(reserveRes.wallet.available_balance, 6000);
  assert.strictEqual(reserveRes.wallet.reserved_balance, 4000);
  const finalizeRes = await financialService.finalizeReservedFunds(client, 4000, { userId, referenceId: 'wdr_3001', idempotencyKey: 'idemp_fin_3001' });
  assert.strictEqual(finalizeRes.wallet.available_balance, 6000);
  assert.strictEqual(finalizeRes.wallet.reserved_balance, 0);
  await financialService.reserveFunds(client, 3000, { userId, referenceId: 'wdr_3002' });
  assert.strictEqual(client.state.wallets[userId].available_balance, 3000);
  assert.strictEqual(client.state.wallets[userId].reserved_balance, 3000);
  const releaseRes = await financialService.releaseReservedFunds(client, 3000, { userId, referenceId: 'wdr_3002', idempotencyKey: 'idemp_rel_3002' });
  assert.strictEqual(releaseRes.wallet.available_balance, 6000);
  assert.strictEqual(releaseRes.wallet.reserved_balance, 0);
});

test('Financial Service Idempotency & Duplicate Request Protection', async () => {
  const client = createMockClient();
  const userId = 'usr_fin_test_3';
  const res1 = await financialService.creditWallet(client, 1000, { userId, idempotencyKey: 'key_unique_100' });
  assert.strictEqual(res1.wallet.available_balance, 1000);
  assert.strictEqual(res1.wallet.deposit_balance, 1000);
  assert.strictEqual(res1.duplicate, undefined);
  const res2 = await financialService.creditWallet(client, 1000, { userId, idempotencyKey: 'key_unique_100' });
  assert.strictEqual(res2.duplicate, true);
  assert.strictEqual(client.state.wallets[userId].available_balance, 1000);
  assert.strictEqual(client.state.wallets[userId].deposit_balance, 1000);
});
