const test = require('node:test');
const assert = require('node:assert');
const financialService = require('../src/services/financial.service');

// Mock in-memory DB client simulator for testing financial service atomic logic without requiring live PG connection
function createMockClient() {
  const state = {
    wallets: {},
    ledger: {},
    inTransaction: false,
  };

  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = sql.trim().replace(/\s+/g, ' ');

      if (normalizedSql === 'BEGIN') {
        state.inTransaction = true;
        return { rowCount: 0, rows: [] };
      }
      if (normalizedSql === 'COMMIT') {
        state.inTransaction = false;
        return { rowCount: 0, rows: [] };
      }
      if (normalizedSql === 'ROLLBACK') {
        state.inTransaction = false;
        return { rowCount: 0, rows: [] };
      }

      // Check Idempotency
      if (normalizedSql.includes('SELECT * FROM wallet_ledger WHERE idempotency_key = $1')) {
        const key = params[0];
        const row = state.ledger[key];
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }

      // Lock/Select Wallet
      if (normalizedSql.includes('SELECT * FROM wallets WHERE user_id = $1')) {
        const userId = params[0];
        const wallet = state.wallets[userId];
        return { rowCount: wallet ? 1 : 0, rows: wallet ? [wallet] : [] };
      }

      // Insert Wallet
      if (normalizedSql.includes('INSERT INTO wallets')) {
        const id = params[0];
        const userId = params[1];
        const wallet = {
          id,
          user_id: userId,
          available_balance: 0,
          reserved_balance: 0,
          version: 1,
        };
        state.wallets[userId] = wallet;
        return { rowCount: 1, rows: [wallet] };
      }

      // Update Wallet (available_balance AND reserved_balance)
      if (normalizedSql.includes('UPDATE wallets SET available_balance = $2, reserved_balance = $3')) {
        const walletId = params[0];
        const availableBalance = params[1];
        const reservedBalance = params[2];

        const userId = Object.keys(state.wallets).find(k => state.wallets[k].id === walletId);
        if (!userId) throw new Error('Wallet not found for update');

        state.wallets[userId].available_balance = availableBalance;
        state.wallets[userId].reserved_balance = reservedBalance;
        state.wallets[userId].version += 1;
        return { rowCount: 1, rows: [state.wallets[userId]] };
      }

      // Update Wallet (available_balance only)
      if (normalizedSql.includes('UPDATE wallets SET available_balance = $2')) {
        const walletId = params[0];
        const availableBalance = params[1];

        const userId = Object.keys(state.wallets).find(k => state.wallets[k].id === walletId);
        if (!userId) throw new Error('Wallet not found for update');

        state.wallets[userId].available_balance = availableBalance;
        state.wallets[userId].version += 1;
        return { rowCount: 1, rows: [state.wallets[userId]] };
      }

      // Update Wallet (reserved_balance only)
      if (normalizedSql.includes('UPDATE wallets SET reserved_balance = $2')) {
        const walletId = params[0];
        const reservedBalance = params[1];

        const userId = Object.keys(state.wallets).find(k => state.wallets[k].id === walletId);
        if (!userId) throw new Error('Wallet not found for update');

        state.wallets[userId].reserved_balance = reservedBalance;
        state.wallets[userId].version += 1;
        return { rowCount: 1, rows: [state.wallets[userId]] };
      }

      // Insert Ledger
      if (normalizedSql.includes('INSERT INTO wallet_ledger')) {
        const [id, userId, walletId, type, amount, refType, refId, beforeBal, afterBal, idempotencyKey] = params;
        const direction = normalizedSql.includes("'CREDIT'") ? 'CREDIT' : 'DEBIT';
        const entry = {
          id,
          user_id: userId,
          wallet_id: walletId,
          type,
          amount,
          direction,
          reference_type: refType,
          reference_id: refId,
          before_balance: beforeBal,
          after_balance: afterBal,
          status: 'COMPLETED',
          idempotency_key: idempotencyKey,
        };
        if (idempotencyKey) {
          state.ledger[idempotencyKey] = entry;
        }
        return { rowCount: 1, rows: [entry] };
      }

      return { rowCount: 0, rows: [] };
    },
  };
}

