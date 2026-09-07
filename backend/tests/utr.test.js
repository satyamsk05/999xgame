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

const { query } = require('../src/database/db');

test('Task 6 — Submit UTR Endpoint Unit Test (POST /api/deposits/:depositId/utr)', async (t) => {
  try {
    await query('DELETE FROM deposits WHERE utr = \'998877665544\';');
  } catch (_) {}

  const server = http.createServer(app);
  let testUserId = 'usr_utr_test_1';
  let testUserId2 = 'usr_utr_test_2';

  try {
    const u1 = await userRepo.findOrCreateUserByPhone('+919876543219');
    testUserId = u1.user ? u1.user.id : u1.id;
  } catch (_) {}

  try {
    const u2 = await userRepo.findOrCreateUserByPhone('+919876543218');
    testUserId2 = u2.user ? u2.user.id : u2.id;
  } catch (_) {}

  const token1 = signToken({ userId: testUserId, phone: '+919876543219' });
  const token2 = signToken({ userId: testUserId2, phone: '+919876543218' });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. Reject UTR submission without authentication -> 401 Unauthorized
    const unauthRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/deposits/DEP_12345/utr',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      JSON.stringify({ utr: '123456789012' })
    );
    assert.strictEqual(unauthRes.statusCode, 401);

    // 2. Reject non-12-digit UTR format -> 400 Bad Request
    const invalidFormatRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/deposits/DEP_12345/utr',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token1}`,
        },
      },
      JSON.stringify({ utr: '12345' })
    );
    assert.strictEqual(invalidFormatRes.statusCode, 400);
    assert.match(invalidFormatRes.body.message, /12 numeric digits/i);

    // 3. Reject non-existent deposit ID -> 404 Not Found
    const notFoundRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/deposits/DEP_NONEXISTENT/utr',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token1}`,
        },
      },
      JSON.stringify({ utr: '987654321098' })
    );
    assert.strictEqual(notFoundRes.statusCode, 404);

    // 4. Create PENDING deposit order first
    const createRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/deposits',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token1}`,
        },
      },
      JSON.stringify({ amount: 500, paymentMethod: 'UPI' })
    );
    assert.strictEqual(createRes.statusCode, 201);
    assert.strictEqual(createRes.body.data.status, 'PENDING');
    const createdDepositId = createRes.body.data.depositId;

    // 5. Submit valid 12-digit UTR -> 200 OK & status transitions to UTR_SUBMITTED
    const validUtr = '998877665544';
    const submitRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/deposits/${createdDepositId}/utr`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token1}`,
        },
      },
      JSON.stringify({ utr: validUtr })
    );
    assert.strictEqual(submitRes.statusCode, 200);
    assert.strictEqual(submitRes.body.status, 'success');
    assert.strictEqual(submitRes.body.data.status, 'UTR_SUBMITTED');
    assert.strictEqual(submitRes.body.data.utr, validUtr);

    // 6. Financial Integrity: Wallet balance MUST remain 0 paise after UTR submission
    const wallet = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(wallet.availableBalance, 0, 'Wallet must NOT be auto-credited on UTR submission');

    // 7. Reject re-submitting UTR on an already UTR_SUBMITTED deposit -> 400 Bad Request
    const resubmitRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/deposits/${createdDepositId}/utr`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token1}`,
        },
      },
      JSON.stringify({ utr: '112233445566' })
    );
    assert.strictEqual(resubmitRes.statusCode, 400);
    assert.match(resubmitRes.body.message, /status UTR_SUBMITTED/i);

    // 8. Reject duplicate UTR reuse across deposits -> 409 Conflict
    const createRes2 = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: '/api/deposits',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token2}`,
        },
      },
      JSON.stringify({ amount: 1000, paymentMethod: 'UPI' })
    );
    assert.strictEqual(createRes2.statusCode, 201);
    const dep2Id = createRes2.body.data.depositId;

    const dupUtrRes = await makeRequest(
      {
        hostname: 'localhost',
        port,
        path: `/api/deposits/${dep2Id}/utr`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token2}`,
        },
      },
      JSON.stringify({ utr: validUtr })
    );
    assert.strictEqual(dupUtrRes.statusCode, 409);
    assert.match(dupUtrRes.body.message, /already been submitted/i);

  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
