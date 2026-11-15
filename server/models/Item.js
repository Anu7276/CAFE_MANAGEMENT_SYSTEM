const { readStore, writeStore } = require('./storeAdapter');

class Item {
  static async find(query = {}) {
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
    const store = readStore();
    return (store.items || []).find(i => i._id === id) || null;
  }

  static async create(data) {
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

    store.items.unshift(newItem);
    writeStore(store);
    return newItem;
  }

  static async findByIdAndUpdate(id, updates) {
    const store = readStore();
    if (!store.items) store.items = [];
    const index = store.items.findIndex(i => i._id === id);
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
    return this.findByIdAndUpdate(id, {
      isDeleted: true,
      deletedAt: new Date().toISOString()
    });
  }

  static async restore(id) {
    return this.findByIdAndUpdate(id, {
      isDeleted: false,
      deletedAt: null
    });
  }
}

module.exports = Item;
