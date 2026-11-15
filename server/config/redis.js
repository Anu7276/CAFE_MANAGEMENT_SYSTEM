let redisAdapter = null;

async function setupRedisAdapter(io) {
  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST;

  if (!redisUrl && !redisHost) {
    console.log('ℹ REDIS_URL not configured: using high-performance local in-memory WebSocket adapter');
    return null;
  }

  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const Redis = require('ioredis');

    const options = {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 5) {
          console.warn('⚠️ Redis connection attempts exceeded limit; using memory adapter fallback');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 2000);
      }
    };

    const pubClient = redisUrl ? new Redis(redisUrl, options) : new Redis({ host: redisHost, port: process.env.REDIS_PORT || 6379, ...options });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => {
      console.warn(`[Redis Pub Error] ${err.message}`);
    });

    subClient.on('error', (err) => {
      console.warn(`[Redis Sub Error] ${err.message}`);
    });

    await Promise.all([
      new Promise((resolve) => pubClient.once('ready', resolve)),
      new Promise((resolve) => subClient.once('ready', resolve))
    ]);

    io.adapter(createAdapter(pubClient, subClient));
    console.log('✓ Multi-Instance Realtime Enabled: Socket.IO Redis Adapter connected');
    return { pubClient, subClient };
  } catch (err) {
    console.warn(`⚠️ Failed to connect Redis adapter (${err.message}). Falling back to local adapter.`);
    return null;
  }
}

module.exports = { setupRedisAdapter };
