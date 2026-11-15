const Order = require('../models/Order');

const createOrder = async (req, res, next) => {
  try {
    const { table, items, note, paymentMethod } = req.body;

    if (!table || !items || !items.length) {
      return res.status(400).json({ success: false, message: 'Table and items are required' });
    }

    const subtotal = items.reduce((acc, item) => acc + Number(item.price) * Number(item.qty), 0);
    const tax = Math.round(subtotal * 0.05);
    const total = subtotal + tax;

    const order = await Order.create({
      table,
      items,
      subtotal,
      tax,
      total,
      note: note || '',
      paymentMethod: paymentMethod || 'counter'
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('order:created', order);
    }

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

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

const getAllOrders = async (req, res, next) => {
  try {
    const { status, table } = req.query;
    const query = {};
    if (status) query.status = status;
    if (table) query.table = table;

    const orders = await Order.find(query);
    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['new', 'preparing', 'ready', 'served', 'rejected'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid order status' });
    }

    const order = await Order.findByIdAndUpdate(req.params.id, { status });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit(`order:${order._id}:status`, order);
      io.emit('order:updated', order);
    }

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder,
  getOrderById,
  getAllOrders,
  updateOrderStatus
};

