const crypto = require('crypto');
const Order = require('../models/Order');
const Item = require('../models/Item');
const { verifyTableSig } = require('../utils/tableToken');

/**
 * Server-side price calculation and order creation with idempotency and signed table token verification.
 */
const createOrder = async (req, res, next) => {
  try {
    const { table, items, note, paymentMethod, tableSig } = req.body;
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || null;

    // 1. Idempotency Check
    if (idempotencyKey) {
      const existing = await Order.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Idempotent replay: Order already processed',
          data: existing,
          isIdempotentReplay: true
        });
      }
    }

    // 2. Table Validation & HMAC Signature Check
    const tableNumber = Number(table);
    if (!tableNumber || tableNumber < 1 || tableNumber > 50) {
      return res.status(400).json({ success: false, message: 'Invalid table number (1-50)' });
    }

    const providedSig = tableSig || req.headers['x-table-sig'] || req.query.sig;
    const isSigValid = verifyTableSig(tableNumber, providedSig);

    if (process.env.NODE_ENV === 'production' && !isSigValid) {
      return res.status(403).json({
        success: false,
        message: 'Security verification failed: Invalid or missing signed table token. Please re-scan the QR code at your table.'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart cannot be empty' });
    }

    // 3. Strict Server-Side Price Calculation from DB ONLY
    // Ignore any client-sent prices to eliminate price tampering
    let calculatedSubtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const itemId = item.itemId || item._id;
      if (!itemId) {
        return res.status(400).json({ success: false, message: 'Missing item id in cart' });
      }

      const dbItem = await Item.findById(itemId);
      if (!dbItem) {
        return res.status(400).json({ success: false, message: `Menu item not found: ${itemId}` });
      }

      if (dbItem.isAvailable === false) {
        return res.status(400).json({
          success: false,
          message: `"${dbItem.name}" is currently sold out and cannot be ordered.`
        });
      }

      const qty = Math.max(1, Math.min(20, Number(item.qty) || 1));
      let unitPrice = Number(dbItem.price);

      // Validate size extra from database definition
      let selectedSize = '';
      if (item.size && Array.isArray(dbItem.sizes) && dbItem.sizes.length > 0) {
        const matchedSize = dbItem.sizes.find(
          s => s.name.toLowerCase() === String(item.size).toLowerCase()
        );
        if (matchedSize) {
          selectedSize = matchedSize.name;
          unitPrice += Number(matchedSize.extra || 0);
        }
      }

      const lineTotal = unitPrice * qty;
      calculatedSubtotal += lineTotal;

      validatedItems.push({
        itemId: dbItem._id,
        name: dbItem.name,
        category: dbItem.category,
        emoji: dbItem.emoji || '☕',
        price: unitPrice,
        size: selectedSize,
        qty,
        lineTotal
      });
    }

    // GST Calculation: 5% total (2.5% CGST + 2.5% SGST)
    const cgst = Math.round(calculatedSubtotal * 0.025 * 100) / 100;
    const sgst = Math.round(calculatedSubtotal * 0.025 * 100) / 100;
    const tax = Math.round((cgst + sgst) * 100) / 100;
    const total = Math.round((calculatedSubtotal + tax) * 100) / 100;

    // Generate unguessable random token for public customer status tracking
    const orderToken = crypto.randomBytes(16).toString('hex');

    const order = await Order.create({
      orderToken,
      idempotencyKey,
      table: tableNumber,
      tableSig: providedSig || (isSigValid ? 'valid' : 'dev_unsigned'),
      items: validatedItems,
      subtotal: calculatedSubtotal,
      cgst,
      sgst,
      tax,
      total,
      note: note ? String(note).slice(0, 300) : '',
      paymentMethod: paymentMethod || 'counter',
      paymentStatus: 'pending'
    });

    // 4. Scoped Socket.IO room broadcast (No global leaks)
    const io = req.app.get('io');
    if (io) {
      // Send to authenticated admin / kitchen display room
      io.to('admin_kds').emit('order:created', order);
      // Emit to customer's private room
      io.to(`order_${order.orderToken}`).emit('order:created', order);
    }

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: order
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Public customer order tracking by unguessable orderToken
 */
const trackOrder = async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Order token is required' });
    }

    const order = await Order.findByToken(token);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Return safe customer-facing view
    res.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        orderToken: order.orderToken,
        table: order.table,
        status: order.status,
        statusHistory: order.statusHistory || [],
        items: order.items,
        subtotal: order.subtotal,
        tax: order.tax,
        cgst: order.cgst,
        sgst: order.sgst,
        total: order.total,
        note: order.note,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Staff / Admin get order by ID or orderNumber
 */
const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * Staff / Admin list all orders with filter
 */
const getAllOrders = async (req, res, next) => {
  try {
    const { status, table, paymentStatus } = req.query;
    const query = {};
    if (status) query.status = status;
    if (table) query.table = table;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    const orders = await Order.find(query);
    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    next(error);
  }
};

/**
 * Staff / Admin update order status with state machine enforcement & scoped socket updates
 */
const updateOrderStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const validStatuses = ['new', 'preparing', 'ready', 'served', 'rejected'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.findByIdAndUpdate(req.params.id, {
      status,
      statusNote: note
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const io = req.app.get('io');
    if (io) {
      // Notify staff/KDS
      io.to('admin_kds').emit('order:updated', order);
      // Notify customer in their private order room
      io.to(`order_${order.orderToken}`).emit('order:status', {
        orderNumber: order.orderNumber,
        orderToken: order.orderToken,
        status: order.status,
        updatedAt: order.updatedAt,
        statusHistory: order.statusHistory
      });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder,
  trackOrder,
  getOrderById,
  getAllOrders,
  updateOrderStatus
};