test('Financial Service Atomic Credit & Debit Operations', async () => {
  const client = createMockClient();
  const userId = 'usr_fin_test_1';

  // 1. Credit ₹50.00 (5000 paise)
  const creditRes = await financialService.creditWallet(client, 5000, {
    userId,
    type: 'DEPOSIT',
    referenceType: 'DEPOSIT',
    referenceId: 'dep_1001',
    idempotencyKey: 'idemp_credit_1001',
  });

  assert.strictEqual(creditRes.wallet.available_balance, 5000);
  assert.strictEqual(creditRes.ledger.amount, 5000);
  assert.strictEqual(creditRes.ledger.direction, 'CREDIT');
  assert.strictEqual(creditRes.ledger.type, 'DEPOSIT');

  // 2. Debit ₹20.00 (2000 paise)
  const debitRes = await financialService.debitWallet(client, 2000, {
    userId,
    type: 'BET_DEBIT',
    referenceType: 'GAME_BET',
    referenceId: 'bet_2001',
    idempotencyKey: 'idemp_debit_2001',
  });

  assert.strictEqual(debitRes.wallet.available_balance, 3000);
  assert.strictEqual(debitRes.ledger.before_balance, 5000);
  assert.strictEqual(debitRes.ledger.after_balance, 3000);

  // 3. Insufficient funds debit should throw Error
  await assert.rejects(
    async () => {
      await financialService.debitWallet(client, 5000, { userId });
    },
    (err) => {
      assert.ok(err.message.includes('Insufficient funds'));
      return true;
    }
  );
});

test('Financial Service Reserve, Finalize, & Release Operations', async () => {
  const client = createMockClient();
  const userId = 'usr_fin_test_2';

  // Setup: Credit ₹100.00 (10000 paise)
  await financialService.creditWallet(client, 10000, { userId });

  // 1. Reserve ₹40.00 (4000 paise) for withdrawal request
  const reserveRes = await financialService.reserveFunds(client, 4000, {
    userId,
    referenceId: 'wdr_3001',
    idempotencyKey: 'idemp_res_3001',
  });

  assert.strictEqual(reserveRes.wallet.available_balance, 6000);
  assert.strictEqual(reserveRes.wallet.reserved_balance, 4000);

  // 2. Finalize ₹40.00 (4000 paise) withdrawal payout
  const finalizeRes = await financialService.finalizeReservedFunds(client, 4000, {
    userId,
    referenceId: 'wdr_3001',
    idempotencyKey: 'idemp_fin_3001',
  });

  assert.strictEqual(finalizeRes.wallet.available_balance, 6000);
  assert.strictEqual(finalizeRes.wallet.reserved_balance, 0);

  // Setup 2: Reserve another ₹30.00 and Release (Rejection)
  await financialService.reserveFunds(client, 3000, { userId, referenceId: 'wdr_3002' });
  assert.strictEqual(client.state.wallets[userId].available_balance, 3000);
  assert.strictEqual(client.state.wallets[userId].reserved_balance, 3000);

  const releaseRes = await financialService.releaseReservedFunds(client, 3000, {
    userId,
    referenceId: 'wdr_3002',
    idempotencyKey: 'idemp_rel_3002',
  });

  assert.strictEqual(releaseRes.wallet.available_balance, 6000);
  assert.strictEqual(releaseRes.wallet.reserved_balance, 0);
});

test('Financial Service Idempotency & Duplicate Request Protection', async () => {
  const client = createMockClient();
  const userId = 'usr_fin_test_3';

  // First credit
  const res1 = await financialService.creditWallet(client, 1000, {
    userId,
    idempotencyKey: 'key_unique_100',
  });
  assert.strictEqual(res1.wallet.available_balance, 1000);
  assert.strictEqual(res1.duplicate, undefined);

  // Duplicate credit with same idempotencyKey
  const res2 = await financialService.creditWallet(client, 1000, {
    userId,
    idempotencyKey: 'key_unique_100',
  });

  assert.strictEqual(res2.duplicate, true);
  // Available balance remains ₹10.00 (1000 paise), not credited twice!
  assert.strictEqual(client.state.wallets[userId].available_balance, 1000);
});
