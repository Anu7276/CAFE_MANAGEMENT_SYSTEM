const Order = require('../models/Order');
const AuditLog = require('../models/AuditLog');
const Settings = require('../models/Settings');
const { createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature } = require('../services/razorpayService');

/**
 * Create a Razorpay Order for online UPI / Card payment
 */
const initiatePayment = async (req, res, next) => {
  try {
    const settings = await Settings.get();
    if (settings.onlinePaymentEnabled === false) {
      return res.status(403).json({
        success: false,
        message: 'Online payments are currently disabled. Please pay at the counter.'
      });
    }

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
/**
 * Verify Razorpay payment signature after customer completes UPI / card checkout.
 * Note: Must continue functioning for in-flight orders even if onlinePaymentEnabled was toggled off.
 */
const verifyPayment = async (req, res, next) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderToken } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId) {
      return res.status(400).json({ success: false, message: 'Payment details are required' });
    }

    // Look up order strictly by stored razorpayOrderId (or candidate orderToken matching razorpayOrderId)
    let order = null;
    if (orderToken) {
      const candidate = await Order.findByToken(orderToken);
      if (candidate && candidate.razorpayOrderId === razorpayOrderId) {
        order = candidate;
      }
    }
    if (!order) {
      const allOrders = await Order.find();
      order = allOrders.find(o => o.razorpayOrderId === razorpayOrderId);
    }

    // Only reject verify for an unknown razorpayOrderId
    if (!order) {
      return res.status(404).json({ success: false, message: 'Unknown or invalid Razorpay order ID' });
    }

    // Idempotency: duplicate verify calls return success without duplicate notifications
    if (order.paymentStatus === 'paid') {
      return res.json({
        success: true,
        message: 'Payment already verified and captured',
        data: order,
        alreadyProcessed: true
      });
    }

    const isValid = verifyPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    });

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature verification' });
    }

    const updatePayload = {
      paymentStatus: 'paid',
      paymentMethod: 'upi',
      razorpayPaymentId,
      paidAt: new Date().toISOString()
    };

    const isNewlyDispatched = order.status === 'payment_pending';
    if (isNewlyDispatched) {
      updatePayload.status = 'new';
      updatePayload.statusHistory = [
        ...(order.statusHistory || []),
        { status: 'new', timestamp: new Date().toISOString(), note: 'UPI payment confirmed; dispatched to kitchen' }
      ];
    }

    const updated = await Order.findByIdAndUpdate(order._id, updatePayload);

    const io = req.app.get('io');
    if (io) {
      if (isNewlyDispatched) {
        // Dispatched to kitchen for the first time
        io.to('admin_kds').emit('order:created', updated);
      } else {
        io.to('admin_kds').emit('order:updated', updated);
      }
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
 * Webhook handler with HMAC signature verification and idempotent event handling
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

    if (event === 'payment.captured' || event === 'order.paid') {
      const payment = payload?.payment?.entity;
      const orderEntity = payload?.order?.entity;
      const rzpOrderId = payment?.order_id || orderEntity?.id;

      if (rzpOrderId) {
        const orders = await Order.find();
        const order = orders.find(o => o.razorpayOrderId === rzpOrderId);

        if (order) {
          // Idempotency: the same payment event twice must not double-mark or double-notify
          if (order.paymentStatus === 'paid') {
            return res.json({ status: 'ok', alreadyProcessed: true });
          }

          const updatePayload = {
            paymentStatus: 'paid',
            paymentMethod: payment?.method || 'upi',
            razorpayPaymentId: payment?.id || order.razorpayPaymentId,
            paidAt: new Date().toISOString()
          };

          const isNewlyDispatched = order.status === 'payment_pending';
          if (isNewlyDispatched) {
            updatePayload.status = 'new';
            updatePayload.statusHistory = [
              ...(order.statusHistory || []),
              { status: 'new', timestamp: new Date().toISOString(), note: 'Payment verified via Razorpay webhook; dispatched to kitchen' }
            ];
          }

          const updated = await Order.findByIdAndUpdate(order._id, updatePayload);

          const io = req.app.get('io');
          if (io) {
            if (isNewlyDispatched) {
              io.to('admin_kds').emit('order:created', updated);
            } else {
              io.to('admin_kds').emit('order:updated', updated);
            }
            io.to(`order_${order.orderToken}`).emit('order:status', {
              orderNumber: order.orderNumber,
              orderToken: order.orderToken,
              status: updated.status,
              paymentStatus: 'paid',
              paymentMethod: updatePayload.paymentMethod
            });
          }

          await AuditLog.logAction({
            userId: 'razorpay_webhook',
            userEmail: 'webhook@razorpay.com',
            userRole: 'webhook',
            action: 'order_paid_webhook',
            entity: 'Order',
            entityId: order._id,
            details: { razorpayOrderId: rzpOrderId, razorpayPaymentId: payment?.id, amount: order.total },
            ip: req.ip
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
