import { cache, TTL } from '../services/cacheService.js';

// Re-export TTL so route files can do a single import from this module
export { TTL };

// Route-level cache middleware.
// Usage: router.get('/endpoint', cacheRoute(TTL.MEDIUM), handler)
// The cache key includes the full URL and the logged-in user's ID
// so different users never see each other's cached data.

export const cacheRoute = (ttl = TTL.MEDIUM) => {
  return (req, res, next) => {
    if (process.env.CACHE_ENABLED === 'false') return next();

    // Never cache non-GET requests
    if (req.method !== 'GET') return next();

    // Build cache key: userId + full URL with query params
    const userId = req.user?.id || 'public';
    const key = `route:${userId}:${req.originalUrl}`;

    const cached = cache.get(key);
    if (cached !== undefined) {
      // Serve from cache — add header so you can see in network tab
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Key', key);
      return res.json(cached);
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, data, ttl);
        res.setHeader('X-Cache', 'MISS');
      }
      return originalJson(data);
    };

    next();
  };
};

// User-scoped cache: key includes userId
// Use for data that is specific to the logged-in user
export const cacheForUser = (ttl = TTL.MEDIUM) => cacheRoute(ttl);

// Public cache: key does NOT include userId
// Use for data that is the same for all users (e.g. branding, CSI materials)
export const cachePublic = (ttl = TTL.LONG) => {
  return (req, res, next) => {
    if (process.env.CACHE_ENABLED === 'false') return next();
    if (req.method !== 'GET') return next();

    const key = `public:${req.originalUrl}`;
    const cached = cache.get(key);

    if (cached !== undefined) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, data, ttl);
        res.setHeader('X-Cache', 'MISS');
      }
      return originalJson(data);
    };

    next();
  };
};
