const Redis = require('redis');

const redisClient = Redis.createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 20) {
        console.error('Redis max retries reached. Stopping reconnection.');
        return false;
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
  // Don't crash on Redis errors, continue with degraded functionality
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

const connectRedis = async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('Redis connection error:', err);
    console.log('Application will continue without Redis caching');
  }
};

// Attempt initial connection
// connectRedis();

// Cache document for 5 minutes with error handling
const cacheDocument = async (docId, document) => {
  try {
    if (!redisClient.isReady) return;
    await redisClient.set(
      `doc:${docId}`,
      JSON.stringify(document),
      { EX: 300 } // 5 minutes
    );
  } catch (err) {
    console.error('Redis cache error:', err);
    // Continue without caching
  }
};

const getCachedDocument = async (docId) => {
  try {
    if (!redisClient.isReady) return null;
    const cached = await redisClient.get(`doc:${docId}`);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    console.error('Redis get cache error:', err);
    return null;
  }
};

const invalidateCache = async (docId) => {
  try {
    if (!redisClient.isReady) return;
    await redisClient.del(`doc:${docId}`);
  } catch (err) {
    console.error('Redis invalidate cache error:', err);
  }
};

module.exports = {
  redisClient,
  cacheDocument,
  getCachedDocument,
  invalidateCache
};