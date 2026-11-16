const mongoose = require('mongoose');
const crypto = require('crypto');
const { readStore, writeStore } = require('./storeAdapter');

/**
 * Official Mongoose Order Schema with Production Concurrency & Unique Constraints
 */
const orderSchema = new mongoose.Schema({
  _id: { type: String, default: () => 'ord_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') },
  orderNumber: { type: Number, required: true },
  orderToken: { type: String, required: true },
  idempotencyKey: { type: String, default: null },
  table: { type: Number, required: true },
  tableSig: { type: String, default: null },
  items: [{
    itemId: { type: String },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    size: { type: String, default: null },
    qty: { type: Number, required: true, default: 1 }
  }],
  subtotal: { type: Number, required: true },
  tax: { type: Number, required: true },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  total: { type: Number, required: true },
  note: { type: String, default: '' },
  paymentMethod: { type: String, default: 'counter' },
  paymentStatus: { type: String, default: 'pending' },
  razorpayOrderId: { type: String, sparse: true, index: true, default: null },
  razorpayPaymentId: { type: String, default: null },
  paidAt: { type: String, default: null },
  status: { type: String, default: 'new' },
  statusHistory: [{
    status: { type: String, required: true },
    timestamp: { type: String, default: () => new Date().toISOString() },
    note: { type: String }
  }],
  isTest: { type: Boolean, default: false },
  invoiceNumber: { type: String, default: null }
}, {
  timestamps: true,
  _id: false
});

// Explicit unique indexes required by production specifications
orderSchema.index({ orderToken: 1 }, { unique: true });
orderSchema.index({ invoiceNumber: 1 }, { unique: true, sparse: true });
orderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

const OrderModel = mongoose.models.Order || mongoose.model('Order', orderSchema);

// In-process mutex - DEV ONLY fallback for store.json
let devOrderUpdateMutex = Promise.resolve();

function isMongoConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

class Order {
  static get schema() {
    return orderSchema;
  }

  static get mongooseModel() {
    return OrderModel;
  }

