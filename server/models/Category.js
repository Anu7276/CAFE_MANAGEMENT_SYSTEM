const { readStore } = require('./storeAdapter');

class Category {
  static async find() {
    const store = readStore();
    return [...store.categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }
}

module.exports = Category;

