const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/server/app');
const config = require('../src/config/env');
const { signToken } = require('../src/auth/jwt');
const userRepo = require('../src/users/user.repository');
const walletRepo = require('../src/wallet/wallet.repository');
const { query } = require('../src/database/db');
const { getAdminToken } = require('./helpers/adminAuth');

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

test('Task 7 — Admin Deposit Confirmation & Rejection Unit Test', async (t) => {
  const server = http.createServer(app);
  let testUserId = 'usr_admin_dep_test_1';

  try {
    await query('DELETE FROM deposits WHERE utr IN (\'998877665511\', \'998877665522\');');
  } catch (_) {}

  try {
    const u1 = await userRepo.findOrCreateUserByPhone('+919876543217');
    testUserId = u1.user ? u1.user.id : u1.id;
  } catch (_) {}

  const userToken = signToken({ userId: testUserId, phone: '+919876543217' });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  // Provision a real admin (bcrypt hash) and log in to obtain an admin JWT (sec 55).
  const { token: adminToken } = await getAdminToken(port, {
    username: 'test_finance_admin',
    password: 'TestFinancePass!234',
    role: 'FINANCE_ADMIN',
  });

  try {
    // 1. Reject Admin API calls without a valid admin session (401 Unauthorized)
    const unauthRes = await makeRequest({
      hostname: 'localhost',
      port,
      path: '/api/admin/deposits/pending',
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.strictEqual(unauthRes.statusCode, 401);

    // 2. Fetch pending deposits as Admin -> 200 OK
    const pendingRes = await makeRequest({
      hostname: 'localhost',
      port,
      path: '/api/admin/deposits/pending',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assert.strictEqual(pendingRes.statusCode, 200);
    assert.strictEqual(pendingRes.body.status, 'success');
    assert.ok(Array.isArray(pendingRes.body.data));

    // 3. User creates a deposit order (₹500) and submits UTR ('998877665511')
    const createRes = await makeRequest(
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
    assert.strictEqual(createRes.statusCode, 201);
    const deposit1Id = createRes.body.data.depositId;

    const utrRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/deposits/${deposit1Id}/utr`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
      },
      JSON.stringify({ utr: '998877665511' })
    );
    assert.strictEqual(utrRes.statusCode, 200);

    // Check user balance before admin confirm -> MUST be 0
    const preWallet = await walletRepo.getWalletByUserId(testUserId);
    const preBalance = preWallet.availableBalance;

    // 4. Admin confirms deposit order
    const confirmRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/admin/deposits/${deposit1Id}/confirm`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      JSON.stringify({ adminNote: 'Verified with HDFC Bank statement' })
    );
    assert.strictEqual(confirmRes.statusCode, 200);
    assert.strictEqual(confirmRes.body.status, 'success');
    assert.strictEqual(confirmRes.body.data.status, 'CONFIRMED');

    // 5. Verify wallet balance increased by exact amount (₹500)
    const postWallet = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(postWallet.availableBalance, preBalance + 500);

    // 6. Idempotency Check: Re-confirming an already CONFIRMED deposit returns 400 & NO double credit
    const reconfirmRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/admin/deposits/${deposit1Id}/confirm`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      JSON.stringify({ adminNote: 'Attempting double credit' })
    );
    assert.strictEqual(reconfirmRes.statusCode, 400);
    assert.match(reconfirmRes.body.message, /already CONFIRMED/i);

    const recheckWallet = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(recheckWallet.availableBalance, preBalance + 500, 'Wallet balance MUST NOT be double-credited');

    // 7. User creates a second deposit order (₹1000) for Rejection Test
    const create2Res = await makeRequest(
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
      JSON.stringify({ amount: 1000, paymentMethod: 'UPI' })
    );
    assert.strictEqual(create2Res.statusCode, 201);
    const deposit2Id = create2Res.body.data.depositId;

    await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/deposits/${deposit2Id}/utr`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
      },
      JSON.stringify({ utr: '998877665522' })
    );

    // 8. Admin rejects second deposit order
    const rejectRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/admin/deposits/${deposit2Id}/reject`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      JSON.stringify({ adminNote: 'UTR invalid on bank portal' })
    );
    assert.strictEqual(rejectRes.statusCode, 200);
    assert.strictEqual(rejectRes.body.status, 'success');
    assert.strictEqual(rejectRes.body.data.status, 'REJECTED');

    // Verify wallet balance remains unchanged after rejection
    const finalWallet = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(finalWallet.availableBalance, preBalance + 500, 'Rejected deposit must NOT credit wallet balance');

  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
