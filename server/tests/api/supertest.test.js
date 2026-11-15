const request = require('supertest');
const assert = require('assert');
const { app } = require('../../server');
const { generateTableSig } = require('../../utils/tableToken');

async function runSupertestSuite() {
  console.log('\n=============================================');
  console.log('🧪 RUNNING SUPERTEST REST API INTEGRATION SUITE');
  console.log('=============================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
    }
  }

  let staffToken = '';
  let createdOrderId = '';
  let createdOrderToken = '';
  let testItemId = '';

  // 1. Health check
  await test('GET /health returns 200 and healthy status', async () => {
    const res = await request(app).get('/health');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'healthy');
  });

  // 2. Public Menu
  await test('GET /api/items returns 200 with menu and categories', async () => {
    const res = await request(app).get('/api/items');
    assert.strictEqual(res.statusCode, 200);
    assert(Array.isArray(res.body.data));
    assert(res.body.data.length > 0);
    assert(Array.isArray(res.body.categories));
    testItemId = res.body.data[0]._id;
  });

  // 3. Auth Login
  await test('POST /api/auth/login succeeds with valid staff credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@cafeemerald.com', password: 'adminpassword123' });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert(res.body.token);
    assert(res.body.user.role === 'admin' || res.body.user.role === 'owner');
    staffToken = res.body.token;

    // Verify Set-Cookie header contains emerald_token
    const cookies = res.headers['set-cookie'];
    assert(cookies && cookies.some(c => c.includes('emerald_token=')));
  });

  await test('POST /api/auth/login rejects invalid password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@cafeemerald.com', password: 'wrongpassword' });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.success, false);
  });

  // 4. Order Creation with Signed Table Token & Price Integrity
  await test('POST /api/orders creates order with server price & unguessable token', async () => {
    const tableNum = 3;
    const tableSig = generateTableSig(tableNum);
    const idempKey = 'supertest_idemp_' + Date.now();

    const res = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', idempKey)
      .send({
        table: tableNum,
        tableSig,
        items: [
          { itemId: testItemId, qty: 2, price: 1 } // Tampered price attempt
        ],
        note: 'Supertest barista note',
        paymentMethod: 'counter'
      });

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.success, true);
    assert(res.body.data._id);
    assert(res.body.data.orderToken && res.body.data.orderToken.length === 32);
    assert.strictEqual(res.body.data.table, 3);
    assert(res.body.data.subtotal > 2); // DB price applied, not 2 * 1
    assert.strictEqual(res.body.data.tax, Math.round(res.body.data.subtotal * 0.05));
    assert.strictEqual(res.body.data.total, res.body.data.subtotal + res.body.data.tax);

    createdOrderId = res.body.data._id;
    createdOrderToken = res.body.data.orderToken;

    // 4b. Test Idempotency Replay on same key
    const replayRes = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', idempKey)
      .send({
        table: tableNum,
        tableSig,
        items: [{ itemId: testItemId, qty: 5 }]
      });

    assert.strictEqual(replayRes.statusCode, 200);
    assert.strictEqual(replayRes.body.isIdempotentReplay, true);
    assert.strictEqual(replayRes.body.data._id, createdOrderId);
  });

  // 5. Public Customer Order Tracking
  await test('GET /api/orders/track/:orderToken returns safe tracking data', async () => {
    const res = await request(app).get(`/api/orders/track/${createdOrderToken}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.orderToken, createdOrderToken);
    assert.strictEqual(res.body.data.table, 3);
    assert(res.body.data.status);
    assert(Array.isArray(res.body.data.items));
  });

  // 6. Protected Order Operations
  await test('PATCH /api/orders/:id/status rejects unauthenticated requests with 401', async () => {
    const res = await request(app)
      .patch(`/api/orders/${createdOrderId}/status`)
      .send({ status: 'preparing' });

    assert.strictEqual(res.statusCode, 401);
  });

  await test('PATCH /api/orders/:id/status progresses state when authenticated as staff', async () => {
    const res = await request(app)
      .patch(`/api/orders/${createdOrderId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'preparing', note: 'Coffee grinder running' });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.status, 'preparing');
  });

  await test('PATCH /api/orders/:id/status blocks illegal state skip (preparing -> served) with 400', async () => {
    const res = await request(app)
      .patch(`/api/orders/${createdOrderId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'served' });

    assert.strictEqual(res.statusCode, 400);
    assert(res.body.message.includes('Illegal state transition'));
  });

  // 7. Cash Settlement (Mark Paid)
  await test('PATCH /api/orders/:id/mark-paid marks cash order paid', async () => {
    const res = await request(app)
      .patch(`/api/orders/${createdOrderId}/mark-paid`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ paymentMethod: 'cash' });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.paymentStatus, 'paid');
    assert.strictEqual(res.body.data.paymentMethod, 'cash');
    assert(res.body.data.paidAt);
  });

  // 8. Legal GST Invoice Endpoint
  await test('GET /api/orders/:id/invoice returns structured GST data with SAC code', async () => {
    const res = await request(app)
      .get(`/api/orders/${createdOrderId}/invoice`)
      .set('Authorization', `Bearer ${staffToken}`);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.gstin, '27AAAAA0000A1Z5');
    assert.strictEqual(res.body.data.fssai, '11522018000452');
    assert.strictEqual(res.body.data.sacCode, '996331');
    assert(res.body.data.invoiceNumber.startsWith('INV-EMR-'));
  });

  // 9. Tables and Signed QR List
  await test('GET /api/tables returns tables with HMAC signed URLs and QR Data URIs', async () => {
    const res = await request(app)
      .get('/api/tables')
      .set('Authorization', `Bearer ${staffToken}`);

    assert.strictEqual(res.statusCode, 200);
    assert(Array.isArray(res.body.data));
    assert(res.body.data.length >= 10);
    const table1 = res.body.data[0];
    assert.strictEqual(table1.tableNumber, 1);
    assert(table1.sig && table1.sig.length === 32);
    assert(table1.qrDataUri.startsWith('data:image/png;base64,'));
  });

  // 10. Reports Summary
  await test('GET /api/reports/summary returns today sales and top items ranking', async () => {
    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${staffToken}`);

    assert.strictEqual(res.statusCode, 200);
    assert(res.body.data.today);
    assert(typeof res.body.data.today.revenue === 'number');
    assert(Array.isArray(res.body.data.topItems));
  });

  console.log('\n=============================================');
  console.log(`SUPERTEST SUITE RESULT: ${passed}/${total} passed.`);
  console.log('=============================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSupertestSuite().catch(err => {
  console.error('Supertest execution fatal error:', err);
  process.exit(1);
});
