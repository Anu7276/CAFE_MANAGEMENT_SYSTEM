const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { readStore, writeStore } = require('./storeAdapter');

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

const userSchema = new mongoose.Schema({
  _id: { type: String },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'staff', enum: ['owner', 'staff', 'kitchen'] },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null }
}, {
  timestamps: true,
  _id: false
});

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

function isMongoConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

class User {
  static get mongooseModel() {
    return UserModel;
  }

  static async findOne(query) {
    if (isMongoConnected()) {
      const mongoQuery = {};
      if (query.email) mongoQuery.email = query.email.toLowerCase();
      if (query._id) mongoQuery._id = query._id;
      const doc = await UserModel.findOne(mongoQuery);
      return doc ? (doc.toObject ? doc.toObject() : doc) : null;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: User model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    return store.users.find(u => {
      if (query.email && u.email.toLowerCase() === query.email.toLowerCase()) return true;
      if (query._id && u._id === query._id) return true;
      return false;
    }) || null;
  }

  static async findById(id) {
    if (isMongoConnected()) {
      const doc = await UserModel.findById(id);
      return doc ? (doc.toObject ? doc.toObject() : doc) : null;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: User model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    return store.users.find(u => u._id === id) || null;
  }

  static async create(data) {
    if (isMongoConnected()) {
      const doc = await UserModel.create({
        _id: 'usr_' + Date.now(),
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash: await bcrypt.hash(data.password, 10),
        role: data.role || 'staff',
        failedLoginAttempts: 0,
        lockUntil: null
      });
      return doc.toObject ? doc.toObject() : doc;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: User model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    const newUser = {
      _id: 'usr_' + Date.now(),
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash: await bcrypt.hash(data.password, 10),
      role: data.role || 'staff',
      failedLoginAttempts: 0,
      lockUntil: null,
      createdAt: new Date().toISOString()
    };
    store.users.push(newUser);
    writeStore(store);
    return newUser;
  }

  static isLocked(user) {
    return !!(user.lockUntil && new Date(user.lockUntil).getTime() > Date.now());
  }

  static async registerFailedAttempt(userId) {
    if (isMongoConnected()) {
      const user = await UserModel.findById(userId);
      if (!user) return;
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
      }
      await user.save();
      return user.toObject ? user.toObject() : user;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: User model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    const user = store.users.find(u => u._id === userId);
    if (!user) return;

    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_TIME_MS).toISOString();
    }
    writeStore(store);
    return user;
  }

  static async resetFailedAttempts(userId) {
    if (isMongoConnected()) {
      const user = await UserModel.findById(userId);
      if (!user) return;
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();
      return user.toObject ? user.toObject() : user;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: User model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    const user = store.users.find(u => u._id === userId);
    if (!user) return;

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    writeStore(store);
    return user;
  }

  static async find(query = {}) {
    if (isMongoConnected()) {
      const mongoQuery = {};
      if (query.role) mongoQuery.role = query.role;
      const docs = await UserModel.find(mongoQuery).sort({ createdAt: -1 });
      return docs.map(d => (d.toObject ? d.toObject() : d));
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: User model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    let users = [...(store.users || [])];
    if (query.role) {
      users = users.filter(u => u.role === query.role);
    }
    return users.map(u => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      isLocked: this.isLocked(u),
      createdAt: u.createdAt
    }));
  }

  static async findByIdAndDelete(id) {
    if (isMongoConnected()) {
      const deleted = await UserModel.findByIdAndDelete(id);
      return deleted ? (deleted.toObject ? deleted.toObject() : deleted) : null;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: User model cannot use dev store fallback in production. MongoDB connection is required.');
    }

    const store = readStore();
    const index = (store.users || []).findIndex(u => u._id === id);
    if (index === -1) return null;
    const deleted = store.users.splice(index, 1)[0];
    writeStore(store);
    return deleted;
  }

  static async comparePassword(candidate, hash) {
    return await bcrypt.compare(candidate, hash);
  }
}

module.exports = User;
