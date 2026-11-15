const Order = require('./models/Order');
const Settings = require('./models/Settings');
const { validateStatusTransition } = require('./utils/orderStateMachine');
const { generateBillHtml, generateKotHtml } = require('./utils/invoiceGenerator');
const { createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature } = require('./services/razorpayService');
const crypto = require('crypto');

async function runPhase3Tests() {
  console.log('\n=============================================');
  console.log('🧪 RUNNING PHASE 3 PAYMENTS & GST TEST SUITE');
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

  // 1. Order State Machine Tests
  assert(validateStatusTransition('new', 'preparing').valid === true, 'State machine allows new -> preparing');
  assert(validateStatusTransition('preparing', 'ready').valid === true, 'State machine allows preparing -> ready');
  assert(validateStatusTransition('ready', 'served').valid === true, 'State machine allows ready -> served');
  assert(validateStatusTransition('new', 'rejected').valid === true, 'State machine allows new -> rejected');
  assert(validateStatusTransition('new', 'served').valid === false, 'State machine BLOCKS illegal skip: new -> served');
  assert(validateStatusTransition('served', 'preparing').valid === false, 'State machine BLOCKS illegal transition from terminal served -> preparing');
  assert(validateStatusTransition('rejected', 'ready').valid === false, 'State machine BLOCKS illegal transition from terminal rejected -> ready');

  // 2. Order Creation & Cash "Mark Paid"
  const order = await Order.create({
    table: 4,
    items: [
      { itemId: 'item_coldcoffee_4', name: 'Cold Coffee', price: 210, qty: 2 }
    ],
    subtotal: 420,
    cgst: 10.5,
    sgst: 10.5,
    tax: 21,
    total: 441,
    paymentMethod: 'counter',
    paymentStatus: 'pending'
  });

  assert(order.paymentStatus === 'pending', 'Order initialized with paymentStatus pending');

  // Mark as paid
  const paidOrder = await Order.findByIdAndUpdate(order._id, {
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    paidAt: new Date().toISOString()
  });

  assert(paidOrder.paymentStatus === 'paid', 'Mark paid updates paymentStatus to paid');
  assert(paidOrder.paymentMethod === 'cash', 'Mark paid records cash paymentMethod');
  assert(typeof paidOrder.paidAt === 'string', 'Mark paid captures paidAt timestamp');

  // 3. Razorpay Order Creation (Paise accuracy)
  const rzpOrder = await createRazorpayOrder({
    amount: order.total,
    receipt: `rcpt_${order.orderNumber}`
  });

  assert(rzpOrder.amount === Math.round(order.total * 100), 'Razorpay order created with accurate amount in paise (44100 paise)');
  assert(rzpOrder.id && rzpOrder.currency === 'INR', 'Razorpay order returned with valid order id and INR currency');

  // 4. Razorpay Signature Verification
  const testOrderId = 'order_test_9988';
  const testPaymentId = 'pay_test_7766';
  const testSecret = 'emerald_mock_secret';
  const validSignature = crypto
    .createHmac('sha256', testSecret)
    .update(`${testOrderId}|${testPaymentId}`)
    .digest('hex');

  // Test with simulation mode logic
  const simValid = verifyPaymentSignature({
    razorpayOrderId: 'order_sim_123',
    razorpayPaymentId: 'pay_123',
    razorpaySignature: 'sim_verified_sig'
  });
  assert(simValid === true, 'Simulation payment signature verified');

  const invalidAttempt = verifyPaymentSignature({
    razorpayOrderId: '',
    razorpayPaymentId: 'pay_123',
    razorpaySignature: 'bad'
  });
  assert(invalidAttempt === false, 'Tampered or empty payment verification rejected');

  // 5. GST Invoice & KOT Generation
  const settings = {
    ...(await Settings.get()),
    gstin: '27AAAAA0000A1Z5',
    fssai: '11522018000452'
  };
  const billHtml = generateBillHtml(order, settings);
  assert(billHtml.includes('GSTIN: 27AAAAA0000A1Z5'), 'Customer bill contains valid legal GSTIN');
  assert(billHtml.includes('FSSAI Lic: 11522018000452'), 'Customer bill contains FSSAI license');
  assert(billHtml.includes('SAC: 996331'), 'Customer bill includes SAC 996331 Restaurant Services code');
  assert(billHtml.includes('CGST @ 2.5%') && billHtml.includes('SGST @ 2.5%'), 'Customer bill displays 2.5% CGST + 2.5% SGST tax split');

  const kotHtml = generateKotHtml(order);
  assert(kotHtml.includes('KITCHEN ORDER TICKET'), 'Kitchen Order Ticket (KOT) contains thermal header');
  assert(kotHtml.includes(`TABLE ${order.table}`), 'KOT clearly displays Table number in large thermal badge');

  console.log('\n=============================================');
  console.log(`RESULTS: ${passed}/${total} Phase 3 tests passed.`);
  console.log('=============================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPhase3Tests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
