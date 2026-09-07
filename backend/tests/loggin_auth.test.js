const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/server/app');
const logginService = require('../src/auth/loggin.service');

test('Loggin WhatsApp Authentication Flow Unit Test', (t, done) => {
  // 1. Test Loggin Token Creation
  const { token, link, expiresAt } = logginService.createToken();
  assert.ok(token, 'Token should be defined');
  assert.ok(link.includes('wa.me'), 'Link should be a WhatsApp wa.me link');
  assert.ok(expiresAt, 'ExpiresAt should be set');

  const server = http.createServer(app);
  server.listen(0, () => {
    const port = server.address().port;

    // 2. Test HTTP POST /api/auth/loggin/create-token
    const reqData = JSON.stringify({});
    const req = http.request(
      `http://localhost:${port}/api/auth/loggin/create-token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(reqData),
        },
      },
      (res) => {
        assert.strictEqual(res.statusCode, 200);
        let bodyStr = '';
        res.on('data', (chunk) => { bodyStr += chunk; });
        res.on('end', () => {
          const body = JSON.parse(bodyStr);
          assert.strictEqual(body.status, 'success');
          assert.ok(body.data.token);
          assert.ok(body.data.link.includes('https://wa.me/'));

          // 3. Test Invalid Token Verification
          const verifyData = JSON.stringify({ token: '' });
          const req2 = http.request(
            `http://localhost:${port}/api/auth/loggin/verify`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(verifyData),
              },
            },
            (res2) => {
              assert.strictEqual(res2.statusCode, 400);
              server.close(done);
            }
          );
          req2.write(verifyData);
          req2.end();
        });
      }
    );
    req.write(reqData);
    req.end();
  });
});
