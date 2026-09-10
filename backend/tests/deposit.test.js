const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const http = require('http');
process.env.PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'test_payment_webhook_secret_32_chars_minimum';
const app = require('../src/server/app');
const { signToken } = require('../src/auth/jwt');
const userRepo = require('../src/users/user.repository');
const walletRepo = require('../src/wallet/wallet.repository');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data ? JSON.parse(data) : {} }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function webhookHeaders(body, eventId, signatureSecret = process.env.PAYMENT_WEBHOOK_SECRET) {
  const raw = Buffer.from(JSON.stringify(body));
  const signature = crypto.createHmac('sha256', signatureSecret).update(raw).digest('hex');
  return { 'Content-Type': 'application/json', 'Content-Length': raw.length, 'x-payment-signature': `sha256=${signature}`, 'x-payment-event-id': eventId };
}

test('Task 4 — Deposit Order Creation Unit Test (POST /api/deposits)', async () => {
  const server = http.createServer(app);
  let testUserId = 'usr_9876543210';
  try { const { user } = await userRepo.findOrCreateUserByPhone('+919876543210'); testUserId = user.id; } catch (_) {}
  const testToken = signToken({ userId: testUserId, phone: '+919876543210' });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    const initialWallet = await walletRepo.getWalletByUserId(testUserId);
    const initialTotal = initialWallet.totalBalance;
    const unauthRes = await makeRequest({ hostname: 'localhost', port, path: '/api/deposits', method: 'POST', headers: { 'Content-Type': 'application/json' } });
    assert.strictEqual(unauthRes.statusCode, 401);
    const invalidRes = await makeRequest({ hostname: 'localhost', port, path: '/api/deposits', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${testToken}` } }, JSON.stringify({ amount: 0 }));
    assert.strictEqual(invalidRes.statusCode, 400);
    const validRes = await makeRequest({ hostname: 'localhost', port, path: '/api/deposits', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${testToken}` } }, JSON.stringify({ amount: 200, paymentMethod: 'UPI' }));
    assert.strictEqual(validRes.statusCode, 201);
    const body = validRes.body;
    assert.strictEqual(body.status, 'success');
    assert.ok(body.data.depositId.startsWith('DEP_'));
    assert.strictEqual(body.data.amountRupees, 200);
    assert.strictEqual(body.data.amountPaise, 20000);
    assert.strictEqual(body.data.currency, 'INR');
    assert.strictEqual(body.data.status, 'PENDING');
    assert.ok(body.data.upiId.length > 0);
    assert.ok(body.data.qrData.includes('upi://pay'));
    const fetchRes = await makeRequest({ hostname: 'localhost', port, path: `/api/deposits/${body.data.depositId}`, method: 'GET', headers: { Authorization: `Bearer ${testToken}` } });
    assert.strictEqual(fetchRes.statusCode, 200);
    assert.strictEqual(fetchRes.body.data.depositId, body.data.depositId);
    assert.strictEqual(fetchRes.body.data.status, 'PENDING');
    const afterWallet = await walletRepo.getWalletByUserId(testUserId);
    assert.strictEqual(afterWallet.totalBalance, initialTotal);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('Payment webhook requires valid HMAC signature and atomically credits once', async () => {
  const server = http.createServer(app);
  const phone = '+919876543211';
  const { user } = await userRepo.findOrCreateUserByPhone(phone);
  const token = signToken({ userId: user.id, phone });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    const create = await makeRequest({ hostname: 'localhost', port, path: '/api/deposits', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }, JSON.stringify({ amount: 250, paymentMethod: 'UPI' }));
    assert.strictEqual(create.statusCode, 201);
    const depositId = create.body.data.depositId;
    const event = { provider: 'test-provider', eventId: 'evt-test-atomic-001', depositId, status: 'SUCCESS', amountPaise: 25000, currency: 'INR', utr: '123456789012' };
    const payload = JSON.stringify(event);
    const invalid = await makeRequest({ hostname: 'localhost', port, path: '/api/deposits/webhook', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-payment-event-id': event.eventId, 'x-payment-signature': 'sha256=' + '0'.repeat(64) } }, payload);
    assert.strictEqual(invalid.statusCode, 401);

    const before = await walletRepo.getWalletByUserId(user.id);
    const first = await makeRequest({ hostname: 'localhost', port, path: '/api/deposits/webhook', method: 'POST', headers: webhookHeaders(event, event.eventId) }, payload);
    assert.strictEqual(first.statusCode, 200);
    assert.strictEqual(first.body.data.status, 'CONFIRMED');
    assert.strictEqual(first.body.duplicate, false);

    const second = await makeRequest({ hostname: 'localhost', port, path: '/api/deposits/webhook', method: 'POST', headers: webhookHeaders(event, event.eventId) }, payload);
    assert.strictEqual(second.statusCode, 200);
    assert.strictEqual(second.body.duplicate, true);

    const after = await walletRepo.getWalletByUserId(user.id);
    assert.strictEqual(after.totalBalance - before.totalBalance, 250);

    const mismatch = { ...event, amountPaise: 25001, eventId: 'evt-test-mismatch-001' };
    const mismatchRes = await makeRequest({ hostname: 'localhost', port, path: '/api/deposits/webhook', method: 'POST', headers: webhookHeaders(mismatch, mismatch.eventId) }, JSON.stringify(mismatch));
    assert.strictEqual(mismatchRes.statusCode, 409);
    assert.strictEqual(mismatchRes.body.code, 'PAYMENT_MISMATCH');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
