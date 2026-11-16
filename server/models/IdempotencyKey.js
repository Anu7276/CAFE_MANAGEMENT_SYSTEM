const mongoose = require('mongoose');
const { readStore, writeStore } = require('./storeAdapter');

const idempotencySchema = new mongoose.Schema({
  key: { type: String, required: true },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  orderId: { type: String, default: null },
  orderToken: { type: String, default: null },
  order: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now, expires: 86400 } // TTL index: expires in 24 hours
}, {
  timestamps: true
});

idempotencySchema.index({ key: 1 }, { unique: true });

const IdempotencyKeyModel = mongoose.models.IdempotencyKey || mongoose.model('IdempotencyKey', idempotencySchema);

function isMongoConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

class IdempotencyKey {
  static get mongooseModel() {
    return IdempotencyKeyModel;
  }

  /**
   * Atomically reserve key.
   * Uses MongoDB unique index constraint to guarantee mutual exclusion across instances.
   */
  static async reserve(key) {
    if (!key) return { isNew: true };

    if (isMongoConnected()) {
      try {
        const record = await IdempotencyKeyModel.create({ key, status: 'pending' });
        return { isNew: true, record: record.toObject ? record.toObject() : record };
      } catch (err) {
        if (err.code === 11000 || err.message?.includes('E11000')) {
          const existing = await IdempotencyKeyModel.findOne({ key });
          return { isNew: false, existing: existing?.toObject ? existing.toObject() : existing };
        }
        throw err;
      }
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: IdempotencyKey cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    if (!store.idempotencyKeys) store.idempotencyKeys = [];
    const found = store.idempotencyKeys.find(k => k.key === key);
    if (found) {
      return { isNew: false, existing: found };
    }
    const entry = { key, status: 'pending', createdAt: new Date().toISOString() };
    store.idempotencyKeys.push(entry);
    writeStore(store);
    return { isNew: true, record: entry };
  }

  static async complete(key, order) {
    if (!key || !order) return;

    if (isMongoConnected()) {
      await IdempotencyKeyModel.findOneAndUpdate(
        { key },
        {
          $set: {
            status: 'completed',
            orderId: order._id ? String(order._id) : null,
            orderToken: order.orderToken || null,
            order: order.toObject ? order.toObject() : order
          }
        }
      );
      return;
    }

    const store = readStore();
    if (!store.idempotencyKeys) store.idempotencyKeys = [];
    const idx = store.idempotencyKeys.findIndex(k => k.key === key);
    if (idx !== -1) {
      store.idempotencyKeys[idx].status = 'completed';
      store.idempotencyKeys[idx].orderId = order._id;
      store.idempotencyKeys[idx].order = order;
      writeStore(store);
    }
  }

  static async getOrder(key) {
    if (!key) return null;

    if (isMongoConnected()) {
      const record = await IdempotencyKeyModel.findOne({ key });
      return record?.order || null;
    }

    const store = readStore();
    const entry = (store.idempotencyKeys || []).find(k => k.key === key);
    return entry?.order || null;
  }
}

module.exports = IdempotencyKey;
