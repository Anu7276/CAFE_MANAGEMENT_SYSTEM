/**
 * Unit Test: Atomic Gap-Free GST Invoice Sequence per Financial Year
 */

const assert = require('assert');
const InvoiceSequence = require('../../models/InvoiceSequence');
const { generateBillHtml } = require('../../utils/invoiceGenerator');

console.log('\n=============================================');
console.log('🧪 RUNNING GST INVOICE ATOMIC SEQUENCE TEST SUITE');
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
  // 1. Indian Financial Year Calculation
  await test('Correctly calculates Indian Financial Year (April 1 - March 31 boundary)', () => {
    // November 2026 -> FY 2026-27
    const nov2026 = new Date('2026-11-15T12:00:00Z');
    assert.strictEqual(InvoiceSequence.getFiscalYear(nov2026), '2026-27');

    // January 2027 -> FY 2026-27 (before March 31)
    const jan2027 = new Date('2027-01-10T12:00:00Z');
    assert.strictEqual(InvoiceSequence.getFiscalYear(jan2027), '2026-27');

    // March 31, 2027 noon -> FY 2026-27
    const mar2027 = new Date('2027-03-31T12:00:00Z');
    assert.strictEqual(InvoiceSequence.getFiscalYear(mar2027), '2026-27');

    // April 2, 2027 noon -> FY 2027-28
    const apr2027 = new Date('2027-04-02T12:00:00Z');
    assert.strictEqual(InvoiceSequence.getFiscalYear(apr2027), '2027-28');

    // March 1, 2026 -> FY 2025-26
    const mar2026 = new Date('2026-03-01T12:00:00Z');
    assert.strictEqual(InvoiceSequence.getFiscalYear(mar2026), '2025-26');
  });

  // 2. Format Compliance: CE/YYYY-YY/000001
  await test('Generates compliant invoice number format (CE/YYYY-YY/000001)', async () => {
    const inv = await InvoiceSequence.claimNext(new Date('2026-11-15T12:00:00Z'));
    const pattern = /^CE\/2026-27\/\d{6}$/;
    assert.ok(pattern.test(inv), `Invoice '${inv}' must match pattern CE/2026-27/000001`);
  });

  // 3. Sequential Gap-Free Guarantee
  await test('Generates strictly consecutive gap-free sequence numbers', async () => {
    const date = new Date('2026-11-15T12:00:00Z');
    const inv1 = await InvoiceSequence.claimNext(date);
    const inv2 = await InvoiceSequence.claimNext(date);
    const inv3 = await InvoiceSequence.claimNext(date);

    const num1 = parseInt(inv1.split('/')[2], 10);
    const num2 = parseInt(inv2.split('/')[2], 10);
    const num3 = parseInt(inv3.split('/')[2], 10);

    assert.strictEqual(num2, num1 + 1, 'Second invoice must be consecutive to first');
    assert.strictEqual(num3, num2 + 1, 'Third invoice must be consecutive to second');
  });

  // 4. Concurrent Order Creation Stress Test
  await test('Concurrent calls never produce duplicate or out-of-order invoice numbers', async () => {
    const concurrency = 20;
    const date = new Date('2026-11-15T12:00:00Z');

    // Fire 20 claims concurrently
    const promises = Array.from({ length: concurrency }).map(() =>
      InvoiceSequence.claimNext(date)
    );

    const results = await Promise.all(promises);

    // Verify all are unique
    const uniqueSet = new Set(results);
    assert.strictEqual(uniqueSet.size, concurrency, 'All concurrent invoice numbers must be unique');

    // Extract numbers and verify gap-free contiguous sequence
    const numbers = results.map(inv => parseInt(inv.split('/')[2], 10)).sort((a, b) => a - b);
    for (let i = 1; i < numbers.length; i++) {
      assert.strictEqual(numbers[i], numbers[i - 1] + 1, `Gap detected between ${numbers[i-1]} and ${numbers[i]}`);
    }
  });

  // 5. Thermal Bill Display
  await test('Printable thermal bill displays the atomic GST invoice number', () => {
    const mockOrder = {
      orderNumber: 1045,
      invoiceNumber: 'CE/2026-27/000042',
      table: 3,
      orderToken: 'abcdef1234567890abcdef1234567890',
      createdAt: new Date().toISOString(),
      items: [{ name: 'Artisan Espresso', price: 150, qty: 1 }],
      subtotal: 150,
      tax: 7.5,
      cgst: 3.75,
      sgst: 3.75,
      total: 157.5,
      paymentMethod: 'upi',
      paymentStatus: 'paid'
    };

    const billHtml = generateBillHtml(mockOrder, { cafeName: 'Café Emerald' });
    assert.ok(billHtml.includes('CE/2026-27/000042'), 'Bill HTML must render atomic invoice number');
  });

  console.log('\n=============================================');
  console.log(`RESULTS: ${passed}/${total} PASSED`);
  console.log('=============================================\n');

  if (passed !== total) process.exit(1);
}

run();
