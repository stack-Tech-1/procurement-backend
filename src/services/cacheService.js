import NodeCache from 'node-cache';

// In-memory cache with TTL support
// Keys auto-expire, no manual cleanup needed
const memCache = new NodeCache({
  stdTTL: 300,          // default 5 minutes
  checkperiod: 60,      // check for expired keys every 60 seconds
  useClones: false,     // faster — don't deep-clone objects on get/set
  maxKeys: 1000         // prevent unbounded memory growth
});

// TTL constants in seconds
export const TTL = {
  SHORT:      parseInt(process.env.CACHE_TTL_SHORT)     || 60,      // 1 min  — live data like approval queue
  MEDIUM:     parseInt(process.env.CACHE_TTL_MEDIUM)    || 300,     // 5 mins — dashboard KPIs
  LONG:       parseInt(process.env.CACHE_TTL_LONG)      || 900,     // 15 mins — vendor lists, reports
  VERY_LONG:  parseInt(process.env.CACHE_TTL_VERY_LONG) || 3600,    // 1 hour — static data like CSI materials
  NO_CACHE:   0
};

const ENABLED = process.env.CACHE_ENABLED !== 'false';

export const cache = {

  // Get a value. Returns undefined if miss or cache disabled.
  get(key) {
    if (!ENABLED) return undefined;
    return memCache.get(key);
  },

  // Set a value with TTL in seconds.
  set(key, value, ttl = TTL.MEDIUM) {
    if (!ENABLED) return;
    memCache.set(key, value, ttl);
  },

  // Delete a specific key.
  del(key) {
    memCache.del(key);
  },

  // Delete all keys matching a prefix pattern.
  // e.g. invalidatePrefix('dashboard:') removes dashboard:kpis, dashboard:charts etc.
  invalidatePrefix(prefix) {
    const keys = memCache.keys();
    const matching = keys.filter(k => k.startsWith(prefix));
    if (matching.length > 0) {
      memCache.del(matching);
      console.log(`🗑️  Cache invalidated: ${matching.length} keys matching "${prefix}"`);
    }
  },

  // Wrap a function with caching.
  // If key exists return cached value.
  // Otherwise call fn(), cache the result, return it.
  async wrap(key, fn, ttl = TTL.MEDIUM) {
    if (!ENABLED) return fn();

    const cached = memCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = await fn();
    if (result !== null && result !== undefined) {
      memCache.set(key, result, ttl);
    }
    return result;
  },

  // Get cache statistics for the health endpoint
  stats() {
    const stats = memCache.getStats();
    return {
      keys: memCache.keys().length,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hits + stats.misses > 0
        ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1) + '%'
        : '0%',
      enabled: ENABLED
    };
  },

  // Flush the entire cache. Use after bulk operations.
  flush() {
    memCache.flushAll();
    console.log('🗑️  Cache flushed entirely');
  }
};
