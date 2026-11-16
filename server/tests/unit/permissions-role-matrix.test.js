const assert = require('assert');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app } = require('../../server');
const User = require('../../models/User');
const Item = require('../../models/Item');
const Order = require('../../models/Order');
const Settings = require('../../models/Settings');
const { writeStore, readStore } = require('../../models/storeAdapter');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'emerald_test_jwt_secret_permissions';

console.log('\n=============================================');
console.log('🧪 RUNNING RBAC & PERMISSIONS MATRIX TEST SUITE');
console.log('=============================================\n');

function generateToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function runTests() {
  let passed = 0;

  // Initialize clean test store
  const store = readStore();
  const ownerUser = {
    _id: 'usr_owner_test_' + Date.now(),
    name: 'Owner Tester',
    email: 'owner@cafeemerald.com',
    role: 'owner'
  };
  const staffUser = {
    _id: 'usr_staff_test_' + Date.now(),
    name: 'Barista Tester',
    email: 'staff@cafeemerald.com',
    role: 'staff'
  };

  store.users = [ownerUser, staffUser];
  writeStore(store);

  const ownerToken = generateToken(ownerUser);
  const staffToken = generateToken(staffUser);

  // 1. Staff endpoints: GET /api/auth/staff, POST /api/auth/staff, DELETE /api/auth/staff/:id
  await (async () => {
    // Unauthenticated
    const resNoAuth = await request(app).get('/api/auth/staff');
    assert.strictEqual(resNoAuth.statusCode, 401, 'Unauthenticated access to GET /api/auth/staff returns 401');

    // Staff access
    const resStaff = await request(app)
      .get('/api/auth/staff')
      .set('Authorization', `Bearer ${staffToken}`);
    assert.strictEqual(resStaff.statusCode, 403, 'Staff access to GET /api/auth/staff returns 403 Forbidden');

    const resStaffPost = await request(app)
      .post('/api/auth/staff')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Hacker Staff', email: 'hack@test.com', password: 'Password@123', role: 'staff' });
    assert.strictEqual(resStaffPost.statusCode, 403, 'Staff access to POST /api/auth/staff returns 403 Forbidden');

    const resStaffDel = await request(app)
      .delete('/api/auth/staff/some_id')
      .set('Authorization', `Bearer ${staffToken}`);
    assert.strictEqual(resStaffDel.statusCode, 403, 'Staff access to DELETE /api/auth/staff/:id returns 403 Forbidden');

    // Owner access
    const resOwner = await request(app)
      .get('/api/auth/staff')
      .set('Authorization', `Bearer ${ownerToken}`);
    assert.strictEqual(resOwner.statusCode, 200, 'Owner access to GET /api/auth/staff returns 200 OK');

    console.log('  ✓ PASS: GET/POST/DELETE /api/auth/staff strictly restricted to owner');
    passed++;
  })();

  // 2. PATCH /api/settings - Field-level permission enforcement
  await (async () => {
    // Staff toggling acceptingOrders (Allowed)
    const resStaffToggle = await request(app)
      .patch('/api/settings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ acceptingOrders: false });
    assert.strictEqual(resStaffToggle.statusCode, 200, 'Staff allowed to toggle acceptingOrders');
    assert.strictEqual(resStaffToggle.body.data.acceptingOrders, false);

    // Staff attempting owner-only fields (Must fail 403)
    const ownerOnlyFields = [
      { field: 'gstin', value: '27ABCDE1234F1Z5' },
      { field: 'fssai', value: '11522000000000' },
      { field: 'businessName', value: 'Malicious Café Name' },
      { field: 'address', value: 'New Street, 101' },
      { field: 'taxRate', value: 10 },
      { field: 'cgstRate', value: 5 },
      { field: 'sgstRate', value: 5 },
      { field: 'onlinePaymentEnabled', value: false },
      { field: 'requirePaymentBeforeKds', value: true },
      { field: 'maxOpenOrdersPerTable', value: 10 }
    ];

    for (const item of ownerOnlyFields) {
      const resForbidden = await request(app)
        .patch('/api/settings')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ [item.field]: item.value });
      assert.strictEqual(
        resForbidden.statusCode,
        403,
        `Staff modifying ${item.field} should be rejected with 403`
      );
    }
    console.log('  ✓ PASS: Staff strictly blocked from modifying owner-only business and tax settings (403)');
    passed++;

    // Owner modifying all fields (Allowed)
    const resOwnerPatch = await request(app)
      .patch('/api/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        acceptingOrders: true,
        businessName: 'Café Emerald Grand',
        gstin: '27ABCDE1234F1Z5',
        fssai: '11522000000000',
        address: 'Heritage Lane, Pune',
        cgstRate: 2.5,
        sgstRate: 2.5,
        onlinePaymentEnabled: true,
        requirePaymentBeforeKds: false,
        maxOpenOrdersPerTable: 4
      });
    assert.strictEqual(resOwnerPatch.statusCode, 200, 'Owner allowed to update all settings');
    assert.strictEqual(resOwnerPatch.body.data.cafeName, 'Café Emerald Grand');
    assert.strictEqual(resOwnerPatch.body.data.maxOpenOrdersPerTable, 4);
    console.log('  ✓ PASS: Owner permitted to update all configuration and tax fields');
    passed++;
  })();

  // 3. Other Staff-Accessible Routes Locked to Owner-Only
  await (async () => {
    // Menu Item Creation / Deletion:
    const resStaffCreateItem = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Illegal Item', price: 99, category: 'Beverages' });
    assert.strictEqual(resStaffCreateItem.statusCode, 403, 'Staff cannot create items (403)');

    // Create a valid item via model
    const testItem = await Item.create({
      name: 'Permission Test Coffee',
      price: 150,
      category: 'Coffee',
      isAvailable: true
    });

    const resStaffDeleteItem = await request(app)
      .delete(`/api/items/${testItem._id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    assert.strictEqual(resStaffDeleteItem.statusCode, 403, 'Staff cannot delete items (403)');

    const resStaffRestoreItem = await request(app)
      .patch(`/api/items/${testItem._id}/restore`)
      .set('Authorization', `Bearer ${staffToken}`);
    assert.strictEqual(resStaffRestoreItem.statusCode, 403, 'Staff cannot restore items (403)');

    // But Staff CAN toggle availability (e.g. sold out)
    const resStaffToggleAvail = await request(app)
      .patch(`/api/items/${testItem._id}/availability`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ isAvailable: false });
    assert.strictEqual(resStaffToggleAvail.statusCode, 200, 'Staff CAN toggle availability (200)');

    // Financial Reports Summary: Owner only
    const resStaffReports = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${staffToken}`);
    assert.strictEqual(resStaffReports.statusCode, 403, 'Staff cannot view financial sales summary (403)');

    const resOwnerReports = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${ownerToken}`);
    assert.strictEqual(resOwnerReports.statusCode, 200, 'Owner can view financial sales summary (200)');

    // Order Deletion: Owner only
    const testOrder = await Order.create({
      table: 1,
      items: [{ item: testItem._id, name: testItem.name, price: 150, quantity: 1 }],
      subtotal: 150,
      tax: 7.5,
      total: 157.5,
      status: 'served',
      paymentStatus: 'paid'
    });

    const resStaffDeleteOrder = await request(app)
      .delete(`/api/orders/${testOrder._id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    assert.strictEqual(resStaffDeleteOrder.statusCode, 403, 'Staff cannot delete orders (403)');

    const resOwnerDeleteOrder = await request(app)
      .delete(`/api/orders/${testOrder._id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    assert.strictEqual(resOwnerDeleteOrder.statusCode, 200, 'Owner can delete orders (200)');

    console.log('  ✓ PASS: Item mutations, order deletion, and financial reports strictly restricted to owner');
    passed++;
  })();

  console.log('\n=============================================');
  console.log(`RESULTS: ${passed}/4 role matrix test groups passed`);
  console.log('=============================================\n');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