  static async find(query = {}) {
    if (isMongoConnected()) {
      const mongoQuery = {};
      if (query.status) mongoQuery.status = query.status;
      if (query.table) mongoQuery.table = Number(query.table);
      if (query.paymentStatus) mongoQuery.paymentStatus = query.paymentStatus;
      if (query.razorpayOrderId) mongoQuery.razorpayOrderId = query.razorpayOrderId;
      const docs = await OrderModel.find(mongoQuery).sort({ createdAt: -1 });
      return docs.map(d => (d.toObject ? d.toObject() : d));
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Order model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    let results = [...(store.orders || [])];

    if (query.status) {
      results = results.filter(o => o.status === query.status);
    }
    if (query.table) {
      results = results.filter(o => o.table === Number(query.table));
    }
    if (query.paymentStatus) {
      results = results.filter(o => o.paymentStatus === query.paymentStatus);
    }
    if (query.razorpayOrderId) {
      results = results.filter(o => o.razorpayOrderId === query.razorpayOrderId);
    }

    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  static async findOne(query = {}) {
    if (isMongoConnected()) {
      const doc = await OrderModel.findOne(query);
      return doc ? (doc.toObject ? doc.toObject() : doc) : null;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Order model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    const orders = store.orders || [];
    return orders.find(order => {
      for (const [key, val] of Object.entries(query)) {
        if (val && typeof val === 'object' && val.$ne !== undefined) {
          if (order[key] === val.$ne) return false;
        } else if (order[key] !== val) {
          return false;
        }
      }
      return true;
    }) || null;
  }

  static async findById(id) {
    if (isMongoConnected()) {
      const doc = await OrderModel.findOne({
        $or: [
          { _id: id },
          { orderNumber: isNaN(id) ? -1 : Number(id) },
          { orderToken: id }
        ]
      });
      return doc ? (doc.toObject ? doc.toObject() : doc) : null;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Order model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    return (store.orders || []).find(o => o._id === id || String(o.orderNumber) === String(id) || o.orderToken === id) || null;
  }

  static async findByToken(orderToken) {
    if (!orderToken) return null;
    if (isMongoConnected()) {
      const doc = await OrderModel.findOne({ orderToken });
      return doc ? (doc.toObject ? doc.toObject() : doc) : null;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Order model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    return (store.orders || []).find(o => o.orderToken === orderToken) || null;
  }

  static async findByIdempotencyKey(key) {
    if (!key) return null;
    if (isMongoConnected()) {
      const doc = await OrderModel.findOne({ idempotencyKey: key });
      return doc ? (doc.toObject ? doc.toObject() : doc) : null;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Order model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    return (store.orders || []).find(o => o.idempotencyKey === key) || null;
  }

  static async findLatestOrderNumber() {
    if (isMongoConnected()) {
      const latest = await OrderModel.findOne().sort({ orderNumber: -1 });
      return latest ? latest.orderNumber : 1000;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Order model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    const orders = store.orders || [];
    if (!orders.length) return 1000;
    return Math.max(...orders.map(o => Number(o.orderNumber) || 1000));
  }

  static async create(data) {
    if (isMongoConnected()) {
      if (data.idempotencyKey) {
        const existing = await OrderModel.findOne({ idempotencyKey: data.idempotencyKey });
        if (existing) return existing.toObject ? existing.toObject() : existing;
      }

      const highestNum = await this.findLatestOrderNumber();
      const orderNumber = data.orderNumber || (highestNum + 1);
      const orderToken = data.orderToken || crypto.randomBytes(16).toString('hex');

      const doc = await OrderModel.create({
        ...data,
        orderNumber,
        orderToken,
        statusHistory: data.statusHistory || [
          { status: data.status || 'new', timestamp: new Date().toISOString(), note: 'Order placed' }
        ]
      });
      return doc.toObject ? doc.toObject() : doc;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Order model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    if (!store.orders) store.orders = [];

    // Check idempotency if key provided
    if (data.idempotencyKey) {
      const existing = (store.orders || []).find(o => o.idempotencyKey === data.idempotencyKey);
      if (existing) return existing;
    }

    const highestNum = await this.findLatestOrderNumber();
    const orderToken = data.orderToken || crypto.randomBytes(16).toString('hex');

    const newOrder = {
      _id: 'ord_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
      orderToken,
      idempotencyKey: data.idempotencyKey || null,
      orderNumber: highestNum + 1,
      table: Number(data.table),
      tableSig: data.tableSig || null,
      items: data.items || [],
      subtotal: Math.round(Number(data.subtotal) * 100) / 100,
      tax: Math.round(Number(data.tax) * 100) / 100,
      cgst: Math.round((Number(data.cgst || (data.tax / 2))) * 100) / 100,
      sgst: Math.round((Number(data.sgst || (data.tax / 2))) * 100) / 100,
      total: Math.round(Number(data.total) * 100) / 100,
      note: data.note ? String(data.note).slice(0, 500) : '',
      paymentMethod: data.paymentMethod || 'counter',
      paymentStatus: data.paymentStatus || 'pending',
      razorpayOrderId: data.razorpayOrderId || null,
      razorpayPaymentId: data.razorpayPaymentId || null,
      paidAt: data.paidAt || null,
      status: data.status || 'new',
      isTest: Boolean(data.isTest),
      invoiceNumber: data.invoiceNumber || null,
      statusHistory: data.statusHistory || [
        { status: data.status || 'new', timestamp: new Date().toISOString(), note: 'Order placed' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    store.orders.unshift(newOrder);
    writeStore(store);
    return newOrder;
  }

  static async findByIdAndDelete(id) {
    if (isMongoConnected()) {
      const deleted = await OrderModel.findOneAndDelete({
        $or: [
          { _id: id },
          { orderNumber: isNaN(id) ? -1 : Number(id) },
          { orderToken: id }
        ]
      });
      return deleted ? (deleted.toObject ? deleted.toObject() : deleted) : null;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Order model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    if (!store.orders) return null;
    const index = store.orders.findIndex(o => o._id === id || String(o.orderNumber) === String(id) || o.orderToken === id);
    if (index === -1) return null;
    const deleted = store.orders.splice(index, 1)[0];
    writeStore(store);
    return deleted;
  }

  static async findByIdAndUpdate(id, updates) {
    if (isMongoConnected()) {
      const existing = await this.findById(id);
      if (!existing) return null;

      const updatePayload = { ...updates };
      if (updates.status && updates.status !== existing.status) {
        if (!updatePayload.$push) updatePayload.$push = {};
        updatePayload.$push.statusHistory = {
          status: updates.status,
          timestamp: new Date().toISOString(),
          note: updates.statusNote || `Status changed to ${updates.status}`
        };
        delete updatePayload.statusNote;
      }

      const updated = await OrderModel.findOneAndUpdate(
        { _id: existing._id },
        updatePayload,
        { new: true }
      );
      return updated ? (updated.toObject ? updated.toObject() : updated) : null;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Order model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    if (!store.orders) store.orders = [];
    const index = store.orders.findIndex(o => o._id === id || String(o.orderNumber) === String(id) || o.orderToken === id);
    if (index === -1) return null;

    const existing = store.orders[index];
    const updatedStatusHistory = existing.statusHistory ? [...existing.statusHistory] : [];
    if (updates.status && updates.status !== existing.status) {
      updatedStatusHistory.push({
        status: updates.status,
        timestamp: new Date().toISOString(),
        note: updates.statusNote || `Status changed to ${updates.status}`
      });
    }

    store.orders[index] = {
      ...existing,
      ...updates,
      statusHistory: updatedStatusHistory,
      updatedAt: new Date().toISOString()
    };
    writeStore(store);
    return store.orders[index];
  }

  /**
   * Atomic findOneAndUpdate.
   * - In production / when connected to real MongoDB: uses plain Mongoose OrderModel.findOneAndUpdate directly (zero mutex, zero JSON store).
   * - In local dev without MongoDB: uses dev-only mutex with storeAdapter.
   */
  static async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    if (isMongoConnected()) {
      // PURE MONGOOSE ATOMIC EXECUTION ON REAL MONGODB
      const updated = await OrderModel.findOneAndUpdate(filter, update, { new: true, ...options });
      return updated ? (updated.toObject ? updated.toObject() : updated) : null;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Order model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    // DEV ONLY fallback: in-process mutex to serialize store.json read-modify-write
    const executeUpdate = async () => {
      const store = readStore();
      if (!store.orders) store.orders = [];

      const index = store.orders.findIndex(order => {
        for (const [key, val] of Object.entries(filter)) {
          if (val && typeof val === 'object' && val.$ne !== undefined) {
            if (order[key] === val.$ne) return false;
          } else if (order[key] !== val) {
            return false;
          }
        }
        return true;
      });

      if (index === -1) {
        return null;
      }

      const existing = store.orders[index];
      const updated = { ...existing };

      if (update.$set) {
        for (const [k, v] of Object.entries(update.$set)) {
          updated[k] = v;
        }
      }

      if (update.$push) {
        for (const [k, v] of Object.entries(update.$push)) {
          if (!Array.isArray(updated[k])) {
            updated[k] = updated[k] ? [updated[k]] : [];
          } else {
            updated[k] = [...updated[k]];
          }
          updated[k].push(v);
        }
      }

      for (const [k, v] of Object.entries(update)) {
        if (!k.startsWith('$')) {
          updated[k] = v;
        }
      }

      updated.updatedAt = new Date().toISOString();
      store.orders[index] = updated;
      writeStore(store);

      return options.new === false ? existing : updated;
    };

    const nextPromise = devOrderUpdateMutex.then(executeUpdate);
    devOrderUpdateMutex = nextPromise.catch(() => {});
    return nextPromise;
  }
}

module.exports = Order;
