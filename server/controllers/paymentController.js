const Order = require('../models/Order');
const AuditLog = require('../models/AuditLog');
const Settings = require('../models/Settings');
const InvoiceSequence = require('../models/InvoiceSequence');
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

    // Look up existing order to ensure it exists; reject unknown orders with 404
    let existingOrder = await Order.findOne({ razorpayOrderId });
    if (!existingOrder && orderToken) {
      const candidate = await Order.findByToken(orderToken);
      if (candidate && (!candidate.razorpayOrderId || candidate.razorpayOrderId === razorpayOrderId)) {
        existingOrder = candidate;
      }
    }

    // Only reject verify for an unknown razorpayOrderId
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Unknown or invalid Razorpay order ID' });
    }

    // Idempotency: if already paid prior to signature verification, return alreadyProcessed: true
    if (existingOrder.paymentStatus === 'paid') {
      return res.json({
        success: true,
        status: 'ok',
        message: 'Payment already verified and captured',
        data: existingOrder,
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

    const now = new Date().toISOString();
    const isPaymentPending = existingOrder.status === 'payment_pending';
    const setPayload = {
      paymentStatus: 'paid',
      paymentMethod: 'upi',
      razorpayPaymentId,
      paidAt: now
    };
    if (isPaymentPending) {
      setPayload.status = 'new';
    }

    const statusHistoryEntry = isPaymentPending
      ? { status: 'new', timestamp: now, note: 'UPI payment confirmed; dispatched to kitchen' }
      : { status: existingOrder.status || 'new', timestamp: now, note: 'UPI payment verified and confirmed' };

    // ONE atomic update: only matches if paymentStatus is not already 'paid'
    const updatedOrder = await Order.findOneAndUpdate(
      { razorpayOrderId, paymentStatus: { $ne: 'paid' } },
      {
        $set: setPayload,
        $push: { statusHistory: statusHistoryEntry }
      },
      { new: true }
    );

    // If updatedOrder is null (already marked paid concurrently), return alreadyProcessed: true and emit nothing
    if (!updatedOrder) {
      const alreadyPaidOrder = await Order.findOne({ razorpayOrderId }) || existingOrder;
      return res.json({
        success: true,
        status: 'ok',
        message: 'Payment already verified and captured',
        data: alreadyPaidOrder,
        alreadyProcessed: true
      });
    }

    // ONLY the call that gets a document back moves payment_pending to new and emits socket events
    const io = req.app.get('io');
    if (io) {
      if (isPaymentPending) {
        io.to('admin_kds').emit('order:created', updatedOrder);
      } else {
        io.to('admin_kds').emit('order:updated', updatedOrder);
      }
      io.to(`order_${updatedOrder.orderToken}`).emit('order:status', {
        orderNumber: updatedOrder.orderNumber,
        orderToken: updatedOrder.orderToken,
        status: updatedOrder.status,
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
      entityId: updatedOrder._id,
      details: { razorpayOrderId, razorpayPaymentId, amount: updatedOrder.total },
      ip: req.ip
    });

    return res.json({
      success: true,
      status: 'ok',
      message: 'Payment verified and captured successfully',
      data: updatedOrder
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Webhook handler with HMAC signature verification and atomic idempotent event handling
 */
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).json({ success: false, message: 'Missing Razorpay webhook signature header' });
    }

    const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)));

    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    let body = req.body;
    if (Buffer.isBuffer(body)) {
      try {
        body = JSON.parse(body.toString('utf8'));
      } catch {
        return res.status(400).json({ success: false, message: 'Invalid JSON webhook payload' });
      }
    }

    const event = body?.event;
    const payload = body?.payload;

    if (event === 'payment.captured' || event === 'order.paid') {
      const payment = payload?.payment?.entity;
      const orderEntity = payload?.order?.entity;
      const rzpOrderId = payment?.order_id || orderEntity?.id;
      const razorpayPaymentId = payment?.id;
      const paymentMethod = payment?.method || 'upi';

      if (rzpOrderId) {
        const existingOrder = await Order.findOne({ razorpayOrderId: rzpOrderId });
        if (!existingOrder) {
          return res.json({ status: 'ok', message: 'No matching order for webhook' });
        }

        const now = new Date().toISOString();
        const isPaymentPending = existingOrder.status === 'payment_pending';
        const setPayload = {
          paymentStatus: 'paid',
          paymentMethod,
          paidAt: now
        };
        if (razorpayPaymentId) {
          setPayload.razorpayPaymentId = razorpayPaymentId;
        }
        if (isPaymentPending) {
          setPayload.status = 'new';
        }

        const statusHistoryEntry = isPaymentPending
          ? { status: 'new', timestamp: now, note: 'Payment verified via Razorpay webhook; dispatched to kitchen' }
          : { status: existingOrder.status || 'new', timestamp: now, note: 'Payment verified via Razorpay webhook' };

        // ONE atomic update: only matches if paymentStatus is not already 'paid'
        const updatedOrder = await Order.findOneAndUpdate(
          { razorpayOrderId: rzpOrderId, paymentStatus: { $ne: 'paid' } },
          {
            $set: setPayload,
            $push: { statusHistory: statusHistoryEntry }
          },
          { new: true }
        );

        // If updatedOrder is null (already paid), return alreadyProcessed: true and emit nothing
        if (!updatedOrder) {
          return res.json({ status: 'ok', alreadyProcessed: true });
        }

        // ONLY the call that gets a document back may move payment_pending to new and emit socket events
        const io = req.app.get('io');
        if (io) {
          if (isPaymentPending) {
            io.to('admin_kds').emit('order:created', updatedOrder);
          } else {
            io.to('admin_kds').emit('order:updated', updatedOrder);
          }
          io.to(`order_${updatedOrder.orderToken}`).emit('order:status', {
            orderNumber: updatedOrder.orderNumber,
            orderToken: updatedOrder.orderToken,
            status: updatedOrder.status,
            paymentStatus: 'paid',
            paymentMethod: updatedOrder.paymentMethod
          });
        }

        await AuditLog.logAction({
          userId: 'razorpay_webhook',
          userEmail: 'webhook@razorpay.com',
          userRole: 'webhook',
          action: 'order_paid_webhook',
          entity: 'Order',
          entityId: updatedOrder._id,
          details: { razorpayOrderId: rzpOrderId, razorpayPaymentId, amount: updatedOrder.total },
          ip: req.ip
        });

        return res.json({ status: 'ok', processed: true });
      }
    }

    // 4. Handle refund.processed webhook idempotently
    if (event === 'refund.processed') {
      const refundEntity = payload?.refund?.entity;
      const paymentId = refundEntity?.payment_id;
      const refundId = refundEntity?.id;
      const amountPaise = Number(refundEntity?.amount) || 0;
      const refundAmount = amountPaise / 100;

      if (!paymentId) {
        return res.json({ status: 'ok', ignored: true, reason: 'missing payment_id' });
      }

      const order = await Order.findOne({ razorpayPaymentId: paymentId });
      if (!order) {
        return res.json({ status: 'ok', ignored: true, reason: 'order not found' });
      }

      // Idempotency: If this refundId is already recorded and processed, return alreadyProcessed: true
      const existingRefund = (order.refunds || []).find((r) => r.refundId === refundId);
      if (existingRefund && existingRefund.status === 'processed') {
        return res.json({ status: 'ok', alreadyProcessed: true });
      }

      const creditNoteNumber = existingRefund?.creditNoteNumber || await InvoiceSequence.claimNextCreditNote();
      const previouslyRefunded = Number(order.refundedAmount || 0);
      const newRefundedTotal = existingRefund ? previouslyRefunded : (previouslyRefunded + refundAmount);
      const isFullRefund = newRefundedTotal >= Number(order.total);
      const refundStatus = isFullRefund ? 'full' : 'partial';

      const updatedOrder = await Order.findByIdAndUpdate(
        order._id,
        {
          $set: {
            refundStatus,
            refundedAmount: newRefundedTotal,
            creditNoteNumber
          },
          ...(existingRefund ? {} : {
            $push: {
              refunds: {
                refundId,
                amount: refundAmount,
                creditNoteNumber,
                status: 'processed',
                createdAt: new Date().toISOString()
              },
              statusHistory: {
                status: isFullRefund ? 'refunded' : order.status,
                note: `Webhook refund.processed: ₹${refundAmount} credited. Credit Note: ${creditNoteNumber}`
              }
            }
          })
        },
        { new: true }
      );

      const io = req.app.get('io');
      if (io) {
        io.to('admin_kds').emit('order:refunded', updatedOrder);
        io.to(`order_${order.orderToken}`).emit('order:refunded', updatedOrder);
      }

      await AuditLog.logAction({
        userId: 'razorpay_webhook',
        userEmail: 'webhook@razorpay.com',
        userRole: 'webhook',
        action: 'refund_processed_webhook',
        entity: 'Order',
        entityId: order._id,
        details: { refundId, paymentId, amount: refundAmount, creditNoteNumber, refundStatus },
        ip: req.ip
      });

      return res.json({ status: 'ok', processed: true });
    }

    // 5. Handle refund.failed webhook idempotently
    if (event === 'refund.failed') {
      const refundEntity = payload?.refund?.entity;
      const paymentId = refundEntity?.payment_id;
      const refundId = refundEntity?.id;

      if (paymentId && refundId) {
        const order = await Order.findOne({ razorpayPaymentId: paymentId });
        if (order) {
          const updatedRefunds = (order.refunds || []).map((r) => {
            if (r.refundId === refundId) {
              return { ...r, status: 'failed' };
            }
            return r;
          });
          await Order.findByIdAndUpdate(order._id, { refunds: updatedRefunds });
        }
      }

      return res.json({ status: 'ok', recordedFailure: true });
    }

    return res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  initiatePayment,
  verifyPayment,
  handleWebhook
};
