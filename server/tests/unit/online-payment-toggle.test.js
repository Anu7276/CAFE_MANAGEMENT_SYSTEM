/**
 * Unit Test: "Online Payment Enabled" Settings Toggle & In-flight Payment Integrity
 */

const assert = require('assert');
const request = require('supertest');
const crypto = require('crypto');
const { app } = require('../../server');
const Settings = require('../../models/Settings');
const Order = require('../../models/Order');
const { generateTableSig } = require('../../utils/tableToken');

console.log('\n=============================================');
console.log('🧪 RUNNING ONLINE PAYMENT TOGGLE & IN-FLIGHT INTEGRITY TEST SUITE');
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
  // Ensure baseline setting is onlinePaymentEnabled: true
  await Settings.update({ onlinePaymentEnabled: true });

  // 1. New create-order is blocked when onlinePaymentEnabled is false
  await test('1. New create-order is blocked with 403 when onlinePaymentEnabled is false', async () => {
    await Settings.update({ onlinePaymentEnabled: false });

    // Create a temporary order to test create-order against
    const tempOrder = await Order.create({
      orderToken: 'tok_create_block_' + Date.now(),
      table: 35,
      items: [{ name: 'Espresso', price: 120, qty: 1 }],
      subtotal: 120,
      tax: 6,
      total: 126,
      paymentMethod: 'counter',
      status: 'new',
      isTest: true
    });

    const res = await request(app)
      .post('/api/payments/razorpay/create-order')
      .send({ orderToken: tempOrder.orderToken });

    assert.strictEqual(res.statusCode, 403, 'Must return HTTP 403 Forbidden');
    assert.strictEqual(res.body.success, false);
    assert.ok(
      res.body.message.includes('Online payments are currently disabled'),
      `Message should explain online payments disabled, got: ${res.body.message}`
    );

    await Order.findByIdAndDelete(tempOrder._id);
  });

  // 2. New UPI order is blocked when onlinePaymentEnabled is false
  await test('2. New UPI order is blocked with 403 when onlinePaymentEnabled is false', async () => {
    await Settings.update({ onlinePaymentEnabled: false });

    const tableNum = 36;
    const tableSig = generateTableSig(tableNum);

    const upiRes = await request(app)
      .post('/api/orders')
      .send({
        table: tableNum,
        tableSig,
        items: [{ itemId: 'item_cake_1', qty: 1 }],
        paymentMethod: 'upi',
        isTest: true
      });

    assert.strictEqual(upiRes.statusCode, 403, 'UPI order placement must return 403');
    assert.strictEqual(upiRes.body.success, false);
    assert.ok(
      upiRes.body.message.includes('Online payments are currently disabled'),
      `Expected disabled message, got: ${upiRes.body.message}`
    );

    // Cash order on the same table MUST still succeed
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
    if (cashRes.body.data?._id) {
      await Order.findByIdAndDelete(cashRes.body.data._id);
    }
  });

  // 3. Toggle off after create-order, then verify succeeds
  await test('3. Toggle off after create-order, then verify succeeds (in-flight payment preserved)', async () => {
    // Start with online payment enabled
    await Settings.update({ onlinePaymentEnabled: true });

    const rzpOrderId = 'order_sim_inflight_' + Date.now();
    const inflightOrder = await Order.create({
      orderToken: 'tok_inflight_' + Date.now(),
      table: 37,
      items: [{ name: 'Americano', price: 140, qty: 1 }],
      subtotal: 140,
      tax: 7,
      total: 147,
      paymentMethod: 'upi',
      paymentStatus: 'pending',
      razorpayOrderId: rzpOrderId,
      status: 'payment_pending',
      isTest: true
    });

    // Now operator switches toggle OFF while payment is in-flight
    await Settings.update({ onlinePaymentEnabled: false });

    // Client completes payment at gateway and calls verify
    const paymentId = 'pay_sim_success_' + Date.now();
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'emerald_mock_secret')
      .update(`${rzpOrderId}|${paymentId}`)
      .digest('hex');

    const verifyRes = await request(app)
      .post('/api/payments/razorpay/verify')
      .send({
        orderToken: inflightOrder.orderToken,
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature
      });

    assert.strictEqual(verifyRes.statusCode, 200, `Verify must return 200, got ${verifyRes.statusCode}: ${JSON.stringify(verifyRes.body)}`);
    assert.strictEqual(verifyRes.body.success, true);

    const verifiedOrder = await Order.findById(inflightOrder._id);
    assert.strictEqual(verifiedOrder.paymentStatus, 'paid', 'Order paymentStatus must be paid');
    assert.strictEqual(verifiedOrder.status, 'new', 'Order should transition to new and dispatch to KDS');

    await Order.findByIdAndDelete(inflightOrder._id);
  });

  // 4. Verify with unknown razorpayOrderId is rejected
  await test('4. Verify with unknown razorpayOrderId is rejected with 404', async () => {
    const res = await request(app)
      .post('/api/payments/razorpay/verify')
      .send({
        orderToken: 'tok_nonexistent_xyz',
        razorpayOrderId: 'order_nonexistent_999999',
        razorpayPaymentId: 'pay_sim_123',
        razorpaySignature: 'dummy_sig'
      });

    assert.strictEqual(res.statusCode, 404, 'Unknown razorpayOrderId must return 404');
    assert.strictEqual(res.body.success, false);
    assert.ok(
      res.body.message.includes('Unknown or invalid Razorpay order ID'),
      `Expected unknown order message, got: ${res.body.message}`
    );
  });

  // 5. Duplicate webhook is ignored (idempotent)
  await test('5. Duplicate webhook is ignored without double-marking or double-notifying', async () => {
    const rzpOrderId = 'order_sim_webhook_' + Date.now();
    const paymentId = 'pay_sim_wh_' + Date.now();

    const webhookOrder = await Order.create({
      orderToken: 'tok_webhook_' + Date.now(),
      table: 38,
      items: [{ name: 'Green Tea', price: 100, qty: 1 }],
      subtotal: 100,
      tax: 5,
      total: 105,
      paymentMethod: 'upi',
      paymentStatus: 'pending',
      razorpayOrderId: rzpOrderId,
      status: 'payment_pending',
      isTest: true
    });

    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: rzpOrderId,
            method: 'upi'
          }
        }
      }
    };

    const rawWebhookBody = JSON.stringify(webhookPayload);
    const whSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'emerald_razorpay_webhook_default_secret';
    const whSig = crypto.createHmac('sha256', whSecret).update(rawWebhookBody).digest('hex');

    // First webhook delivery
    const whRes1 = await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', whSig)
      .send(rawWebhookBody);

    assert.strictEqual(whRes1.statusCode, 200, 'First webhook must return 200');

    const updatedOrder = await Order.findById(webhookOrder._id);
    assert.strictEqual(updatedOrder.paymentStatus, 'paid');
    assert.strictEqual(updatedOrder.status, 'new');

    // Duplicate webhook delivery
    const whRes2 = await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', whSig)
      .send(rawWebhookBody);

    assert.strictEqual(whRes2.statusCode, 200, 'Duplicate webhook must return 200');
    assert.strictEqual(whRes2.body.alreadyProcessed, true, 'Duplicate webhook must report alreadyProcessed: true');

    // Ensure status history is not duplicated
    const finalOrder = await Order.findById(webhookOrder._id);
    const newTransitions = (finalOrder.statusHistory || []).filter(h => h.status === 'new');
    assert.strictEqual(newTransitions.length, 1, 'Status history should only record single transition to new');

    await Order.findByIdAndDelete(webhookOrder._id);
  });

  // Cleanup: restore onlinePaymentEnabled: true
  await Settings.update({ onlinePaymentEnabled: true });

  console.log('\n=============================================');
  console.log(`RESULTS: ${passed}/${total} PASSED`);
  console.log('=============================================\n');

  if (passed !== total) process.exit(1);
}

run();
