const { readStore, writeStore } = require('./storeAdapter');

const DEFAULT_SETTINGS = {
  acceptingOrders: true,
  cafeName: process.env.CAFE_NAME || 'Café Emerald',
  tagline: process.env.CAFE_TAGLINE || 'Artisanal Coffee & Gourmet Bakery',
  gstin: process.env.CAFE_GSTIN || '',
  fssai: process.env.CAFE_FSSAI || '',
  address: process.env.CAFE_ADDRESS || 'MG Road, Pune, Maharashtra 411001',
  phone: process.env.CAFE_PHONE || '+91 98765 43210',
  currency: 'INR',
  currencySymbol: '₹',
  cgstRate: 2.5,
  sgstRate: 2.5,
  totalTables: 20,
  maxOpenOrdersPerTable: 3,
  requirePaymentBeforeKds: false,
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
