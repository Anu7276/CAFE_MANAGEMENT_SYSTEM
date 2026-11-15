const crypto = require('crypto');
const Order = require('../models/Order');
const Item = require('../models/Item');
const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');
const { verifyTableSig } = require('../utils/tableToken');
const { validateStatusTransition } = require('../utils/orderStateMachine');
const { generateBillHtml, generateKotHtml } = require('../utils/invoiceGenerator');

/**
 * Server-side price calculation and order creation with idempotency and signed table token verification.
 */
const createOrder = async (req, res, next) => {
  try {
    const { table, items, note, paymentMethod, tableSig } = req.body;
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || null;

    // 0. Check Master "Accepting Orders" Switch
    const settings = await Settings.get();
    if (settings && settings.acceptingOrders === false) {
      return res.status(403).json({
        success: false,
        message: 'The café is currently paused and not accepting new orders. Please check with staff.'
      });
    }

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

    // 2b. Table Abuse Prevention: Per-table open order cap check
    const maxOpenOrders = Number(settings.maxOpenOrdersPerTable) || 3;
    const tableOrders = await Order.find({ table: tableNumber });
    const activeTableOrders = tableOrders.filter(
      o => ['new', 'preparing', 'payment_pending'].includes(o.status) && !o.isDeleted
    );

    if (activeTableOrders.length >= maxOpenOrders) {
      return res.status(429).json({
        success: false,
        message: `Table ${tableNumber} has reached the maximum allowed limit of ${maxOpenOrders} open orders. Please wait for current orders to be served.`
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

    // UPI Payment Gate: If enabled, orders stay in payment_pending until Razorpay verification
    const isUpiOrder = (paymentMethod || 'counter') === 'upi';
    const requirePrePayment = Boolean(settings.requirePaymentBeforeKds) && isUpiOrder;
    const initialStatus = requirePrePayment ? 'payment_pending' : 'new';

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
      paymentStatus: 'pending',
      status: initialStatus,
      isTest: Boolean(req.body.isTest)
    });

    // 4. Scoped Socket.IO room broadcast (No global leaks)
    const io = req.app.get('io');
    if (io) {
      // Only emit to kitchen KDS if payment is not gated
      if (!requirePrePayment) {
        io.to('admin_kds').emit('order:created', order);
      }
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

    const settings = await Settings.get();

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
        gstin: settings.gstin || '',
        fssai: settings.fssai || '',
        cafeName: settings.cafeName || 'Café Emerald',
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
 * Staff / Admin list all orders with filters, date ranges, and pagination
 */
const getAllOrders = async (req, res, next) => {
  try {
    const { status, table, paymentStatus, search, startDate, endDate, includeTest, page = 1, limit = 50 } = req.query;
    let orders = await Order.find();

    // Exclude test orders unless explicitly requested by staff query (?includeTest=true)
    if (includeTest !== 'true') {
      orders = orders.filter(o => !o.isTest);
    }

    if (status && status !== 'all') {
      orders = orders.filter(o => o.status === status);
    }
    if (table) {
      orders = orders.filter(o => Number(o.table) === Number(table));
    }
    if (paymentStatus && paymentStatus !== 'all') {
      orders = orders.filter(o => o.paymentStatus === paymentStatus);
    }
    if (startDate) {
      const start = new Date(startDate).getTime();
      orders = orders.filter(o => new Date(o.createdAt).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate).getTime();
      orders = orders.filter(o => new Date(o.createdAt).getTime() <= end);
    }
    if (search) {
      const q = String(search).toLowerCase();
      orders = orders.filter(o =>
        String(o.orderNumber).includes(q) ||
        (o.items && o.items.some(i => i.name && i.name.toLowerCase().includes(q))) ||
        (o.note && o.note.toLowerCase().includes(q))
      );
    }

    const totalCount = orders.length;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(200, Number(limit)));
    const paginatedOrders = orders.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      success: true,
      count: paginatedOrders.length,
      totalCount,
      page: pageNum,
      totalPages: Math.ceil(totalCount / limitNum),
      data: paginatedOrders
    });
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

    const existingOrder = await Order.findById(req.params.id);
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Strict State Machine Verification
    const transitionCheck = validateStatusTransition(
      existingOrder.status,
      status,
      req.user?.role || 'staff'
    );

    if (!transitionCheck.valid) {
      return res.status(400).json({
        success: false,
        message: transitionCheck.error
      });
    }

    const order = await Order.findByIdAndUpdate(req.params.id, {
      status,
      statusNote: note
    });

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

    await AuditLog.logAction({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: 'order_status_updated',
      entity: 'Order',
      entityId: order._id,
      details: { from: existingOrder.status, to: status, orderNumber: order.orderNumber },
      ip: req.ip
    });

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * Staff / Admin mark order as paid (cash / counter)
 */
const markOrderPaid = async (req, res, next) => {
  try {
    const { paymentMethod = 'cash' } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isNewlyDispatched = order.status === 'payment_pending';
    const updates = {
      paymentStatus: 'paid',
      paymentMethod,
      paidAt: new Date().toISOString()
    };

    if (isNewlyDispatched) {
      updates.status = 'new';
      updates.statusHistory = [
        ...(order.statusHistory || []),
        { status: 'new', timestamp: new Date().toISOString(), note: 'Paid at counter; dispatched to kitchen' }
      ];
    }

    const updated = await Order.findByIdAndUpdate(req.params.id, updates);

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
        paymentMethod
      });
    }

    await AuditLog.logAction({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: 'order_marked_paid',
      entity: 'Order',
      entityId: order._id,
      details: { paymentMethod, total: order.total },
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'Order successfully marked as paid',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get structured legal GST invoice data
 */
const getInvoiceData = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const settings = await Settings.get();
    res.json({
      success: true,
      data: {
        invoiceNumber: `INV-EMR-${order.orderNumber}`,
        cafeName: settings.cafeName,
        gstin: settings.gstin,
        fssai: settings.fssai,
        address: settings.address,
        phone: settings.phone,
        sacCode: '996331',
        orderNumber: order.orderNumber,
        orderToken: order.orderToken,
        table: order.table,
        createdAt: order.createdAt,
        items: order.items,
        subtotal: order.subtotal,
        cgst: order.cgst || (order.tax / 2),
        sgst: order.sgst || (order.tax / 2),
        tax: order.tax,
        total: order.total,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paidAt: order.paidAt || null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate 80mm printable customer thermal receipt
 */
const printBill = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).send('<h3>Order not found</h3>');
    }

    const settings = await Settings.get();
    const html = generateBillHtml(order, settings);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    next(error);
  }
};

/**
 * Generate 80mm printable Kitchen Order Ticket (KOT)
 */
const printKot = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).send('<h3>Order not found</h3>');
    }

    const html = generateKotHtml(order);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    next(error);
  }
};

/**
 * Staff / Admin delete order (used for smoke test cleanup and test order removal)
 */
const deleteOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const deleted = await Order.findByIdAndDelete(order._id);

    // Audit log
    await AuditLog.create({
      action: 'ORDER_DELETED',
      userId: req.user?._id || 'system',
      userEmail: req.user?.email || 'staff',
      details: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        isTest: order.isTest,
        total: order.total
      }
    });

    res.json({
      success: true,
      message: 'Order deleted successfully',
      data: { _id: order._id, orderNumber: order.orderNumber }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder,
  trackOrder,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  markOrderPaid,
  getInvoiceData,
  printBill,
  printKot,
  deleteOrder
};
