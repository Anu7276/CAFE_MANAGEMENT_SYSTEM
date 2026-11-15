const { readStore, writeStore } = require('./storeAdapter');

class Item {
  static async find(query = {}) {
    const store = readStore();
    let results = [...store.items];

    if (query.category && query.category !== 'all') {
      results = results.filter(i => i.category.toLowerCase() === query.category.toLowerCase());
    }

    if (query.isVeg !== undefined) {
      results = results.filter(i => i.isVeg === query.isVeg);
    }

    if (query.search) {
      const q = query.search.toLowerCase();
      results = results.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.description && i.description.toLowerCase().includes(q))
      );
    }

    return results;
  }

  static async findById(id) {
    const store = readStore();
    return store.items.find(i => i._id === id) || null;
  }

  static async create(data) {
    const store = readStore();
    const newItem = {
      _id: 'item_' + Date.now(),
      name: data.name,
      category: data.category,
      price: Number(data.price),
      description: data.description || '',
      image: data.image,
      emoji: data.emoji || '☕',
      isVeg: data.isVeg !== undefined ? data.isVeg : true,
      isAvailable: data.isAvailable !== undefined ? data.isAvailable : true,
      sizes: data.sizes || [],
      createdAt: new Date().toISOString()
    };
    store.items.unshift(newItem);
    writeStore(store);
    return newItem;
  }

  static async findByIdAndUpdate(id, updates) {
    const store = readStore();
    const index = store.items.findIndex(i => i._id === id);
    if (index === -1) return null;
    store.items[index] = { ...store.items[index], ...updates };
    writeStore(store);
    return store.items[index];
  }
}

module.exports = Item;

