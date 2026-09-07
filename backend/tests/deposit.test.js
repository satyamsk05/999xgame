const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/server/app');
const { signToken } = require('../src/auth/jwt');
const userRepo = require('../src/users/user.repository');
const walletRepo = require('../src/wallet/wallet.repository');

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

test('Task 4 — Deposit Order Creation Unit Test (POST /api/deposits)', async (t) => {
  const server = http.createServer(app);
  let testUserId = 'usr_9876543210';
  
  try {
    const { user } = await userRepo.findOrCreateUserByPhone('+919876543210');
    testUserId = user.id;
  } catch (_) {}

  const testToken = signToken({ userId: testUserId, phone: '+919876543210' });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. Check current wallet balance before deposit order
    const initialWallet = await walletRepo.getWalletByUserId(testUserId);
    const initialTotal = initialWallet.totalBalance;

    // 2. Test POST /api/deposits without Auth Token -> 401 Unauthorized
    const unauthRes = await makeRequest({
      hostname: 'localhost',
      port,
      path: '/api/deposits',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.strictEqual(unauthRes.statusCode, 401);

    // 3. Test POST /api/deposits with invalid amount (₹0) -> 400 Bad Request
    const invalidRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/deposits',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
        },
      },
      JSON.stringify({ amount: 0 })
    );
    assert.strictEqual(invalidRes.statusCode, 400);

    // 4. Test POST /api/deposits with valid amount (₹200) -> 201 Created
    const validRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/deposits',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
        },
      },
      JSON.stringify({ amount: 200, paymentMethod: 'UPI' })
    );

    assert.strictEqual(validRes.statusCode, 201);
    const body = validRes.body;
    assert.strictEqual(body.status, 'success');
    assert.ok(body.data.depositId.startsWith('DEP_'));
    assert.strictEqual(body.data.amountRupees, 200);
    assert.strictEqual(body.data.amountPaise, 20000);
    assert.strictEqual(body.data.currency, 'INR');
    assert.strictEqual(body.data.status, 'PENDING'); // Strictly PENDING
    assert.ok(body.data.upiId.length > 0);
    assert.ok(body.data.qrData.includes('upi://pay'));

    // 5. Verify GET /api/deposits/:depositId
    const fetchRes = await makeRequest({
      hostname: 'localhost',
      port,
      path: `/api/deposits/${body.data.depositId}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${testToken}`,
      },
    });
    assert.strictEqual(fetchRes.statusCode, 200);
    assert.strictEqual(fetchRes.body.data.depositId, body.data.depositId);
    assert.strictEqual(fetchRes.body.data.status, 'PENDING');

    // 6. Verify wallet balance remains unchanged (NO auto credit!)
    const afterWallet = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(afterWallet.totalBalance, initialTotal);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
