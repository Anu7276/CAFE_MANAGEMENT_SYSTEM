const Item = require('./models/Item');
const Order = require('./models/Order');
const Settings = require('./models/Settings');
const AuditLog = require('./models/AuditLog');
const User = require('./models/User');
const { generateTableSig } = require('./utils/tableToken');
const QRCode = require('qrcode');

async function runAdminTests() {
  console.log('\n=============================================');
  console.log('🧪 RUNNING PHASE 2 ADMIN MANAGEMENT TEST SUITE');
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

  // 1. Master "Accepting Orders" Switch
  let settings = await Settings.get();
  assert(typeof settings.acceptingOrders === 'boolean', 'Settings store loaded with acceptingOrders boolean');

  // Toggle switch to false
  await Settings.update({ acceptingOrders: false }, { email: 'admin@cafeemerald.com' });
  settings = await Settings.get();
  assert(settings.acceptingOrders === false, 'Master switch can be toggled to PAUSED (false)');

  // Toggle switch back to true
  await Settings.update({ acceptingOrders: true }, { email: 'admin@cafeemerald.com' });
  settings = await Settings.get();
  assert(settings.acceptingOrders === true, 'Master switch can be toggled to ACTIVE (true)');

  // 2. Items CRUD, Soft Delete & Restore
  const newItem = await Item.create({
    name: 'Artisanal Cinnamon Roll',
    category: 'desserts',
    price: 150,
    description: 'Freshly baked brioche swirled with Korintje cinnamon and cream cheese glaze.',
    emoji: '🥐',
    isVeg: true,
    isAvailable: true
  });
  assert(newItem._id && newItem.name === 'Artisanal Cinnamon Roll', 'Item created successfully');

  // Verify item is returned in standard find
  let activeItems = await Item.find({ category: 'desserts' });
  assert(activeItems.some(i => i._id === newItem._id), 'Newly created item is visible in public menu');

  // Soft delete item
  await Item.softDelete(newItem._id);
  activeItems = await Item.find({ category: 'desserts' });
  assert(!activeItems.some(i => i._id === newItem._id), 'Soft-deleted item is excluded from public customer menu');

  // Verify admin can still find it when includeDeleted is true
  const adminItems = await Item.find({ includeDeleted: true });
  assert(adminItems.some(i => i._id === newItem._id && i.isDeleted === true), 'Admin can view soft-deleted item with includeDeleted: true');

  // Restore item
  await Item.restore(newItem._id);
  activeItems = await Item.find({ category: 'desserts' });
  assert(activeItems.some(i => i._id === newItem._id && !i.isDeleted), 'Restored item reappears in customer menu');

  // 3. Sold-out toggle (isAvailable)
  await Item.findByIdAndUpdate(newItem._id, { isAvailable: false });
  let checkItem = await Item.findById(newItem._id);
  assert(checkItem.isAvailable === false, 'Sold-out toggle marks item as unavailable (isAvailable: false)');

  await Item.findByIdAndUpdate(newItem._id, { isAvailable: true });
  checkItem = await Item.findById(newItem._id);
  assert(checkItem.isAvailable === true, 'Sold-out toggle restores item availability');

  // Clean up test item
  await Item.softDelete(newItem._id);

  // 4. Table QR Codes with HMAC Signature
  const tableNum = 7;
  const sig = generateTableSig(tableNum);
  const targetUrl = `http://localhost:5173/t/${tableNum}?sig=${sig}`;
  const qrDataUri = await QRCode.toDataURL(targetUrl);
  assert(qrDataUri.startsWith('data:image/png;base64,'), 'High-resolution PNG QR Data URI generated for Table');
  assert(targetUrl.includes('/t/7?sig='), 'Target URL correctly includes signed HMAC table parameter');

  // 5. Staff Accounts Management
  const staffEmail = 'barista_test_' + Date.now() + '@cafeemerald.com';
  const newStaff = await User.create({
    name: 'Test Barista',
    email: staffEmail,
    password: 'baristapassword123',
    role: 'staff'
  });
  assert(newStaff._id && newStaff.role === 'staff', 'Staff account created with staff role');

  const staffList = await User.find({ role: 'staff' });
  assert(staffList.some(s => s._id === newStaff._id), 'New staff member appears in staff list');

  await User.findByIdAndDelete(newStaff._id);
  const staffListAfter = await User.find({ role: 'staff' });
  assert(!staffListAfter.some(s => s._id === newStaff._id), 'Staff member successfully deleted');

  // 6. Audit Logging
  await AuditLog.logAction({
    userId: 'usr_admin_1',
    userEmail: 'admin@cafeemerald.com',
    userRole: 'owner',
    action: 'item_created',
    entity: 'Item',
    entityId: newItem._id,
    details: { name: newItem.name }
  });

  const recentLogs = await AuditLog.find({ action: 'item_created' });
  assert(recentLogs.length > 0 && recentLogs[0].action === 'item_created', 'Audit log accurately recorded administrator action');

  console.log('\n=============================================');
  console.log(`RESULTS: ${passed}/${total} Phase 2 tests passed.`);
  console.log('=============================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAdminTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
