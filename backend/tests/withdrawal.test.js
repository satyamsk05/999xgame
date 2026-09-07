const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/server/app');
const { signToken } = require('../src/auth/jwt');
const userRepo = require('../src/users/user.repository');
const walletRepo = require('../src/wallet/wallet.repository');
const financialService = require('../src/services/financial.service');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data ? JSON.parse(data) : {} });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const { query } = require('../src/database/db');

test('Task 9 — Manual Withdrawal Request Unit Test (POST /api/withdrawals)', async (t) => {
  const server = http.createServer(app);
  let testUserId = 'usr_wdr_test_1';

  try {
    const u1 = await userRepo.findOrCreateUserByPhone('+919876543216');
    testUserId = u1.user ? u1.user.id : u1.id;
    await query('DELETE FROM withdrawals WHERE user_id = $1;', [testUserId]);
    await query('UPDATE wallets SET available_balance = 0, reserved_balance = 0, deposit_balance = 0, winnings_balance = 0 WHERE user_id = $1;', [testUserId]);
  } catch (_) {}

  const userToken = signToken({ userId: testUserId, phone: '+919876543216' });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. Reject withdrawal request without authentication -> 401 Unauthorized
    const unauthRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/withdrawals',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      JSON.stringify({ amount: 200, upiId: 'user@okaxis' })
    );
    assert.strictEqual(unauthRes.statusCode, 401);

    // 2. Reject withdrawal amount below minimum (₹100) -> 400 Bad Request
    const belowMinRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/withdrawals',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
      },
      JSON.stringify({ amount: 50, upiId: 'user@okaxis' })
    );
    assert.strictEqual(belowMinRes.statusCode, 400);
    assert.match(belowMinRes.body.message, /between ₹100 and ₹50000/i);

    // 3. Reject invalid UPI ID format -> 400 Bad Request
    const invalidUpiRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/withdrawals',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
      },
      JSON.stringify({ amount: 200, upiId: 'invalid_upi_format' })
    );
    assert.strictEqual(invalidUpiRes.statusCode, 400);
    assert.match(invalidUpiRes.body.message, /Invalid UPI ID format/i);

    // 4. Reject withdrawal request when available balance is insufficient (0 balance) -> 400 Bad Request
    const insufficientRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/withdrawals',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
      },
      JSON.stringify({ amount: 200, upiId: 'user@okaxis' })
    );
    assert.strictEqual(insufficientRes.statusCode, 400);
    assert.match(insufficientRes.body.message, /Insufficient/i);

    // 5. Seed user wallet with ₹500 (50000 paise)
    await financialService.creditWallet(testUserId, 50000, {
      type: 'DEPOSIT',
      referenceType: 'DEPOSIT',
      referenceId: 'DEP_TEST_SEED_WDR',
      idempotencyKey: `idemp_seed_wdr_${Date.now()}`,
    });

    const seededWallet = await walletRepo.getWalletByUserId(testUserId);
    const initialAvail = seededWallet.availableBalance;
    const initialResv = seededWallet.reservedBalance;

    // 6. Submit valid withdrawal request for ₹200 -> 201 Created & Funds Atomically Reserved
    const validWdrRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/withdrawals',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
      },
      JSON.stringify({ amount: 200, upiId: 'testuser@okaxis' })
    );

    assert.strictEqual(validWdrRes.statusCode, 201);
    assert.strictEqual(validWdrRes.body.status, 'success');
    const wdrData = validWdrRes.body.data;
    assert.ok(wdrData.withdrawalId.startsWith('WDR_'));
    assert.strictEqual(wdrData.status, 'PENDING');
    assert.strictEqual(wdrData.amountRupees, 200);
    assert.strictEqual(wdrData.upiId, 'testuser@okaxis');

    // 7. Verify atomic wallet balance updates in PostgreSQL
    const updatedWallet = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(updatedWallet.availableBalance, initialAvail - 200, 'Available balance must decrease by exact withdrawal amount');
    assert.strictEqual(updatedWallet.reservedBalance, initialResv + 200, 'Reserved balance must increase by exact withdrawal amount');
    assert.strictEqual(updatedWallet.totalBalance, initialAvail + initialResv, 'Total wallet balance must remain unchanged during reservation');

    // 8. Query GET /api/withdrawals/:withdrawalId
    const getRes = await makeRequest({
      hostname: 'localhost',
      port,
      path: `/api/withdrawals/${wdrData.withdrawalId}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });

    assert.strictEqual(getRes.statusCode, 200);
    assert.strictEqual(getRes.body.data.withdrawalId, wdrData.withdrawalId);
    assert.strictEqual(getRes.body.data.status, 'PENDING');
    assert.strictEqual(getRes.body.data.amountRupees, 200);
    assert.strictEqual(getRes.body.data.upiId, 'testuser@okaxis');

  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
