const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/server/app');
const logginService = require('../src/auth/loggin.service');

test('Loggin WhatsApp Authentication Flow Unit Test', async (t) => {
  // 1. Loggin token creation. createToken() is ASYNC (it persists session state and starts
  //    a background listener), so it MUST be awaited — destructuring the Promise directly
  //    previously yielded undefined and failed this assertion.
  const { token, link, expiresAt } = await logginService.createToken();
  assert.ok(token, 'Token should be defined');
  assert.ok(link.includes('wa.me'), 'Link should be a WhatsApp wa.me link');
  assert.ok(expiresAt, 'ExpiresAt should be set');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  try {
    // 2. POST /api/auth/loggin/create-token
    const createRes = await fetch(`${base}/api/auth/loggin/create-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(createRes.status, 200);
    const createBody = await createRes.json();
    assert.strictEqual(createBody.status, 'success');
    assert.ok(createBody.data.token);
    assert.ok(createBody.data.link.includes('https://wa.me/'));

    // 3. Invalid token verification -> 400
    const verifyRes = await fetch(`${base}/api/auth/loggin/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '' }),
    });
    assert.strictEqual(verifyRes.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
