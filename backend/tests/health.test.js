const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/server/app');

const { signToken } = require('../src/auth/jwt');
const userRepo = require('../src/users/user.repository');

test('Health, Readiness & Core API Endpoints Unit Test', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  try {
    // Seed a REAL user. With the hardened auth middleware an unknown subject now returns
    // 401 (sec 10), so the authenticated /api/wallet call must use a persisted user.
    const { user } = await userRepo.findOrCreateUserByPhone('+919999999999');
    const testToken = signToken({ userId: user.id, phone: user.phone });

    // Test /health
    const healthRes = await fetch(`${base}/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthBody = await healthRes.json();
    assert.strictEqual(healthBody.status, 'ok');
    assert.strictEqual(healthBody.service, 'ingames-backend');

    // Test /api/games
    const gamesRes = await fetch(`${base}/api/games`);
    assert.strictEqual(gamesRes.status, 200);
    const gamesBody = await gamesRes.json();
    assert.strictEqual(gamesBody.status, 'success');
    assert.strictEqual(Array.isArray(gamesBody.data), true);
    assert.strictEqual(gamesBody.data.some((g) => g.id === 'seven_up_down'), true);

    // Test /api/wallet with a real user's Bearer token
    const walletRes = await fetch(`${base}/api/wallet`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    assert.strictEqual(walletRes.status, 200);
    const walletBody = await walletRes.json();
    assert.strictEqual(walletBody.status, 'success');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
