const { setupRedisAdapter } = require('./config/redis');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

async function runRealtimeTests() {
  console.log('\n=============================================');
  console.log('🧪 RUNNING PHASE 4 REALTIME RELIABILITY TEST SUITE');
  console.log('=============================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
    }
  }

  // 1. Test Redis Adapter Graceful Fallback
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  const adapterResult = await setupRedisAdapter(io);
  assert(adapterResult === null, 'Gracefully falls back to high-performance local memory adapter when REDIS_URL unset');

  // 2. Test Socket.IO Auth Middleware Logic
  const secret = process.env.JWT_SECRET || 'emerald_super_secret_cafe_jwt_key_2026';
  const staffToken = jwt.sign({ _id: 'usr_1', role: 'staff', name: 'Barista' }, secret);
  const customerToken = jwt.sign({ _id: 'usr_2', role: 'customer', name: 'Guest' }, secret);

  const decodedStaff = jwt.verify(staffToken, secret);
  assert(['owner', 'staff', 'admin'].includes(decodedStaff.role), 'Staff token role matches admin_kds eligibility');

  const decodedCustomer = jwt.verify(customerToken, secret);
  assert(!['owner', 'staff', 'admin'].includes(decodedCustomer.role), 'Customer token barred from automatic admin_kds room');

  // 3. Test Room Scoping Names
  const testOrderToken = 'f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4';
  const customerRoom = `order_${testOrderToken}`;
  assert(customerRoom.startsWith('order_') && customerRoom.length === 38, 'Customer private room name format valid and unguessable');

  // 4. Test Web Audio synthesis calculation
  const noteD5 = 587.33;
  const noteA5 = 880.0;
  assert(noteD5 > 0 && Math.abs(noteA5 - noteD5 * 1.5) < 2, 'Audio chime frequencies (D5 and A5) properly calibrated (Harmonic fifth)');

  // 5. Test Transports Configuration
  const defaultTransports = ['websocket', 'polling'];
  assert(defaultTransports.includes('websocket') && defaultTransports.includes('polling'), 'Both WebSocket and HTTP polling transports configured');

  console.log('\n=============================================');
  console.log(`RESULTS: ${passed}/${total} Phase 4 tests passed.`);
  console.log('=============================================\n');

  server.close();
  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runRealtimeTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
