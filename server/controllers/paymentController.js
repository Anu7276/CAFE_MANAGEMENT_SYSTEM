const Order = require('../models/Order');
const AuditLog = require('../models/AuditLog');
const { createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature } = require('../services/razorpayService');

/**
 * Create a Razorpay Order for online UPI / Card payment
 */
const initiatePayment = async (req, res, next) => {
  try {
    const { orderToken, orderId } = req.body;
    let order = null;

    if (orderToken) {
      order = await Order.findByToken(orderToken);
    } else if (orderId) {
      order = await Order.findById(orderId);
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'This order is already marked as paid' });
    }

    const razorpayOrder = await createRazorpayOrder({
      amount: order.total,
      currency: 'INR',
      receipt: `rcpt_${order.orderNumber}`,
      notes: {
        orderNumber: String(order.orderNumber),
        table: String(order.table),
        orderToken: order.orderToken
      }
    });

    await Order.findByIdAndUpdate(order._id, {
      razorpayOrderId: razorpayOrder.id,
      paymentMethod: 'upi'
    });

    res.json({
      success: true,
      data: {
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_emerald_demo',
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        orderNumber: order.orderNumber,
        table: order.table,
        isSimulation: !!razorpayOrder.isSimulation
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify Razorpay payment signature after customer completes UPI / card checkout
 */
const verifyPayment = async (req, res, next) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderToken } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId) {
      return res.status(400).json({ success: false, message: 'Payment details are required' });
    }

    const isValid = verifyPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    });

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature verification' });
    }

    let order = null;
    if (orderToken) {
      order = await Order.findByToken(orderToken);
    } else {
      const allOrders = await Order.find();
      order = allOrders.find(o => o.razorpayOrderId === razorpayOrderId);
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Matching order not found' });
    }

    const updated = await Order.findByIdAndUpdate(order._id, {
      paymentStatus: 'paid',
      paymentMethod: 'upi',
      razorpayPaymentId,
      paidAt: new Date().toISOString()
    });

    const io = req.app.get('io');
    if (io) {
      io.to('admin_kds').emit('order:updated', updated);
      io.to(`order_${order.orderToken}`).emit('order:status', {
        orderNumber: order.orderNumber,
        orderToken: order.orderToken,
        status: updated.status,
        paymentStatus: 'paid',
        paymentMethod: 'upi'
      });
    }

    await AuditLog.logAction({
      userId: 'customer',
      userEmail: 'customer@table',
      userRole: 'customer',
      action: 'order_paid_upi',
      entity: 'Order',
      entityId: order._id,
      details: { razorpayOrderId, razorpayPaymentId, amount: order.total },
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'Payment verified and captured successfully',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Webhook handler with HMAC signature verification
 */
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const event = req.body?.event;
    const payload = req.body?.payload;

    if (event === 'payment.captured') {
      const payment = payload?.payment?.entity;
      const rzpOrderId = payment?.order_id;
      if (rzpOrderId) {
        const orders = await Order.find();
        const order = orders.find(o => o.razorpayOrderId === rzpOrderId);
        if (order) {
          await Order.findByIdAndUpdate(order._id, {
            paymentStatus: 'paid',
            paymentMethod: payment.method || 'upi',
            razorpayPaymentId: payment.id,
            paidAt: new Date().toISOString()
          });
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  initiatePayment,
  verifyPayment,
  handleWebhook
};
