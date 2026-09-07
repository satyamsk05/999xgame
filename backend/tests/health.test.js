const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/server/app');

const { signToken } = require('../src/auth/jwt');

test('Health, Readiness & Core API Endpoints Unit Test', (t, done) => {
  const server = http.createServer(app);
  const testToken = signToken({ userId: 'usr_test_player', phone: '+919999999999' });
  server.listen(0, () => {
    const port = server.address().port;
    
    // Test /health
    http.get(`http://localhost:${port}/health`, (res) => {
      assert.strictEqual(res.statusCode, 200);
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const body = JSON.parse(data);
        assert.strictEqual(body.status, 'ok');
        assert.strictEqual(body.service, 'ingames-backend');
        
        // Test /api/games
        http.get(`http://localhost:${port}/api/games`, (res2) => {
          assert.strictEqual(res2.statusCode, 200);
          let data2 = '';
          res2.on('data', (chunk) => { data2 += chunk; });
          res2.on('end', () => {
            const body2 = JSON.parse(data2);
            assert.strictEqual(body2.status, 'success');
            assert.strictEqual(Array.isArray(body2.data), true);
            assert.strictEqual(body2.data[0].id, 'seven_up_down');
            
            // Test /api/wallet with Auth Header
            const options = {
              hostname: 'localhost',
              port: port,
              path: '/api/wallet',
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${testToken}`,
              },
            };
            const req = http.request(options, (res3) => {
              assert.strictEqual(res3.statusCode, 200);
              server.close(done);
            });
            req.end();
          });
        });
      });
    });
  });
});
