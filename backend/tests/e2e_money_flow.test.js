const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/server/app');
const config = require('../src/config/env');
const { signToken } = require('../src/auth/jwt');
const userRepo = require('../src/users/user.repository');
const walletRepo = require('../src/wallet/wallet.repository');
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

test('Master Financial System — Complete End-to-End Money Flow Verification', async (t) => {
  const server = http.createServer(app);
  let testUserId = 'usr_e2e_master_user';
  const adminSecret = config.adminSecret;
  const testPhone = '+919999888877';

  // Cleanup past test state
  try {
    const u1 = await userRepo.findOrCreateUserByPhone(testPhone);
    testUserId = u1.user ? u1.user.id : u1.id;
    await query('DELETE FROM deposits WHERE user_id = $1;', [testUserId]);
    await query('DELETE FROM withdrawals WHERE user_id = $1;', [testUserId]);
    await query('UPDATE wallets SET available_balance = 0, reserved_balance = 0, deposit_balance = 0, winnings_balance = 0 WHERE user_id = $1;', [testUserId]);
  } catch (_) {}

  const userToken = signToken({ userId: testUserId, phone: testPhone });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // ------------------------------------------------------------------------
    // PHASE 1: Deposit Flow (User Create -> UTR Submit -> Admin Confirm -> Credit)
    // ------------------------------------------------------------------------
    
    // 1. Initial wallet state must be 0
    const w0 = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(w0.availableBalance, 0);
    assert.strictEqual(w0.reservedBalance, 0);

    // 2. User creates a deposit order for ₹500
    const depRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/deposits',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
      },
      JSON.stringify({ amount: 500, paymentMethod: 'UPI' })
    );
    assert.strictEqual(depRes.statusCode, 201);
    const depositId = depRes.body.data.depositId;

    // Zero auto-credit check
    const w1 = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(w1.availableBalance, 0, 'Deposit order creation must NEVER auto-credit wallet');

    // 3. User submits valid 12-digit UTR ('889900112233')
    const utrRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/deposits/${depositId}/utr`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
      },
      JSON.stringify({ utr: '889900112233' })
    );
    assert.strictEqual(utrRes.statusCode, 200);
    assert.strictEqual(utrRes.body.data.status, 'UTR_SUBMITTED');

    // Zero auto-credit check after UTR submission
    const w2 = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(w2.availableBalance, 0, 'UTR submission must NEVER auto-credit wallet');

    // 4. Admin confirms deposit order
    const adminConfirmDepRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/admin/deposits/${depositId}/confirm`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
      },
      JSON.stringify({ adminNote: 'E2E Bank statement confirmed' })
    );
    assert.strictEqual(adminConfirmDepRes.statusCode, 200);
    assert.strictEqual(adminConfirmDepRes.body.data.status, 'CONFIRMED');

    // Wallet MUST be credited with exact ₹500
    const w3 = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(w3.availableBalance, 500);

    // ------------------------------------------------------------------------
    // PHASE 2: Withdrawal Reservation & Admin Confirmation (Success Payout)
    // ------------------------------------------------------------------------

    // 5. User requests a withdrawal of ₹200
    const wdrRes = await makeRequest(
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
      JSON.stringify({ amount: 200, upiId: 'e2euser@okicici' })
    );
    assert.strictEqual(wdrRes.statusCode, 201);
    const withdrawalId = wdrRes.body.data.withdrawalId;

    // Wallet balance MUST be atomically reserved: Available = 300, Reserved = 200
    const w4 = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(w4.availableBalance, 300);
    assert.strictEqual(w4.reservedBalance, 200);

    // 6. Admin confirms payout completion
    const adminConfirmWdrRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/admin/withdrawals/${withdrawalId}/confirm`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
      },
      JSON.stringify({ adminNote: 'Payout sent via NetBanking' })
    );
    assert.strictEqual(adminConfirmWdrRes.statusCode, 200);
    assert.strictEqual(adminConfirmWdrRes.body.data.status, 'SUCCESS');

    // Reserved balance MUST be finalized (0 reserved), available balance remains 300
    const w5 = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(w5.availableBalance, 300);
    assert.strictEqual(w5.reservedBalance, 0);

    // ------------------------------------------------------------------------
    // PHASE 3: Withdrawal Reservation & Admin Rejection (Refund Payout)
    // ------------------------------------------------------------------------

    // 7. User requests another withdrawal of ₹150
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
      JSON.stringify({ amount: 150, upiId: 'e2euser2@okaxis' })
    );
    assert.strictEqual(wdr2Res.statusCode, 201);
    const withdrawal2Id = wdr2Res.body.data.withdrawalId;

    // Available = 150, Reserved = 150
    const w6 = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(w6.availableBalance, 150);
    assert.strictEqual(w6.reservedBalance, 150);

    // 8. Admin rejects withdrawal payout
    const adminRejectWdrRes = await makeRequest(
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
      JSON.stringify({ adminNote: 'UPI Handle Invalid' })
    );
    assert.strictEqual(adminRejectWdrRes.statusCode, 200);
    assert.strictEqual(adminRejectWdrRes.body.data.status, 'REJECTED');

    // Reserved funds MUST be restored to available balance: Available = 300, Reserved = 0
    const w7 = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(w7.availableBalance, 300);
    assert.strictEqual(w7.reservedBalance, 0);

  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
