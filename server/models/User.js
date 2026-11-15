const bcrypt = require('bcryptjs');
const { readStore, writeStore } = require('./storeAdapter');

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

class User {
  static async findOne(query) {
    const store = readStore();
    return store.users.find(u => {
      if (query.email && u.email.toLowerCase() === query.email.toLowerCase()) return true;
      if (query._id && u._id === query._id) return true;
      return false;
    }) || null;
  }

  static async findById(id) {
    const store = readStore();
    return store.users.find(u => u._id === id) || null;
  }

  static async create(data) {
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
    const store = readStore();
    const user = store.users.find(u => u._id === userId);
    if (!user) return;

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    writeStore(store);
    return user;
  }

  static async comparePassword(candidate, hash) {
    return await bcrypt.compare(candidate, hash);
  }
}

module.exports = User;
