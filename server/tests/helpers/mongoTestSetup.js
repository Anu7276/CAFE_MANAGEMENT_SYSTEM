const mongoose = require('mongoose');

let mongod = null;

/**
 * Connects to real MongoDB for testing.
 * Uses process.env.MONGO_URI if provided (e.g. in CI or Docker),
 * otherwise starts an in-memory real MongoDB server via mongodb-memory-server.
 */
async function setupMongoTest() {
  let uri = process.env.MONGO_URI;

  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  }

  // Ensure any prior connection is disconnected
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  });

  const Order = require('../../models/Order');
  const InvoiceSequence = require('../../models/InvoiceSequence');

  // Build schema indexes (including unique indexes on orderToken and invoiceNumber)
  if (Order.mongooseModel) {
    await Order.mongooseModel.init();
  }
  if (InvoiceSequence.mongooseModel) {
    await InvoiceSequence.mongooseModel.init();
  }

  return { uri, mongod };
}

/**
 * Tears down database connection and stops in-memory server if active
 */
async function teardownMongoTest() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

module.exports = {
  setupMongoTest,
  teardownMongoTest
};
