const crypto = require('crypto');

let razorpayClient = null;
const keyId = process.env.RAZORPAY_KEY_ID || '';
const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'emerald_razorpay_webhook_default_secret';

if (keyId && keySecret) {
  try {
    const Razorpay = require('razorpay');
    razorpayClient = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
    console.log('✓ Razorpay SDK initialized with live credentials');
  } catch (err) {
    console.log('ℹ Razorpay running in mock simulation mode');
  }
} else {
  console.log('ℹ Razorpay live keys not provided; running in local dev simulation mode');
}

/**
 * Create a Razorpay Order for UPI / Card checkout
 */
async function createRazorpayOrder({ amount, currency = 'INR', receipt, notes = {} }) {
  const amountInPaise = Math.round(Number(amount) * 100);

  if (razorpayClient) {
    return await razorpayClient.orders.create({
      amount: amountInPaise,
      currency,
      receipt,
      notes
    });
  }

  // Safe developer sandbox simulation
  return {
    id: 'order_sim_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
    entity: 'order',
    amount: amountInPaise,
    amount_paid: 0,
    amount_due: amountInPaise,
    currency,
    receipt,
    status: 'created',
    attempts: 0,
    notes,
    created_at: Math.floor(Date.now() / 1000),
    isSimulation: true
  };
}

/**
 * Verify client-returned payment signature
 */
function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return false;
  }

  // In simulation mode without keys, allow simulation tokens
  if (!keySecret && razorpayOrderId.startsWith('order_sim_')) {
    return true;
  }

  const generatedSignature = crypto
    .createHmac('sha256', keySecret || 'emerald_mock_secret')
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(generatedSignature),
      Buffer.from(razorpaySignature)
    );
  } catch {
    return false;
  }
}

/**
 * Verify webhook HMAC signature from Razorpay
 */
function verifyWebhookSignature(rawBody, signature) {
  if (!rawBody || !signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

module.exports = {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature
};
