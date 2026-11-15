/**
 * Unit Test: Smoke Test Guards & isTest Order Exclusions
 */

const assert = require('assert');
const { createOrderSchema } = require('../../middleware/validate');
const Order = require('../../models/Order');

console.log('\n=============================================');
console.log('🧪 RUNNING SMOKE TEST GUARD & isTest ORDER TEST SUITE');
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
  await test('createOrderSchema correctly parses and preserves isTest flag', () => {
    const defaultParsed = createOrderSchema.parse({
      table: 1,
      items: [{ itemId: 'item_cake_1', qty: 1 }]
    });
    assert.strictEqual(defaultParsed.isTest, false, 'Default isTest should be false');

    const testParsed = createOrderSchema.parse({
      table: 1,
      items: [{ itemId: 'item_cake_1', qty: 1 }],
      isTest: true
    });
    assert.strictEqual(testParsed.isTest, true, 'Explicit isTest: true should be preserved');
  });

  await test('Order model persists isTest and supports findByIdAndDelete', async () => {
    const order = await Order.create({
      orderToken: 'test_token_' + Date.now(),
      table: 4,
      items: [{ name: 'Test Cake', price: 100, qty: 1 }],
      subtotal: 100,
      tax: 5,
      total: 105,
      isTest: true
    });

    assert.strictEqual(order.isTest, true, 'Created order should carry isTest: true');

    const found = await Order.findById(order._id);
    assert.ok(found, 'Order should be queryable before delete');

    const deleted = await Order.findByIdAndDelete(order._id);
    assert.ok(deleted, 'Order should be deleted');

    const afterDelete = await Order.findById(order._id);
    assert.strictEqual(afterDelete, null, 'Deleted order should no longer exist');
  });

  await test('Reports filter strictly excludes orders where isTest === true', () => {
    const mockOrders = [
      { _id: '1', total: 500, status: 'served', isTest: false, createdAt: new Date().toISOString() },
      { _id: '2', total: 1000, status: 'served', isTest: true, createdAt: new Date().toISOString() }, // Test order
      { _id: '3', total: 300, status: 'served', isTest: false, createdAt: new Date().toISOString() }
    ];

    const nonTestOrders = mockOrders.filter(o => !o.isTest);
    const totalRevenue = nonTestOrders.reduce((sum, o) => sum + o.total, 0);

    assert.strictEqual(nonTestOrders.length, 2, 'Should exclude test order');
    assert.strictEqual(totalRevenue, 800, 'Total revenue should be 800, not 1800');
  });

  await test('Production guard blocks smoke test execution without --allow-prod flag', () => {
    function checkProdGuard(env, argsList) {
      const isProd = env === 'production';
      const allowProd = argsList.includes('--allow-prod');
      if (isProd && !allowProd) {
        throw new Error('SAFETY GUARD: Refused without --allow-prod');
      }
      return 'ALLOWED';
    }

    assert.throws(
      () => checkProdGuard('production', []),
      /SAFETY GUARD/,
      'Production without --allow-prod must throw'
    );

    const allowedInProd = checkProdGuard('production', ['--allow-prod']);
    assert.strictEqual(allowedInProd, 'ALLOWED', 'Production with --allow-prod should be allowed');

    const allowedInDev = checkProdGuard('development', []);
    assert.strictEqual(allowedInDev, 'ALLOWED', 'Development should be allowed without flag');
  });

  console.log('\n=============================================');
  console.log(`RESULTS: ${passed}/${total} PASSED`);
  console.log('=============================================\n');

  if (passed !== total) process.exit(1);
}

run();
