const bcrypt = require('bcryptjs');
const { readStore, writeStore } = require('./storeAdapter');

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
      role: data.role || 'customer',
      createdAt: new Date().toISOString()
    };
    store.users.push(newUser);
    writeStore(store);
    return newUser;
  }

  static async comparePassword(candidate, hash) {
    return await bcrypt.compare(candidate, hash);
  }
}

module.exports = User;

