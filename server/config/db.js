const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

let isMongoConnected = false;

const connectDB = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/cafe_emerald';
  try {
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
    isMongoConnected = true;
    console.log(`✓ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    isMongoConnected = false;
    console.log(`ℹ Local MongoDB not reachable (${error.message}).`);
    console.log(`✓ Active Data Layer: Fast Local Persistent JSON Store (server/data/store.json)`);
  }
};

const getStatus = () => isMongoConnected;

module.exports = { connectDB, getStatus };

