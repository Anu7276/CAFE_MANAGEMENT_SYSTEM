/**
 * Unit Test: Atomic Razorpay Payment Confirmation & Webhook Concurrency
 *
 * Verifies:
 * 1. Webhook verifies X-Razorpay-Signature against raw body with timingSafeEqual and RAZORPAY_WEBHOOK_SECRET.
 * 2. Missing or invalid webhook signatures are rejected with HTTP 400.
 * 3. Concurrent verify and webhook calls for the same order (Promise.all, 20 iterations)
 *    execute atomically:
 *    - Exactly ONE paid transition
 *    - Exactly ONE KDS socket emit
 *    - Exactly ONE statusHistory transition entry
 */

const assert = require('assert');
const request = require('supertest');
const crypto = require('crypto');
const { app } = require('../../server');
const Order = require('../../models/Order');

console.log('\n=============================================');
console.log('🧪 RUNNING ATOMIC PAYMENT CONFIRMATION TEST SUITE');
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
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'emerald_razorpay_webhook_default_secret';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || 'emerald_mock_secret';

  // 1. Webhook signature enforcement against raw body
  await test('1. Webhook missing X-Razorpay-Signature is rejected with HTTP 400', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .send({ event: 'payment.captured' });

    assert.strictEqual(res.statusCode, 400, 'Must return HTTP 400 when signature missing');
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('Missing Razorpay webhook signature header'));
  });

  await test('2. Webhook with invalid or tampered signature is rejected with HTTP 400', async () => {
    const rawPayload = JSON.stringify({ event: 'payment.captured', payload: {} });
    const invalidSig = crypto.createHmac('sha256', 'wrong_secret_123').update(rawPayload).digest('hex');

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', invalidSig)
      .send(rawPayload);

    assert.strictEqual(res.statusCode, 400, 'Must return HTTP 400 when signature does not match raw body');
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('Invalid webhook signature'));
  });

  // 2. Concurrency Test: 20 simultaneous verify + webhook races
  await test('3. Concurrent verify & webhook calls (Promise.all, 20 iterations) produce exactly 1 paid transition, 1 KDS emit, and 1 statusHistory entry', async () => {
    const io = app.get('io');
    assert.ok(io, 'Socket.IO instance must be mounted on app');

    let kdsEmitsCount = 0;
    const originalTo = io.to.bind(io);

    // Spy on io.to to count KDS emissions
    io.to = function (room) {
      const roomObj = originalTo(room);
      return {
        ...roomObj,
        emit: function (event, data) {
          if (room === 'admin_kds' && (event === 'order:created' || event === 'order:updated')) {
            kdsEmitsCount++;
          }
          return roomObj.emit(event, data);
        }
      };
    };

    try {
      const iterations = 20;

      for (let i = 1; i <= iterations; i++) {
        kdsEmitsCount = 0; // Reset counter for this iteration

        const rzpOrderId = `order_atomic_${i}_${Date.now()}`;
        const orderToken = `tok_atomic_${i}_${Date.now()}`;

        // Create an order in payment_pending state
        const order = await Order.create({
          orderToken,
          table: 12,
          items: [{ name: 'Artisanal Cappuccino', price: 180, qty: 1 }],
          subtotal: 180,
          tax: 9,
          total: 189,
          paymentMethod: 'upi',
          paymentStatus: 'pending',
          razorpayOrderId: rzpOrderId,
          status: 'payment_pending',
          statusHistory: [
            { status: 'payment_pending', timestamp: new Date().toISOString(), note: 'Order placed' }
          ],
          isTest: true
        });

        // Prepare verify request
        const paymentIdVerify = `pay_v_${i}_${Date.now()}`;
        const verifySig = crypto
          .createHmac('sha256', keySecret)
          .update(`${rzpOrderId}|${paymentIdVerify}`)
          .digest('hex');

        const verifyPayload = {
          orderToken,
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: paymentIdVerify,
          razorpaySignature: verifySig
        };

        // Prepare webhook request
        const paymentIdWebhook = `pay_wh_${i}_${Date.now()}`;
        const webhookPayloadObj = {
          event: 'payment.captured',
          payload: {
            payment: {
              entity: {
                id: paymentIdWebhook,
                order_id: rzpOrderId,
                method: 'upi'
              }
            }
          }
        };

        const rawWebhookBody = JSON.stringify(webhookPayloadObj);
        const webhookSig = crypto
          .createHmac('sha256', webhookSecret)
          .update(rawWebhookBody)
          .digest('hex');

        // Fire both verify and webhook simultaneously
        const [verifyRes, webhookRes] = await Promise.all([
          request(app)
            .post('/api/payments/razorpay/verify')
            .send(verifyPayload),
          request(app)
            .post('/api/payments/webhook')
            .set('Content-Type', 'application/json')
            .set('x-razorpay-signature', webhookSig)
            .send(rawWebhookBody)
        ]);

        assert.strictEqual(verifyRes.statusCode, 200, `Iteration ${i}: Verify must return 200`);
        assert.strictEqual(webhookRes.statusCode, 200, `Iteration ${i}: Webhook must return 200`);

        // Check that exactly one call was the primary updater and the other received alreadyProcessed: true
        const verifyAlreadyProcessed = Boolean(verifyRes.body?.alreadyProcessed);
        const webhookAlreadyProcessed = Boolean(webhookRes.body?.alreadyProcessed);

        assert.ok(
          (verifyAlreadyProcessed && !webhookAlreadyProcessed) || (!verifyAlreadyProcessed && webhookAlreadyProcessed),
          `Iteration ${i}: Exactly one request must win atomic update (verifyAlreadyProcessed: ${verifyAlreadyProcessed}, webhookAlreadyProcessed: ${webhookAlreadyProcessed})`
        );

        // Fetch final order state from DB
        const finalOrder = await Order.findById(order._id);
        assert.strictEqual(finalOrder.paymentStatus, 'paid', `Iteration ${i}: Order must be paid`);
        assert.strictEqual(finalOrder.status, 'new', `Iteration ${i}: Order must have transitioned to new`);

        // Check status history: must have initial 'payment_pending' and EXACTLY ONE 'new' entry
        const statusEntries = finalOrder.statusHistory || [];
        const newStatusEntries = statusEntries.filter(entry => entry.status === 'new');
        assert.strictEqual(
          newStatusEntries.length,
          1,
          `Iteration ${i}: Must contain exactly ONE statusHistory entry for 'new' transition (got ${newStatusEntries.length})`
        );

        // Check socket emission: must have emitted to admin_kds EXACTLY once
        assert.strictEqual(
          kdsEmitsCount,
          1,
          `Iteration ${i}: Exactly ONE KDS emit must occur across concurrent calls (got ${kdsEmitsCount})`
        );

        // Clean up created order
        await Order.findByIdAndDelete(order._id);
      }
    } finally {
      // Restore original Socket.IO method
      io.to = originalTo;
    }
  });

  console.log('\n=============================================');
  console.log(`RESULTS: ${passed}/${total} PASSED`);
  console.log('=============================================\n');

  if (passed !== total) process.exit(1);
}

run();
