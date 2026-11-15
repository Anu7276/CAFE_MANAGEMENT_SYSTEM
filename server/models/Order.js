const { readStore, writeStore } = require('./storeAdapter');

class Order {
  static async find(query = {}) {
    const store = readStore();
    let results = [...store.orders];

    if (query.status) {
      results = results.filter(o => o.status === query.status);
    }

    if (query.table) {
      results = results.filter(o => o.table === Number(query.table));
    }

    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  static async findById(id) {
    const store = readStore();
    return store.orders.find(o => o._id === id || String(o.orderNumber) === String(id)) || null;
  }

  static async findLatestOrderNumber() {
    const store = readStore();
    if (!store.orders.length) return 1000;
    return Math.max(...store.orders.map(o => o.orderNumber || 1000));
  }

  static async create(data) {
    const store = readStore();
    const highestNum = await this.findLatestOrderNumber();
    const newOrder = {
      _id: 'ord_' + Date.now(),
      orderNumber: highestNum + 1,
      table: Number(data.table),
      items: data.items || [],
      subtotal: Number(data.subtotal),
      tax: Number(data.tax),
      total: Number(data.total),
      note: data.note || '',
      paymentMethod: data.paymentMethod || 'counter',
      paymentStatus: data.paymentStatus || 'pending',
      status: 'new',
      createdAt: new Date().toISOString()
    };
    store.orders.unshift(newOrder);
    writeStore(store);
    return newOrder;
  }

  static async findByIdAndUpdate(id, updates) {
    const store = readStore();
    const index = store.orders.findIndex(o => o._id === id || String(o.orderNumber) === String(id));
    if (index === -1) return null;
    store.orders[index] = { ...store.orders[index], ...updates };
    writeStore(store);
    return store.orders[index];
  }
}

module.exports = Order;

