const assert = require('assert');
const { validateStatusTransition, VALID_TRANSITIONS } = require('../../utils/orderStateMachine');
const { generateTableSig, verifyTableSig } = require('../../utils/tableToken');

console.log('\n=============================================');
console.log('🧪 RUNNING UNIT TESTS: PRICING, STATE MACHINE & CRYPTO');
console.log('=============================================\n');

let passed = 0;
let total = 0;

function it(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Order State Machine Unit Tests
// ---------------------------------------------------------------------------
it('should define valid forward transitions for "new"', () => {
  assert.deepStrictEqual(VALID_TRANSITIONS.new, ['preparing', 'rejected']);
});

it('should allow valid transition from "new" to "preparing"', () => {
  const res = validateStatusTransition('new', 'preparing');
  assert.strictEqual(res.valid, true);
});

it('should allow valid transition from "preparing" to "ready"', () => {
  const res = validateStatusTransition('preparing', 'ready');
  assert.strictEqual(res.valid, true);
});

it('should allow valid transition from "ready" to "served"', () => {
  const res = validateStatusTransition('ready', 'served');
  assert.strictEqual(res.valid, true);
});

it('should reject illegal skip from "new" straight to "served"', () => {
  const res = validateStatusTransition('new', 'served');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('Illegal state transition'));
});

it('should reject rollback from terminal state "served" to "new"', () => {
  const res = validateStatusTransition('served', 'new');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('Terminal state') || res.error.includes('Illegal'));
});

it('should reject rollback from terminal state "rejected" to "ready"', () => {
  const res = validateStatusTransition('rejected', 'ready');
  assert.strictEqual(res.valid, false);
});

it('should allow same-status no-op transitions', () => {
  assert.strictEqual(validateStatusTransition('preparing', 'preparing').valid, true);
});

// ---------------------------------------------------------------------------
// 2. Pricing & GST Split Calculation Unit Tests
// ---------------------------------------------------------------------------
function calculateOrderTotals(cartItems, catalog) {
  let subtotal = 0;
  const processedItems = [];

  for (const item of cartItems) {
    const dbItem = catalog.find(i => i._id === item.itemId);
    if (!dbItem) throw new Error(`Item ${item.itemId} not found`);

    let unitPrice = Number(dbItem.price);
    let chosenSize = '';

    if (item.size && Array.isArray(dbItem.sizes)) {
      const match = dbItem.sizes.find(s => s.name.toLowerCase() === String(item.size).toLowerCase());
      if (match) {
        chosenSize = match.name;
        unitPrice += Number(match.extra || 0);
      }
    }

    const qty = Math.max(1, Math.min(20, Number(item.qty) || 1));
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;

    processedItems.push({
      itemId: dbItem._id,
      name: dbItem.name,
      price: unitPrice,
      size: chosenSize,
      qty,
      lineTotal
    });
  }

  const cgst = Math.round(subtotal * 0.025 * 100) / 100;
  const sgst = Math.round(subtotal * 0.025 * 100) / 100;
  const tax = Math.round((cgst + sgst) * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  return { subtotal, cgst, sgst, tax, total, processedItems };
}

const mockCatalog = [
  {
    _id: 'capp_1',
    name: 'Cappuccino',
    price: 180,
    sizes: [
      { name: 'Tall', extra: 0 },
      { name: 'Grande', extra: 30 },
      { name: 'Venti', extra: 60 }
    ]
  },
  {
    _id: 'cake_2',
    name: 'Strawberry Cake',
    price: 260,
    sizes: []
  }
];

it('should calculate base price correctly without modifiers', () => {
  const result = calculateOrderTotals([{ itemId: 'cake_2', qty: 2 }], mockCatalog);
  assert.strictEqual(result.subtotal, 520);
  assert.strictEqual(result.cgst, 13); // 520 * 0.025
  assert.strictEqual(result.sgst, 13); // 520 * 0.025
  assert.strictEqual(result.tax, 26);  // 5% of 520
  assert.strictEqual(result.total, 546);
});

it('should calculate size modifiers accurately (Grande +30)', () => {
  const result = calculateOrderTotals([{ itemId: 'capp_1', size: 'Grande', qty: 1 }], mockCatalog);
  assert.strictEqual(result.subtotal, 210); // 180 + 30
  assert.strictEqual(result.cgst, 5.25);
  assert.strictEqual(result.sgst, 5.25);
  assert.strictEqual(result.tax, 10.5);
  assert.strictEqual(result.total, 220.5);
});

it('should completely ignore client-tampered prices', () => {
  const tamperedOrder = [
    { itemId: 'cake_2', qty: 1, price: 1 } // Client claims ₹1
  ];
  const result = calculateOrderTotals(tamperedOrder, mockCatalog);
  assert.strictEqual(result.subtotal, 260, 'Subtotal strictly reflects DB catalog price ₹260');
  assert.strictEqual(result.total, 273);
});

it('should clamp invalid zero or negative quantities to minimum 1', () => {
  const result = calculateOrderTotals([{ itemId: 'cake_2', qty: -5 }], mockCatalog);
  assert.strictEqual(result.processedItems[0].qty, 1);
  assert.strictEqual(result.subtotal, 260);
});

// ---------------------------------------------------------------------------
// 3. Cryptographic Table Token HMAC Security Tests
// ---------------------------------------------------------------------------
it('should generate a 32-character hex HMAC signature', () => {
  const sig = generateTableSig(12);
  assert.strictEqual(typeof sig, 'string');
  assert.strictEqual(sig.length, 32);
});

it('should verify genuine signatures with timingSafeEqual', () => {
  const sig = generateTableSig(8);
  assert.strictEqual(verifyTableSig(8, sig), true);
});

it('should reject signatures when table number does not match', () => {
  const sig8 = generateTableSig(8);
  assert.strictEqual(verifyTableSig(9, sig8), false);
});

it('should reject falsified or altered signatures', () => {
  assert.strictEqual(verifyTableSig(8, '0123456789abcdef0123456789abcdef'), false);
  assert.strictEqual(verifyTableSig(8, ''), false);
  assert.strictEqual(verifyTableSig(8, null), false);
});

console.log('\n=============================================');
console.log(`UNIT TESTS RESULT: ${passed}/${total} passed.`);
console.log('=============================================\n');

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
