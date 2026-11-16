const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app } = require('../../server');
const Order = require('../../models/Order');
const User = require('../../models/User');
const AuditLog = require('../../models/AuditLog');
const InvoiceSequence = require('../../models/InvoiceSequence');
const { setRazorpayClient } = require('../../services/razorpayService');
const { writeStore, readStore } = require('../../models/storeAdapter');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'emerald_test_jwt_secret_refunds';
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'emerald_razorpay_webhook_default_secret';

console.log('\n=============================================');
console.log('🧪 RUNNING REFUNDS & CREDIT NOTES TEST SUITE');
console.log('=============================================\n');

function generateToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function generateWebhookSignature(payloadString) {
  return crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(payloadString)
    .digest('hex');
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // Set up mock users and tokens
  const ownerUser = {
    _id: 'usr_owner_refund_' + Date.now(),
    name: 'Owner Tester',
    email: 'owner@cafeemerald.com',
    role: 'owner'
  };
  const staffUser = {
    _id: 'usr_staff_refund_' + Date.now(),
    name: 'Staff Tester',
    email: 'staff@cafeemerald.com',
    role: 'staff'
  };

  const store = readStore();
  if (!store.users) store.users = [];
  store.users.push(ownerUser, staffUser);
  writeStore(store);

  const ownerToken = generateToken(ownerUser);
  const staffToken = generateToken(staffUser);

  // Set up Razorpay mock
  const mockRefundCalls = [];
  setRazorpayClient({
    payments: {
      refund: async (paymentId, payload) => {
        mockRefundCalls.push({ paymentId, payload });
        return {
          id: 'rfnd_mock_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          entity: 'refund',
          amount: payload.amount,
          currency: 'INR',
          payment_id: paymentId,
          status: 'processed',
          created_at: Math.floor(Date.now() / 1000)
        };
      }
    }
  });

  // Test 1: Staff / Unauthenticated access is rejected (401 / 403)
  await test('1. Refund endpoint enforces owner-only RBAC (401 for unauthenticated, 403 for staff)', async () => {
    const order = await Order.create({
      tableNumber: 1,
      items: [{ itemId: 'item_1', name: 'Cold Brew', price: 200, quantity: 1 }],
      total: 200,
      paymentMethod: 'upi',
      paymentStatus: 'paid',
      razorpayPaymentId: 'pay_test_rbac_1'
    });

    const resUnauth = await request(app).post(`/api/orders/${order._id}/refund`).send({ amount: 200 });
    assert.strictEqual(resUnauth.statusCode, 401, 'Unauthenticated refund must return 401');

    const resStaff = await request(app)
      .post(`/api/orders/${order._id}/refund`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ amount: 200 });
    assert.strictEqual(resStaff.statusCode, 403, 'Staff refund must return 403 Forbidden');
    assert.ok(resStaff.body.message.includes('owner'), 'Must state owner role required');
  });

  // Test 2: Cannot refund an unpaid order
  await test('2. Cannot refund an unpaid order (returns 400)', async () => {
    const unpaidOrder = await Order.create({
      tableNumber: 2,
      items: [{ itemId: 'item_1', name: 'Filter Coffee', price: 100, quantity: 1 }],
      total: 100,
      paymentMethod: 'cash',
      paymentStatus: 'pending'
    });

    const res = await request(app)
      .post(`/api/orders/${unpaidOrder._id}/refund`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 100 });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.message, 'Cannot refund an unpaid order');
  });

  // Test 3: Owner initiates full refund -> returns 200, credit note, audit log
  await test('3. Owner initiates full refund with Razorpay mock, credit note & audit log', async () => {
    const order = await Order.create({
      tableNumber: 3,
      items: [{ itemId: 'item_1', name: 'Avocado Toast', price: 350, quantity: 1 }],
      total: 350,
      paymentMethod: 'upi',
      paymentStatus: 'paid',
      razorpayPaymentId: 'pay_test_full_refund_123'
    });

    const res = await request(app)
      .post(`/api/orders/${order._id}/refund`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'Customer requested full cancellation' });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.creditNoteNumber, 'Credit note number must be present');
    assert.match(
      res.body.data.creditNoteNumber,
      /^CE-CN\/\d{4}-\d{2}\/\d{6}$/,
      'Credit note must follow CE-CN/YYYY-YY/000001 format'
    );
    assert.strictEqual(res.body.data.order.refundStatus, 'full');
    assert.strictEqual(res.body.data.order.refundedAmount, 350);

    // Verify mock call to Razorpay
    const lastCall = mockRefundCalls[mockRefundCalls.length - 1];
    assert.strictEqual(lastCall.paymentId, 'pay_test_full_refund_123');
    assert.strictEqual(lastCall.payload.amount, 35000); // 350 INR in paise

    // Verify AuditLog written
    const logs = await AuditLog.find({ action: 'ORDER_REFUNDED', entityId: order._id });
    assert.ok(logs.length >= 1, 'Audit log entry must be written for refund');
    assert.strictEqual(logs[0].details.amount, 350);
    assert.strictEqual(logs[0].details.refundStatus, 'full');
  });

  // Test 4: Owner initiates partial refund (e.g. ₹100 of ₹250) -> returns partial, balance updated
  await test('4. Owner initiates partial refund (₹100 of ₹250) -> sets refundStatus partial', async () => {
    const order = await Order.create({
      tableNumber: 4,
      items: [{ itemId: 'item_1', name: 'Pasta', price: 250, quantity: 1 }],
      total: 250,
      paymentMethod: 'upi',
      paymentStatus: 'paid',
      razorpayPaymentId: 'pay_test_partial_123'
    });

    const res = await request(app)
      .post(`/api/orders/${order._id}/refund`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 100, reason: 'Partial refund for delayed item' });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.order.refundStatus, 'partial');
    assert.strictEqual(res.body.data.order.refundedAmount, 100);

    // Second partial refund for the remaining ₹150
    const res2 = await request(app)
      .post(`/api/orders/${order._id}/refund`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 150, reason: 'Remaining refund' });

    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.data.order.refundStatus, 'full');
    assert.strictEqual(res2.body.data.order.refundedAmount, 250);
  });

  // Test 5: Refund exceeding remaining balance returns 400
  await test('5. Refund exceeding remaining balance returns 400', async () => {
    const order = await Order.create({
      tableNumber: 5,
      items: [{ itemId: 'item_1', name: 'Sandwich', price: 150, quantity: 1 }],
      total: 150,
      paymentMethod: 'cash',
      paymentStatus: 'paid'
    });

    const resExceed = await request(app)
      .post(`/api/orders/${order._id}/refund`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 200 });

    assert.strictEqual(resExceed.statusCode, 400);
    assert.ok(resExceed.body.message.includes('exceeds maximum refundable balance'));

    // Full refund first
    await request(app)
      .post(`/api/orders/${order._id}/refund`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 150 });

    // Subsequent refund attempt
    const resAlreadyRefunded = await request(app)
      .post(`/api/orders/${order._id}/refund`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 10 });

    assert.strictEqual(resAlreadyRefunded.statusCode, 400);
    assert.strictEqual(resAlreadyRefunded.body.message, 'Order has already been fully refunded');
  });

  // Test 6: Webhook refund.processed updates order idempotently
  await test('6. Webhook refund.processed updates order idempotently', async () => {
    const order = await Order.create({
      tableNumber: 6,
      items: [{ itemId: 'item_1', name: 'Cheesecake', price: 220, quantity: 1 }],
      total: 220,
      paymentMethod: 'upi',
      paymentStatus: 'paid',
      razorpayPaymentId: 'pay_webhook_refund_123'
    });

    const webhookBody = JSON.stringify({
      event: 'refund.processed',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_hook_abc123',
            payment_id: 'pay_webhook_refund_123',
            amount: 22000,
            status: 'processed'
          }
        }
      }
    });

    const sig = generateWebhookSignature(webhookBody);

    // First webhook delivery
    const res1 = await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sig)
      .send(webhookBody);

    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res1.body.processed, true);

    const updated = await Order.findById(order._id);
    assert.strictEqual(updated.refundStatus, 'full');
    assert.strictEqual(updated.refundedAmount, 220);
    assert.match(updated.creditNoteNumber, /^CE-CN\/\d{4}-\d{2}\/\d{6}$/);

    // Duplicate webhook delivery: must return alreadyProcessed: true
    const res2 = await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sig)
      .send(webhookBody);

    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.alreadyProcessed, true);

    // Verify order still has exactly 1 refund record (not duplicated)
    const afterDuplicate = await Order.findById(order._id);
    assert.strictEqual(afterDuplicate.refunds.length, 1);
    assert.strictEqual(afterDuplicate.refundedAmount, 220);
  });

  // Test 7: Webhook refund.failed updates status to failed idempotently
  await test('7. Webhook refund.failed updates refund status to failed idempotently', async () => {
    const order = await Order.create({
      tableNumber: 7,
      items: [{ itemId: 'item_1', name: 'Iced Latte', price: 180, quantity: 1 }],
      total: 180,
      paymentMethod: 'upi',
      paymentStatus: 'paid',
      razorpayPaymentId: 'pay_hook_failed_123',
      refunds: [{
        refundId: 'rfnd_failed_target_456',
        amount: 180,
        status: 'pending',
        createdAt: new Date().toISOString()
      }]
    });

    const failedPayload = JSON.stringify({
      event: 'refund.failed',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_failed_target_456',
            payment_id: 'pay_hook_failed_123',
            amount: 18000,
            status: 'failed'
          }
        }
      }
    });

    const sig = generateWebhookSignature(failedPayload);

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sig)
      .send(failedPayload);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.recordedFailure, true);

    const orderAfterFailure = await Order.findById(order._id);
    const targetRefund = orderAfterFailure.refunds.find(r => r.refundId === 'rfnd_failed_target_456');
    assert.strictEqual(targetRefund.status, 'failed');
  });

  console.log(`\nRefunds Test Summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = runTests;
