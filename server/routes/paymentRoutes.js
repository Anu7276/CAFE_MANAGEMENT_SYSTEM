const express = require('express');
const router = express.Router();
const {
  initiatePayment,
  verifyPayment,
  handleWebhook
} = require('../controllers/paymentController');

// Customer or Staff initiate Razorpay checkout order
router.post('/razorpay/create-order', initiatePayment);

// Customer verify signature after completing payment
router.post('/razorpay/verify', verifyPayment);

// Razorpay server-to-server webhook
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

module.exports = router;
