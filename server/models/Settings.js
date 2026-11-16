const mongoose = require('mongoose');
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
  onlinePaymentEnabled: true,
  updatedAt: new Date().toISOString()
};

const settingsSchema = new mongoose.Schema({
  acceptingOrders: { type: Boolean, default: true },
  cafeName: { type: String, default: 'Café Emerald' },
  tagline: { type: String, default: 'Artisanal Coffee & Gourmet Bakery' },
  gstin: { type: String, default: '' },
  fssai: { type: String, default: '' },
  address: { type: String, default: 'MG Road, Pune, Maharashtra 411001' },
  phone: { type: String, default: '+91 98765 43210' },
  currency: { type: String, default: 'INR' },
  currencySymbol: { type: String, default: '₹' },
  cgstRate: { type: Number, default: 2.5 },
  sgstRate: { type: Number, default: 2.5 },
  totalTables: { type: Number, default: 20 },
  maxOpenOrdersPerTable: { type: Number, default: 3 },
  requirePaymentBeforeKds: { type: Boolean, default: false },
  onlinePaymentEnabled: { type: Boolean, default: true },
  updatedBy: { type: String, default: 'admin' }
}, {
  timestamps: true
});

const SettingsModel = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

function isMongoConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

class Settings {
  static get mongooseModel() {
    return SettingsModel;
  }

  static async get() {
    if (isMongoConnected()) {
      let doc = await SettingsModel.findOne();
      if (!doc) {
        doc = await SettingsModel.create(DEFAULT_SETTINGS);
      }
      return { ...DEFAULT_SETTINGS, ...(doc.toObject ? doc.toObject() : doc) };
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Settings model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    if (!store.settings) {
      store.settings = { ...DEFAULT_SETTINGS };
      writeStore(store);
    }
    return { ...DEFAULT_SETTINGS, ...store.settings };
  }

  static async update(updates, user = {}) {
    if (isMongoConnected()) {
      const doc = await SettingsModel.findOneAndUpdate(
        {},
        { ...updates, updatedBy: user.email || 'admin' },
        { new: true, upsert: true }
      );
      return { ...DEFAULT_SETTINGS, ...(doc.toObject ? doc.toObject() : doc) };
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Settings model cannot use dev store fallback in production. MongoDB connection is required.');
    }

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
