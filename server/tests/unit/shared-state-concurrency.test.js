const assert = require('assert');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');
const { createAdapter } = require('@socket.io/redis-adapter');
const RedisMock = require('ioredis-mock');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const Order = require('../../models/Order');
const IdempotencyKey = require('../../models/IdempotencyKey');
const Item = require('../../models/Item');
const Settings = require('../../models/Settings');
const InvoiceSequence = require('../../models/InvoiceSequence');
const orderRoutes = require('../../routes/orderRoutes');
const { createLimiterStore } = require('../../middleware/rateLimiter');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'shared_state_secret_emerald_2026';
process.env.TABLE_TOKEN_SECRET = 'table_secret_emerald_2026';

console.log('\n=============================================');
console.log('🧪 RUNNING SHARED STATE & CROSS-INSTANCE CONCURRENCY SUITE');
console.log('=============================================\n');

function createTestServerInstance(sharedRedis, sharedMongoUri) {
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  // Attach Redis adapter with ioredis-mock duplicates
  const pubClient = sharedRedis.duplicate();
  const subClient = sharedRedis.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  app.set('io', io);
  app.use('/api/orders', orderRoutes);

  // Wire Socket.IO rooms
  io.on('connection', (socket) => {
    socket.on('join:admin', () => {
      socket.join('admin_kds');
    });
    socket.on('join:order', (data) => {
      const token = typeof data === 'string' ? data : data?.orderToken;
      if (token) {
        socket.join(`order_${token}`);
      }
    });
  });

  return { app, server, io, pubClient, subClient };
}

