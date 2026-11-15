const mongoose = require('mongoose');

let isMongoConnected = false;

const connectDB = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/cafe_emerald';
  try {
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 });
    isMongoConnected = true;
    console.log(`✓ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`\n======================================================`);
      console.error(`❌ FATAL PRODUCTION ERROR: MongoDB connection failed!`);
      console.error(`   Message: ${error.message}`);
      console.error(`   In-memory / JSON fallback is strictly disabled in production.`);
      console.error(`======================================================\n`);
      process.exit(1);
    }
    isMongoConnected = false;
    console.log(`ℹ Local MongoDB not reachable (${error.message}).`);
    console.log(`✓ Active Data Layer: Fast Local Persistent Store (server/data/store.json) [DEV ONLY]`);
  }
};

const getStatus = () => isMongoConnected;

module.exports = { connectDB, getStatus };
