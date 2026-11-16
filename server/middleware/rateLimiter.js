const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');

let sharedRedisClient = null;

function getSharedRedisClient() {
  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST;
  if (!redisUrl && !redisHost) return null;

  if (!sharedRedisClient) {
    try {
      const options = {
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false
      };
      sharedRedisClient = redisUrl
        ? new Redis(redisUrl, options)
        : new Redis({ host: redisHost, port: process.env.REDIS_PORT || 6379, ...options });
      sharedRedisClient.on('error', () => {
        // Fallback silently if redis connection fails
      });
    } catch (e) {
      return null;
    }
  }
  return sharedRedisClient;
}

function createLimiterStore(prefix) {
  const client = getSharedRedisClient();
  if (!client) return undefined; // express-rate-limit in-memory store fallback

  return new RedisStore({
    sendCommand: (...args) => client.call(...args),
    prefix: `rl:${prefix}:`
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  store: createLimiterStore('login'),
  message: {
    success: false,
    message: 'Too many login attempts from this IP. Please try again after 15 minutes.'
  }
});

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25, // 25 order submissions per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  store: createLimiterStore('order'),
  message: {
    success: false,
    message: 'Too many orders placed from this network. Please check with café staff.'
  }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: createLimiterStore('api'),
  message: {
    success: false,
    message: 'Too many requests. Please slow down.'
  }
});

module.exports = {
  loginLimiter,
  orderLimiter,
  apiLimiter,
  createLimiterStore,
  getSharedRedisClient
};
