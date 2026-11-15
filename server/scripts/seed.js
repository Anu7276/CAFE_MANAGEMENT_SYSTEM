/**
 * Production Database Seeder
 * Creates the initial owner account from ADMIN_EMAIL & ADMIN_PASSWORD environment variables.
 * Fails fast in production if required credentials are not supplied.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { readStore, writeStore } = require('../models/storeAdapter');

async function seed() {
  console.log('\n===============================================');
  console.log('  🌱 CAFÉ EMERALD - DATABASE SEED SCRIPT');
  console.log('===============================================\n');

  const isProd = process.env.NODE_ENV === 'production';
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  // 1. Production Credentials Check
  if (isProd) {
    if (!adminEmail || !adminPassword) {
      console.error('🛑 FATAL: ADMIN_EMAIL and ADMIN_PASSWORD environment variables are strictly required in production.');
      console.error('   Please provide them via your production deployment dashboard (e.g. Render / Railway).');
      process.exit(1);
    }
    if (adminPassword.length < 8) {
      console.error('🛑 FATAL: ADMIN_PASSWORD must be at least 8 characters long for production security.');
      process.exit(1);
    }
  }

  const effectiveEmail = adminEmail || 'admin@cafeemerald.com';
  const effectivePassword = adminPassword || 'DevAdmin@Emerald2026';
  const passwordHash = await bcrypt.hash(effectivePassword, 10);

  // 2. Check if MongoDB URI is available
  const mongoUri = process.env.MONGO_URI;
  if (mongoUri && mongoUri.startsWith('mongodb')) {
    try {
      console.log(`📡 Connecting to MongoDB at ${mongoUri.replace(/:([^:@]{1,})@/, ':****@')}...`);
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
      console.log('✓ Connected to MongoDB');

      // Define minimal Mongoose models for seeding
      const UserSchema = new mongoose.Schema({
        name: String,
        email: { type: String, unique: true },
        passwordHash: String,
        role: String,
        failedLoginAttempts: { type: Number, default: 0 },
        lockUntil: Date
      }, { timestamps: true });

      const SettingsSchema = new mongoose.Schema({
        acceptingOrders: { type: Boolean, default: true },
        cafeName: { type: String, default: 'Café Emerald' },
        tagline: { type: String, default: 'Artisanal Coffee & Gourmet Bakery' },
        gstin: { type: String, default: '' },
        fssai: { type: String, default: '' },
        address: { type: String, default: '' },
        phone: { type: String, default: '' },
        cgstRate: { type: Number, default: 2.5 },
        sgstRate: { type: Number, default: 2.5 },
        totalTables: { type: Number, default: 20 },
        updatedBy: String
      }, { timestamps: true });

      const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
      const SettingsModel = mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);

      // Upsert Owner
      const existingOwner = await UserModel.findOne({ email: effectiveEmail.toLowerCase() });
      if (existingOwner) {
        existingOwner.passwordHash = passwordHash;
        existingOwner.role = 'owner';
        existingOwner.failedLoginAttempts = 0;
        existingOwner.lockUntil = null;
        await existingOwner.save();
        console.log(`✓ Updated owner account: ${effectiveEmail} (role: owner)`);
      } else {
        await UserModel.create({
          name: 'Primary Owner',
          email: effectiveEmail.toLowerCase(),
          passwordHash,
          role: 'owner',
          failedLoginAttempts: 0
        });
        console.log(`✓ Provisioned initial owner account: ${effectiveEmail} (role: owner)`);
      }

      // Upsert Settings
      const existingSettings = await SettingsModel.findOne();
      if (!existingSettings) {
        await SettingsModel.create({
          acceptingOrders: true,
          cafeName: process.env.CAFE_NAME || 'Café Emerald',
          tagline: process.env.CAFE_TAGLINE || 'Artisanal Coffee & Gourmet Bakery',
          gstin: process.env.CAFE_GSTIN || '',
          fssai: process.env.CAFE_FSSAI || '',
          address: process.env.CAFE_ADDRESS || 'Ground Floor, Emerald Heights, MG Road, Pune, MH 411001',
          phone: process.env.CAFE_PHONE || '+91 98765 43210',
          cgstRate: 2.5,
          sgstRate: 2.5,
          totalTables: 20,
          updatedBy: effectiveEmail
        });
        console.log('✓ Initialized default business Settings document');
      }

      await mongoose.disconnect();
      console.log('✓ MongoDB connection closed');
    } catch (err) {
      console.warn(`⚠️ MongoDB seed failed or unavailable (${err.message}). Falling back to local store file...`);
    }
  }

  // 3. Seed / Update Local Store file
  try {
    const store = readStore();
    if (!store.users) store.users = [];

    const ownerIdx = store.users.findIndex(u => u.email.toLowerCase() === effectiveEmail.toLowerCase());
    if (ownerIdx >= 0) {
      store.users[ownerIdx].passwordHash = passwordHash;
      store.users[ownerIdx].role = 'owner';
      store.users[ownerIdx].failedLoginAttempts = 0;
      store.users[ownerIdx].lockUntil = null;
    } else {
      store.users.unshift({
        _id: 'usr_owner_' + Date.now(),
        name: 'Primary Owner',
        email: effectiveEmail.toLowerCase(),
        passwordHash,
        role: 'owner',
        failedLoginAttempts: 0,
        lockUntil: null
      });
    }

    if (!store.settings) {
      store.settings = {
        acceptingOrders: true,
        cafeName: process.env.CAFE_NAME || 'Café Emerald',
        tagline: process.env.CAFE_TAGLINE || 'Artisanal Coffee & Gourmet Bakery',
        gstin: process.env.CAFE_GSTIN || '',
        fssai: process.env.CAFE_FSSAI || '',
        address: process.env.CAFE_ADDRESS || 'Ground Floor, Emerald Heights, MG Road, Pune, MH 411001',
        phone: process.env.CAFE_PHONE || '+91 98765 43210',
        cgstRate: 2.5,
        sgstRate: 2.5,
        totalTables: 20,
        updatedAt: new Date().toISOString(),
        updatedBy: effectiveEmail
      };
    }

    writeStore(store);
    console.log(`✓ Local store updated with owner: ${effectiveEmail}`);
  } catch (err) {
    console.error('Error writing to local store:', err.message);
  }

  console.log('\n===============================================');
  console.log('  ✨ SEED COMPLETED SUCCESSFULLY');
  console.log('===============================================\n');
  process.exit(0);
}

seed().catch(err => {
  console.error('Fatal seed failure:', err);
  process.exit(1);
});
