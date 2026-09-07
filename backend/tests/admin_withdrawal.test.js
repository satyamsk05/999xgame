const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/server/app');
const config = require('../src/config/env');
const { signToken } = require('../src/auth/jwt');
const userRepo = require('../src/users/user.repository');
const walletRepo = require('../src/wallet/wallet.repository');
const financialService = require('../src/services/financial.service');
const { query } = require('../src/database/db');

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

test('Task 11 — Admin Withdrawal Confirmation & Rejection Unit Test', async (t) => {
  const server = http.createServer(app);
  let testUserId = 'usr_admin_wdr_test_1';
  const adminSecret = config.adminSecret;

  try {
    const u1 = await userRepo.findOrCreateUserByPhone('+919876543215');
    testUserId = u1.user ? u1.user.id : u1.id;
    await query('DELETE FROM withdrawals WHERE user_id = $1;', [testUserId]);
    await query('UPDATE wallets SET available_balance = 0, reserved_balance = 0, deposit_balance = 0, winnings_balance = 0 WHERE user_id = $1;', [testUserId]);
  } catch (_) {}

  // Seed user wallet with ₹500 available balance
  await financialService.creditWallet(testUserId, 50000, {
    type: 'DEPOSIT',
    referenceType: 'TEST_SEED',
    referenceId: `seed_wdr_${Date.now()}`,
  });

  const userToken = signToken({ userId: testUserId, phone: '+919876543215' });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. Reject Admin API calls without Admin Secret Header (403 Forbidden)
    const unauthRes = await makeRequest({
      hostname: 'localhost',
      port,
      path: '/api/admin/withdrawals/pending',
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.strictEqual(unauthRes.statusCode, 403);

    // 2. Fetch pending withdrawals as Admin -> 200 OK
    const pendingRes = await makeRequest({
      hostname: 'localhost',
      port,
      path: '/api/admin/withdrawals/pending',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': adminSecret,
      },
    });
    assert.strictEqual(pendingRes.statusCode, 200);
    assert.strictEqual(pendingRes.body.status, 'success');
    assert.ok(Array.isArray(pendingRes.body.data));

    // 3. User submits a valid withdrawal request for ₹200
    const initialWallet = await walletRepo.getWalletByUserId(testUserId);
    const startAvail = initialWallet.availableBalance;

    const wdr1Res = await makeRequest(
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
      JSON.stringify({ amount: 200, upiId: 'adminwdr1@okicici' })
    );
    assert.strictEqual(wdr1Res.statusCode, 201);
    const withdrawal1Id = wdr1Res.body.data.withdrawalId;

    // Verify balance after reservation: available - 200, reserved + 200
    const reservedWallet = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(reservedWallet.availableBalance, startAvail - 200);
    assert.strictEqual(reservedWallet.reservedBalance, 200);

    // 4. Admin confirms withdrawal payout (₹200)
    const confirmRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/admin/withdrawals/${withdrawal1Id}/confirm`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
      },
      JSON.stringify({ adminNote: 'Payout sent via HDFC Netbanking' })
    );
    assert.strictEqual(confirmRes.statusCode, 200);
    assert.strictEqual(confirmRes.body.status, 'success');
    assert.strictEqual(confirmRes.body.data.status, 'SUCCESS');

    // Verify wallet after confirmation: reserved balance cleared (0), available remains (startAvail - 200)
    const postConfirmWallet = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(postConfirmWallet.availableBalance, startAvail - 200);
    assert.strictEqual(postConfirmWallet.reservedBalance, 0);

    // 5. Idempotency check: Re-confirming an already SUCCESS withdrawal returns 400
    const reconfirmRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/admin/withdrawals/${withdrawal1Id}/confirm`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
      },
      JSON.stringify({ adminNote: 'Double confirm attempt' })
    );
    assert.strictEqual(reconfirmRes.statusCode, 400);

    // 6. User submits a second withdrawal request for ₹100
    const wdr2Res = await makeRequest(
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
      JSON.stringify({ amount: 100, upiId: 'adminwdr2@okaxis' })
    );
    assert.strictEqual(wdr2Res.statusCode, 201);
    const withdrawal2Id = wdr2Res.body.data.withdrawalId;

    // Verify reservation for second request
    const reserved2Wallet = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(reserved2Wallet.availableBalance, startAvail - 300);
    assert.strictEqual(reserved2Wallet.reservedBalance, 100);

    // 7. Admin rejects second withdrawal request (₹100)
    const rejectRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/admin/withdrawals/${withdrawal2Id}/reject`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
      },
      JSON.stringify({ adminNote: 'UPI ID inactive on NPCI switch' })
    );
    assert.strictEqual(rejectRes.statusCode, 200);
    assert.strictEqual(rejectRes.body.status, 'success');
    assert.strictEqual(rejectRes.body.data.status, 'REJECTED');

    // Verify reserved funds returned back to available balance
    const postRejectWallet = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(postRejectWallet.availableBalance, startAvail - 200);
    assert.strictEqual(postRejectWallet.reservedBalance, 0);

    // 8. Idempotency check: Re-rejecting or confirming a REJECTED withdrawal returns 400
    const rerejectRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/admin/withdrawals/${withdrawal2Id}/reject`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
      },
      JSON.stringify({ adminNote: 'Double reject attempt' })
    );
    assert.strictEqual(rerejectRes.statusCode, 400);

  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
