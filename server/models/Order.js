const crypto = require('crypto');
const { readStore, writeStore } = require('./storeAdapter');

class Order {
  static async find(query = {}) {
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

    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  static async findById(id) {
    const store = readStore();
    return (store.orders || []).find(o => o._id === id || String(o.orderNumber) === String(id) || o.orderToken === id) || null;
  }

  static async findByToken(orderToken) {
    if (!orderToken) return null;
    const store = readStore();
    return (store.orders || []).find(o => o.orderToken === orderToken) || null;
  }

  static async findByIdempotencyKey(key) {
    if (!key) return null;
    const store = readStore();
    return (store.orders || []).find(o => o.idempotencyKey === key) || null;
  }

  static async findLatestOrderNumber() {
    const store = readStore();
    const orders = store.orders || [];
    if (!orders.length) return 1000;
    return Math.max(...orders.map(o => Number(o.orderNumber) || 1000));
  }

  static async create(data) {
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
      status: 'new',
      statusHistory: [
        { status: 'new', timestamp: new Date().toISOString(), note: 'Order placed' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    store.orders.unshift(newOrder);
    writeStore(store);
    return newOrder;
  }

  static async findByIdAndUpdate(id, updates) {
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
}

module.exports = Order;
