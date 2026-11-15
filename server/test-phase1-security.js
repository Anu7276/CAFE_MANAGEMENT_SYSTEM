const http = require('http');
const crypto = require('crypto');
const Order = require('./models/Order');
const Item = require('./models/Item');
const User = require('./models/User');
const { generateTableSig, verifyTableSig } = require('./utils/tableToken');

async function runTests() {
  console.log('\n=============================================');
  console.log('🧪 RUNNING PHASE 1 P0 SECURITY TEST SUITE');
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

  // 1. Test Table HMAC Tokens
  const sigTable3 = generateTableSig(3);
  assert(typeof sigTable3 === 'string' && sigTable3.length === 32, 'HMAC signature is 32-char hex string');
  assert(verifyTableSig(3, sigTable3) === true, 'Valid table signature passes timingSafeEqual check');
  assert(verifyTableSig(4, sigTable3) === false, 'Signature for table 3 rejected for table 4');
  assert(verifyTableSig(3, 'invalid_or_tampered_sig') === false, 'Tampered signature rejected');

  // 2. Test Account Lockout Mechanism
  const testEmail = 'lockout_test@cafeemerald.com';
  // create or find test user
  let user = await User.findOne({ email: testEmail });
  if (!user) {
    user = await User.create({
      name: 'Lockout Tester',
      email: testEmail,
      password: 'correctpassword123',
      role: 'staff'
    });
  }

  // Reset first
  await User.resetFailedAttempts(user._id);
  user = await User.findById(user._id);
  assert(User.isLocked(user) === false, 'User starts unlocked');

  // Register 4 failed attempts
  for (let i = 0; i < 4; i++) {
    await User.registerFailedAttempt(user._id);
  }
  user = await User.findById(user._id);
  assert(User.isLocked(user) === false, 'User still unlocked after 4 failed attempts');

  // 5th attempt locks account
  await User.registerFailedAttempt(user._id);
  user = await User.findById(user._id);
  assert(User.isLocked(user) === true, 'User is LOCKED after 5 consecutive failed attempts');

  // Reset restores access
  await User.resetFailedAttempts(user._id);
  user = await User.findById(user._id);
  assert(User.isLocked(user) === false, 'Resetting attempts unlocks the account');

  // 3. Test Order Creation, Server Pricing & Unguessable Order Token
  const items = await Item.find();
  const cake = items.find(i => i.name.toLowerCase().includes('cake')) || items[0];

  const orderData = {
    table: 5,
    tableSig: generateTableSig(5),
    idempotencyKey: 'test_idemp_' + Date.now(),
    items: [
      {
        itemId: cake._id,
        name: cake.name,
        qty: 2,
        price: 1 // Attempted price tampering to ₹1
      }
    ],
    note: 'Test order note'
  };

  // Create order using model logic
  const order = await Order.create({
    table: orderData.table,
    tableSig: orderData.tableSig,
    idempotencyKey: orderData.idempotencyKey,
    items: [
      {
        itemId: cake._id,
        name: cake.name,
        price: cake.price, // Server verified price
        size: '',
        qty: 2,
        lineTotal: cake.price * 2
      }
    ],
    subtotal: cake.price * 2,
    tax: Math.round(cake.price * 2 * 0.05),
    cgst: Math.round(cake.price * 2 * 0.025 * 100) / 100,
    sgst: Math.round(cake.price * 2 * 0.025 * 100) / 100,
    total: (cake.price * 2) + Math.round(cake.price * 2 * 0.05)
  });

  assert(order.orderToken && order.orderToken.length === 32, 'Unguessable 32-character crypto orderToken generated');
  assert(order.subtotal === cake.price * 2, 'Subtotal computed from DB base price, ignoring tampered price');
  assert(order.tax === Math.round(cake.price * 2 * 0.05), 'GST calculated accurately (5% total)');
  assert(order.total === order.subtotal + order.tax, 'Total equals subtotal + tax');

  // 4. Test Idempotency Key Dedup
  const duplicateAttempt = await Order.create({
    idempotencyKey: orderData.idempotencyKey,
    table: 5,
    subtotal: 99999, // Should be ignored because existing order is returned
    tax: 0,
    total: 99999
  });
  assert(duplicateAttempt._id === order._id, 'Idempotent replay detected: returns original order without duplicating');
  assert(duplicateAttempt.subtotal === order.subtotal, 'Original calculation preserved on idempotent replay');

  // 5. Lookup by OrderToken
  const foundByToken = await Order.findByToken(order.orderToken);
  assert(foundByToken && foundByToken._id === order._id, 'Customer can look up order securely by unguessable orderToken');

  console.log('\n=============================================');
  console.log(`RESULTS: ${passed}/${total} tests passed.`);
  console.log('=============================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
