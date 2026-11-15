const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { connectDB } = require('./config/db');
const { errorHandler } = require('./middleware/error');

// Route Imports
const authRoutes = require('./routes/authRoutes');
const itemRoutes = require('./routes/itemRoutes');
const orderRoutes = require('./routes/orderRoutes');

connectDB();

const app = express();
const server = http.createServer(app);

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH']
  }
});
app.set('io', io);

// Global Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/orders', orderRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'healthy', timestamp: new Date() }));

// Production client serving (if built)
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handling middleware
app.use(errorHandler);

// Socket.io connection events
io.on('connection', (socket) => {
  console.log(`✓ Socket client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`✕ Socket client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`  ☕ Café Emerald MERN Server`);
  console.log(`  🌐 Server running on: http://localhost:${PORT}`);
  console.log(`  📡 WebSocket Socket.io enabled`);
  console.log(`=================================================\n`);
});

