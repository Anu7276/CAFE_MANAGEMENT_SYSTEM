const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { connectDB } = require('./config/db');
const { setupRedisAdapter } = require('./config/redis');
const { errorHandler } = require('./middleware/error');
const { apiLimiter } = require('./middleware/rateLimiter');

// Route Imports
const authRoutes = require('./routes/authRoutes');
const itemRoutes = require('./routes/itemRoutes');
const orderRoutes = require('./routes/orderRoutes');
const tableRoutes = require('./routes/tableRoutes');
const reportRoutes = require('./routes/reportRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

connectDB();

const app = express();
const server = http.createServer(app);

// Allowed origins for strict CORS
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Table-Sig', 'X-Requested-With']
};

// Setup Socket.io with auth & room segregation
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH']
  }
});
app.set('io', io);
setupRedisAdapter(io);

// Security & Parsing Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://res.cloudinary.com"],
      connectSrc: ["'self'", "ws:", "wss:", "http://localhost:*", "https://*"]
    }
  }
}));

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize({
  replaceWith: '_'
}));

// Apply global rate limiting to all /api routes
app.use('/api', apiLimiter);

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Serve static uploads
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/payments', paymentRoutes);

// Health check
app.get('/health', (req, res) => res.json({
  status: 'healthy',
  env: process.env.NODE_ENV || 'development',
  timestamp: new Date().toISOString()
}));

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

// Socket.io authenticated rooms:
// 1. Staff / Admin room ('admin_kds') requires valid JWT with staff or owner role
// 2. Customer tracking room ('order_<orderToken>') requires valid orderToken
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'emerald_super_secret_cafe_jwt_key_2026');
        socket.user = decoded;
      } catch (err) {
        // Token invalid or expired, continue as guest
      }
    }
    next();
  } catch (err) {
    next();
  }
});

io.on('connection', (socket) => {
  // If user is authenticated staff or owner, join kitchen / admin room
  if (socket.user && ['owner', 'staff', 'admin'].includes(socket.user.role)) {
    socket.join('admin_kds');
    console.log(`[Socket] Staff/Admin ${socket.user.name} (${socket.user.role}) joined 'admin_kds' room`);
  }

  // Allow customer to join only their specific order tracking room
  socket.on('join:order', (data) => {
    const orderToken = typeof data === 'string' ? data : data?.orderToken;
    if (orderToken && typeof orderToken === 'string' && orderToken.length >= 16) {
      const room = `order_${orderToken}`;
      socket.join(room);
      console.log(`[Socket] Customer joined private tracking room: ${room}`);
      socket.emit('joined:order', { room, success: true });
    }
  });

  // Allow admin client to explicitly join admin_kds if authenticated after connection
  socket.on('auth:staff', (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'emerald_super_secret_cafe_jwt_key_2026');
      if (['owner', 'staff', 'admin'].includes(decoded.role)) {
        socket.user = decoded;
        socket.join('admin_kds');
        socket.emit('auth:success', { role: decoded.role });
      }
    } catch (err) {
      socket.emit('auth:error', { message: 'Invalid or expired staff token' });
    }
  });

  socket.on('disconnect', () => {
    // Clean disconnection
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`  ☕ Café Emerald MERN Server (Secured P0)`);
  console.log(`  🌐 Server running on: http://localhost:${PORT}`);
  console.log(`  📡 WebSocket Socket.io with Room Auth enabled`);
  console.log(`  🛡️ Rate Limiting, Mongo Sanitize, Helmet active`);
  console.log(`=================================================\n`);
});
