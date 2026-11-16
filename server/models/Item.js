const mongoose = require('mongoose');
const { readStore, writeStore } = require('./storeAdapter');

const itemSchema = new mongoose.Schema({
  _id: { type: String },
  name: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String, default: '' },
  image: { type: String, default: '' },
  emoji: { type: String, default: '☕' },
  isVeg: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  sizes: [{
    name: { type: String },
    extra: { type: Number, default: 0 }
  }]
}, {
  timestamps: true,
  _id: false
});

const ItemModel = mongoose.models.Item || mongoose.model('Item', itemSchema);

function isMongoConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

class Item {
  static get mongooseModel() {
    return ItemModel;
  }

  static async find(query = {}) {
    if (isMongoConnected()) {
      const mongoQuery = {};
      if (!query.includeDeleted) {
        mongoQuery.isDeleted = { $ne: true };
      }
      if (query.category && query.category !== 'all') {
        mongoQuery.category = new RegExp(`^${query.category}$`, 'i');
      }
      if (query.isVeg !== undefined) {
        mongoQuery.isVeg = query.isVeg;
      }
      if (query.isAvailable !== undefined) {
        mongoQuery.isAvailable = query.isAvailable;
      }
      if (query.search) {
        mongoQuery.$or = [
          { name: new RegExp(query.search, 'i') },
          { description: new RegExp(query.search, 'i') }
        ];
      }
      const docs = await ItemModel.find(mongoQuery);
      return docs.map(d => (d.toObject ? d.toObject() : d));
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Item model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    let results = [...(store.items || [])];

    // Filter out soft-deleted items unless specifically asked by admin
    if (!query.includeDeleted) {
      results = results.filter(i => !i.isDeleted);
    }

    if (query.category && query.category !== 'all') {
      results = results.filter(i => (i.category || '').toLowerCase() === query.category.toLowerCase());
    }

    if (query.isVeg !== undefined) {
      results = results.filter(i => i.isVeg === query.isVeg);
    }

    if (query.isAvailable !== undefined) {
      results = results.filter(i => i.isAvailable === query.isAvailable);
    }

    if (query.search) {
      const q = query.search.toLowerCase();
      results = results.filter(i =>
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.description && i.description.toLowerCase().includes(q))
      );
    }

    return results;
  }

  static async findById(id) {
    if (isMongoConnected()) {
      const doc = await ItemModel.findById(id);
      return doc ? (doc.toObject ? doc.toObject() : doc) : null;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Item model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    return (store.items || []).find(i => i._id === id) || null;
  }

  static async create(data) {
    if (isMongoConnected()) {
      const doc = await ItemModel.create({
        _id: 'item_' + Date.now(),
        ...data,
        isDeleted: false
      });
      return doc.toObject ? doc.toObject() : doc;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Item model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    if (!store.items) store.items = [];

    const newItem = {
      _id: 'item_' + Date.now(),
      name: data.name,
      category: data.category,
      price: Math.max(0, Number(data.price) || 0),
      description: data.description || '',
      image: data.image || '',
      emoji: data.emoji || '☕',
      isVeg: data.isVeg !== undefined ? Boolean(data.isVeg) : true,
      isAvailable: data.isAvailable !== undefined ? Boolean(data.isAvailable) : true,
      isDeleted: false,
      sizes: Array.isArray(data.sizes) ? data.sizes : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    store.items.push(newItem);
    writeStore(store);
    return newItem;
  }

  static async findByIdAndUpdate(id, updates) {
    if (isMongoConnected()) {
      const doc = await ItemModel.findByIdAndUpdate(id, updates, { new: true });
      return doc ? (doc.toObject ? doc.toObject() : doc) : null;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Item model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    const index = (store.items || []).findIndex(i => i._id === id);
    if (index === -1) return null;

    store.items[index] = {
      ...store.items[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    writeStore(store);
    return store.items[index];
  }

  static async softDelete(id) {
    return this.findByIdAndUpdate(id, { isDeleted: true });
  }

  static async restore(id) {
    return this.findByIdAndUpdate(id, { isDeleted: false });
  }

  static async toggleAvailability(id, isAvailable) {
    return this.findByIdAndUpdate(id, { isAvailable });
  }
}

module.exports = Item;