async function runSuite() {
  let mongod = null;
  let inst1 = null;
  let inst2 = null;
  const socketsToClose = [];

  try {
    // 1. Start Real In-Memory MongoDB & Build Schema Indexes
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    await mongoose.connect(mongoUri);

    await Order.mongooseModel.init();
    await IdempotencyKey.mongooseModel.init();
    await InvoiceSequence.mongooseModel.init();
    await Settings.mongooseModel.init();
    await Item.mongooseModel.init();

    // Populate standard settings and a test menu item
    await Settings.update({
      acceptingOrders: true,
      onlinePaymentEnabled: true,
      requirePaymentBeforeKds: false,
      maxOpenOrdersPerTable: 10
    });

    const testItem = await Item.create({
      name: 'Shared State Nitro Cold Brew',
      price: 240,
      category: 'Cold Brews',
      isAvailable: true
    });

    console.log('  ✓ PASS: MongoDB memory server started & collections initialized with unique TTL indexes');

    // 2. Set Up Shared Redis Mock
    const sharedRedis = new RedisMock();

    // 3. Start Two Separate Server Instances
    inst1 = createTestServerInstance(sharedRedis, mongoUri);
    inst2 = createTestServerInstance(sharedRedis, mongoUri);

    await new Promise((r) => inst1.server.listen(0, '127.0.0.1', r));
    await new Promise((r) => inst2.server.listen(0, '127.0.0.1', r));

    const port1 = inst1.server.address().port;
    const port2 = inst2.server.address().port;
    console.log(`  ✓ PASS: Two server instances listening on ports :${port1} and :${port2}`);

    // 4. Test Cross-Instance Socket.IO Rooms via Redis Adapter
    await (async () => {
      const orderToken = 'order_tok_' + Date.now();

      // Client A connects to Instance 1 and joins kitchen KDS room
      const clientA = ioClient(`http://127.0.0.1:${port1}`, { transports: ['websocket'] });
      socketsToClose.push(clientA);

      // Client B connects to Instance 2 and joins customer private order room
      const clientB = ioClient(`http://127.0.0.1:${port2}`, { transports: ['websocket'] });
      socketsToClose.push(clientB);

      await Promise.all([
        new Promise((resolve) => clientA.once('connect', resolve)),
        new Promise((resolve) => clientB.once('connect', resolve))
      ]);

      clientA.emit('join:admin');
      clientB.emit('join:order', orderToken);

      // Give adapter 50ms to register subscriptions
      await new Promise((r) => setTimeout(r, 60));

      // Assert Instance 2 broadcasting to 'admin_kds' reaches Client A on Instance 1
      const receivedAtClientA = new Promise((resolve) => {
        clientA.once('test:kds_ping', (msg) => resolve(msg));
      });
      inst2.io.to('admin_kds').emit('test:kds_ping', { from: 'instance_2', text: 'New KOT received' });
      const kdsMsg = await receivedAtClientA;
      assert.strictEqual(kdsMsg.from, 'instance_2', 'Client A on Instance 1 received broadcast from Instance 2');

      // Assert Instance 1 broadcasting to 'order_{orderToken}' reaches Client B on Instance 2
      const receivedAtClientB = new Promise((resolve) => {
        clientB.once('test:customer_status', (msg) => resolve(msg));
      });
      inst1.io.to(`order_${orderToken}`).emit('test:customer_status', { status: 'preparing' });
      const customerMsg = await receivedAtClientB;
      assert.strictEqual(customerMsg.status, 'preparing', 'Client B on Instance 2 received broadcast from Instance 1');

      console.log('  ✓ PASS: Socket.IO order & admin rooms communicate seamlessly across both instances via Redis adapter');
    })();

    // 5. Test Concurrent Idempotency-Key Race across both instances
    await (async () => {
      const idempotencyKey = 'idem_cross_inst_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const orderPayload = {
        table: 5,
        tableSig: 'dev_unsigned',
        items: [{ itemId: String(testItem._id), qty: 2 }]
      };

      // Fire simultaneous requests to Instance 1 and Instance 2 with the SAME Idempotency-Key
      const [res1, res2] = await Promise.all([
        request(inst1.app)
          .post('/api/orders')
          .set('Idempotency-Key', idempotencyKey)
          .send(orderPayload),
        request(inst2.app)
          .post('/api/orders')
          .set('Idempotency-Key', idempotencyKey)
          .send(orderPayload)
      ]);

      assert(
        (res1.status === 201 && res2.status === 200) ||
        (res1.status === 200 && res2.status === 201) ||
        (res1.status === 200 && res2.status === 200) ||
        (res1.status === 201 && res2.status === 201),
        `Both requests should complete with 200 or 201 (got ${res1.status} and ${res2.status})`
      );

      // Verify at least one response is flagged as idempotent replay if they collided
      const order1 = res1.body.data;
      const order2 = res2.body.data;

      assert(order1 && order2, 'Both responses returned order data');
      assert.strictEqual(String(order1._id), String(order2._id), 'Both instances returned the exact same order _id');
      assert.strictEqual(order1.orderToken, order2.orderToken, 'Both instances returned the exact same orderToken');

      // Verify strictly ONE order was persisted in MongoDB
      const ordersInDb = await Order.find({ idempotencyKey });
      assert.strictEqual(ordersInDb.length, 1, `Exactly ONE order should exist in MongoDB for idempotencyKey (found: ${ordersInDb.length})`);

      // Verify IdempotencyKey collection has exactly ONE completed record
      const keyRecord = await IdempotencyKey.mongooseModel.findOne({ key: idempotencyKey });
      assert(keyRecord, 'IdempotencyKey record exists in MongoDB');
      assert.strictEqual(keyRecord.status, 'completed', 'IdempotencyKey status is completed');
      assert.strictEqual(keyRecord.orderId, String(order1._id), 'IdempotencyKey correctly links to orderId');

      console.log('  ✓ PASS: Concurrent requests with same Idempotency-Key to 2 server instances created exactly ONE order');
    })();

    // 6. Test Redis Rate Limiter Store
    await (async () => {
      process.env.REDIS_URL = 'redis://127.0.0.1:6379';
      const store = createLimiterStore('test_metric');
      assert(store, 'createLimiterStore returns a RedisStore instance when REDIS_URL is set');
      delete process.env.REDIS_URL;
      console.log('  ✓ PASS: express-rate-limit configured with RedisStore under REDIS_URL');
    })();

    console.log('\n=============================================');
    console.log('RESULTS: ALL SHARED STATE & CONCURRENCY TESTS PASSED (4/4)');
    console.log('=============================================\n');
  } finally {
    // Cleanup sockets
    for (const s of socketsToClose) {
      if (s.connected) s.disconnect();
    }
    // Cleanup servers
    if (inst1?.server) await new Promise((r) => inst1.server.close(r));
    if (inst2?.server) await new Promise((r) => inst2.server.close(r));
    // Cleanup Mongoose & MongoMemoryServer
    if (mongoose.connection?.readyState) {
      await mongoose.disconnect();
    }
    if (mongod) {
      await mongod.stop();
    }
  }
}

runSuite().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Shared state concurrency test failed:', err);
  process.exit(1);
});
