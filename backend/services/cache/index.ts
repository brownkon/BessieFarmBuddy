const { LRUCache } = require('lru-cache');

/**
 * Global LRU Cache for expensive tool responses.
 * Default ttl is 1 hour (3600000 ms).
 */
const toolCache = new LRUCache({
  max: 500, // Maximum items in cache
  ttl: 1000 * 60 * 60, // 1 hour
});

const cacheService = {
  /**
   * Get value from cache using a unique key.
   */
  get(key) {
    return toolCache.get(key);
  },

  /**
   * Set value in cache with a custom ttl if needed.
   */
  set(key, value, ttl = null) {
    toolCache.set(key, value, { ttl });
  },

  /**
   * Generates a unique key for a tool call.
   */
  generateKey(toolName, args) {
    return `${toolName}:${JSON.stringify(args || {})}`;
  }
};

module.exports = cacheService;
