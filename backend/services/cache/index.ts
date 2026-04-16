import { LRUCache } from 'lru-cache';

/**
 * Global LRU Cache for expensive tool responses.
 * Default ttl is 1 hour (3600000 ms).
 */
const toolCache = new LRUCache<string, any>({
  max: 500, // Maximum items in cache
  ttl: 1000 * 60 * 60, // 1 hour
});

export const cacheService = {
  /**
   * Get value from cache using a unique key.
   */
  get(key: string) {
    return toolCache.get(key);
  },

  /**
   * Set value in cache with a custom ttl if needed.
   */
  set(key: string, value: any, ttl: number | null = null) {
    toolCache.set(key, value, { ttl: ttl === null ? undefined : ttl });
  },

  /**
   * Generates a unique key for a tool call.
   */
  generateKey(toolName: string, args: any) {
    return `${toolName}:${JSON.stringify(args || {})}`;
  }
};

export default cacheService;
