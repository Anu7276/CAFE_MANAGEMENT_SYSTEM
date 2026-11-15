const { readStore, writeStore } = require('./storeAdapter');

const DEFAULT_SETTINGS = {
  acceptingOrders: true,
  cafeName: 'Café Emerald',
  tagline: 'Artisanal Coffee & Gourmet Bakery',
  gstin: '27AAAAA0000A1Z5',
  fssai: '11522018000452',
  address: 'Ground Floor, Emerald Heights, MG Road, Pune, MH 411001',
  phone: '+91 98765 43210',
  currency: 'INR',
  currencySymbol: '₹',
  cgstRate: 2.5,
  sgstRate: 2.5,
  totalTables: 20,
  updatedAt: new Date().toISOString()
};

class Settings {
  static async get() {
    const store = readStore();
    if (!store.settings) {
      store.settings = { ...DEFAULT_SETTINGS };
      writeStore(store);
    }
    return { ...DEFAULT_SETTINGS, ...store.settings };
  }

  static async update(updates, user = {}) {
    const store = readStore();
    const current = store.settings || { ...DEFAULT_SETTINGS };
    const next = {
      ...current,
      ...updates,
      updatedBy: user.email || 'admin',
      updatedAt: new Date().toISOString()
    };
    store.settings = next;
    writeStore(store);
    return next;
  }
}

module.exports = Settings;
