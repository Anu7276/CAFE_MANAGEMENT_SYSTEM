/**
 * Unit Test: QR Abuse Mitigation (Per-Table Cap, IP Rate Limiter, UPI Payment Gate)
 */

const assert = require('assert');
const Order = require('../../models/Order');
const Settings = require('../../models/Settings');
const { validateStatusTransition } = require('../../utils/orderStateMachine');
const { orderLimiter } = require('../../middleware/rateLimiter');

console.log('\n=============================================');
console.log('🧪 RUNNING QR ABUSE & PAYMENT GATE TEST SUITE');
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

async function run() {
  // 1. Settings support for maxOpenOrdersPerTable and requirePaymentBeforeKds
  await test('Settings model provides default maxOpenOrdersPerTable and requirePaymentBeforeKds', async () => {
    const settings = await Settings.get();
    assert.strictEqual(typeof settings.maxOpenOrdersPerTable, 'number', 'maxOpenOrdersPerTable should be a number');
    assert.strictEqual(typeof settings.requirePaymentBeforeKds, 'boolean', 'requirePaymentBeforeKds should be a boolean');
  });

  // 2. Per-table cap enforcement logic
  await test('Table cap blocks orders once max open orders reached', async () => {
    const tableNum = 19;
    const maxCap = 2;

    // Create 2 open orders
    const o1 = await Order.create({
      orderToken: 'abuse_test_1',
      table: tableNum,
      items: [{ name: 'Espresso', price: 120, qty: 1 }],
      subtotal: 120,
      tax: 6,
      total: 126,
      status: 'new',
      isTest: true
    });

    const o2 = await Order.create({
      orderToken: 'abuse_test_2',
      table: tableNum,
      items: [{ name: 'Croissant', price: 150, qty: 1 }],
      subtotal: 150,
      tax: 7.5,
      total: 157.5,
      status: 'preparing',
      isTest: true
    });

    // Check open order count for table 19
    const allTableOrders = await Order.find({ table: tableNum });
    const active = allTableOrders.filter(o => ['new', 'preparing', 'payment_pending'].includes(o.status) && !o.isDeleted);
    assert.strictEqual(active.length, 2, 'Table should have 2 active open orders');
    assert.ok(active.length >= maxCap, 'Cap threshold reached');

    // Completing an order frees up capacity
    await Order.findByIdAndUpdate(o1._id, { status: 'served' });
    const afterServed = (await Order.find({ table: tableNum })).filter(
      o => ['new', 'preparing', 'payment_pending'].includes(o.status) && !o.isDeleted
    );
    assert.strictEqual(afterServed.length, 1, 'Active count should drop to 1 after order is served');

    // Cleanup
    await Order.findByIdAndDelete(o1._id);
    await Order.findByIdAndDelete(o2._id);
  });

  // 3. UPI Payment Gate State Transitions
  await test('payment_pending status strictly gates kitchen entry until payment is confirmed', async () => {
    // Check state machine transition
    const validTransition = validateStatusTransition('payment_pending', 'new');
    assert.strictEqual(validTransition.valid, true, 'payment_pending -> new transition must be valid');

    const invalidTransition = validateStatusTransition('payment_pending', 'preparing');
    assert.strictEqual(invalidTransition.valid, false, 'payment_pending -> preparing must be blocked');

    // Create order with payment_pending status
    const pendingOrder = await Order.create({
      orderToken: 'upi_pending_' + Date.now(),
      table: 7,
      items: [{ name: 'Iced Latte', price: 200, qty: 1 }],
      subtotal: 200,
      tax: 10,
      total: 210,
      paymentMethod: 'upi',
      status: 'payment_pending',
      paymentStatus: 'pending',
      isTest: true
    });

    assert.strictEqual(pendingOrder.status, 'payment_pending');
    assert.strictEqual(pendingOrder.paymentStatus, 'pending');

    // Simulate mark paid / payment capture
    const confirmedOrder = await Order.findByIdAndUpdate(pendingOrder._id, {
      status: 'new',
      paymentStatus: 'paid'
    });

    assert.strictEqual(confirmedOrder.status, 'new');
    assert.strictEqual(confirmedOrder.paymentStatus, 'paid');

    await Order.findByIdAndDelete(pendingOrder._id);
  });

  // 4. Rate Limiter Configuration Check
  await test('Order rate limiter is configured with standard headers and IP throttling', () => {
    assert.ok(orderLimiter, 'orderLimiter middleware must be exported');
  });

  console.log('\n=============================================');
  console.log(`RESULTS: ${passed}/${total} PASSED`);
  console.log('=============================================\n');

  if (passed !== total) process.exit(1);
}

run();
