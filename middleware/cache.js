const mongoose = require('mongoose');

// In-memory cache store
const cacheStore = new Map();

// Default cache duration (1 hour)
const DEFAULT_CACHE_DURATION = 3600;

// Generate cache key from request
const generateCacheKey = (req) => {
  const { originalUrl, query, user } = req;
  return `${user?.role || 'public'}:${originalUrl}:${JSON.stringify(query)}`;
};

// Cache middleware
const cache = (duration = DEFAULT_CACHE_DURATION) => {
  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const key = generateCacheKey(req);
    const now = Date.now();

    try {
      // Check cache
      const cachedData = cacheStore.get(key);
      if (cachedData && (now - cachedData.timestamp) < duration * 1000) {
        return res.json(cachedData.data);
      }

      // Store original res.json
      const originalJson = res.json;

      // Override res.json method
      res.json = function(data) {
        // Cache the response
        cacheStore.set(key, {
          data,
          timestamp: now
        });
        
        // Call original res.json
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache error:', error);
      next();
    }
  };
};

// Clear cache for specific pattern
const clearCache = (pattern) => {
  try {
    for (const [key] of cacheStore) {
      if (key.includes(pattern)) {
        cacheStore.delete(key);
      }
    }
  } catch (error) {
    console.error('Cache clear error:', error);
  }
};

// Clear cache middleware
const clearCacheMiddleware = (pattern) => {
  return async (req, res, next) => {
    // Store original res.json
    const originalJson = res.json;

    // Override res.json method
    res.json = async function(data) {
      // Clear cache after successful operation
      clearCache(pattern);
      
      // Call original res.json
      return originalJson.call(this, data);
    };

    next();
  };
};

// Enable MongoDB query caching
mongoose.set('debug', false);
mongoose.set('cache', true);

module.exports = {
  cache,
  clearCache,
  clearCacheMiddleware
}; 