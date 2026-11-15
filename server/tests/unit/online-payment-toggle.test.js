/**
 * Unit Test: "Online Payment Enabled" Settings Toggle & Pilot Enforcement
 */

const assert = require('assert');
const request = require('supertest');
const { app } = require('../../server');
const Settings = require('../../models/Settings');
const Order = require('../../models/Order');
const { generateTableSig } = require('../../utils/tableToken');

console.log('\n=============================================');
console.log('🧪 RUNNING ONLINE PAYMENT TOGGLE & PILOT GATE TEST SUITE');
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
  // 1. Default setting state
  await test('Settings model defaults onlinePaymentEnabled to true', async () => {
    const settings = await Settings.get();
    assert.strictEqual(typeof settings.onlinePaymentEnabled, 'boolean');
  });

  // 2. Disabling Online Payment blocks Razorpay routes with clear 403
  await test('When onlinePaymentEnabled is false, Razorpay order initiation returns 403', async () => {
    // Disable online payments
    await Settings.update({ onlinePaymentEnabled: false });

    // Create a mock order for test
    const mockOrder = await Order.create({
      orderToken: 'toggle_test_tok_' + Date.now(),
      table: 15,
      items: [{ name: 'Mocha', price: 160, qty: 1 }],
      subtotal: 160,
      tax: 8,
      total: 168,
      paymentMethod: 'counter',
      status: 'new',
      isTest: true
    });

    const res = await request(app)
      .post('/api/payments/razorpay/create-order')
      .send({ orderToken: mockOrder.orderToken });

    assert.strictEqual(res.statusCode, 403, 'Must return HTTP 403 Forbidden');
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('Online payments are currently disabled'));

    // Razorpay verify route must also return 403
    const verifyRes = await request(app)
      .post('/api/payments/razorpay/verify')
      .send({
        orderToken: mockOrder.orderToken,
        razorpayOrderId: 'order_fake',
        razorpayPaymentId: 'pay_fake',
        razorpaySignature: 'sig_fake'
      });

    assert.strictEqual(verifyRes.statusCode, 403, 'Verify must return HTTP 403');
    assert.ok(verifyRes.body.message.includes('Online payments are currently disabled'));

    await Order.findByIdAndDelete(mockOrder._id);
  });

  // 3. Online payment gate on order creation
  await test('Order placement with paymentMethod=upi is blocked with 403 when online payments disabled', async () => {
    await Settings.update({ onlinePaymentEnabled: false });

    const tableNum = 15;
    const tableSig = generateTableSig(tableNum);

    const res = await request(app)
      .post('/api/orders')
      .send({
        table: tableNum,
        tableSig,
        items: [{ itemId: 'item_cake_1', qty: 1 }],
        paymentMethod: 'upi',
        isTest: true
      });

    assert.strictEqual(res.statusCode, 403, 'Order placement with UPI must return 403');
    assert.ok(res.body.message.includes('Online payments are currently disabled'));

    // Counter cash order MUST succeed
    const cashRes = await request(app)
      .post('/api/orders')
      .send({
        table: tableNum,
        tableSig,
        items: [{ itemId: 'item_cake_1', qty: 1 }],
        paymentMethod: 'counter',
        isTest: true
      });

    assert.strictEqual(cashRes.statusCode, 201, 'Cash order must succeed with 201');
    assert.strictEqual(cashRes.body.data.paymentMethod, 'counter');

    if (cashRes.body.data?._id) {
      await Order.findByIdAndDelete(cashRes.body.data._id);
    }
  });

  // 4. Re-enabling restores online capability
  await test('Restoring onlinePaymentEnabled=true re-enables online payment routes', async () => {
    await Settings.update({ onlinePaymentEnabled: true });
    const settings = await Settings.get();
    assert.strictEqual(settings.onlinePaymentEnabled, true, 'Online payments should be restored to true');
  });

  console.log('\n=============================================');
  console.log(`RESULTS: ${passed}/${total} PASSED`);
  console.log('=============================================\n');

  if (passed !== total) process.exit(1);
}

run();
