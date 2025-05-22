const rateLimit = require('express-rate-limit');

// In-memory store for rate limiting
const store = new Map();

// Memory store implementation
const memoryStore = {
  increment: (key) => {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const record = store.get(key) || { count: 0, resetTime: now + windowMs };
    
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count += 1;
    }
    
    store.set(key, record);
    return record.count;
  },
  
  decrement: (key) => {
    const record = store.get(key);
    if (record) {
      record.count = Math.max(0, record.count - 1);
      store.set(key, record);
    }
  },
  
  resetKey: (key) => {
    store.delete(key);
  }
};

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: {
    increment: (key) => memoryStore.increment(key),
    decrement: (key) => memoryStore.decrement(key),
    resetKey: (key) => memoryStore.resetKey(key)
  }
});

// Stricter limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 failed attempts per hour
  message: 'Too many failed login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: {
    increment: (key) => memoryStore.increment(key),
    decrement: (key) => memoryStore.decrement(key),
    resetKey: (key) => memoryStore.resetKey(key)
  }
});

// Chemical allocation limiter
const allocationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each user to 10 allocation requests per minute
  message: 'Too many allocation requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId, // Rate limit by user instead of IP
  store: {
    increment: (key) => memoryStore.increment(key),
    decrement: (key) => memoryStore.decrement(key),
    resetKey: (key) => memoryStore.resetKey(key)
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  allocationLimiter
}; 