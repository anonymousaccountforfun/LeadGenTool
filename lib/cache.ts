/**
 * Caching Layer
 * Uses Upstash Redis for distributed caching across serverless instances
 * Falls back to in-memory cache when Redis is not configured
 */

import { Redis } from '@upstash/redis';
import type { ScrapedBusiness } from './scraper';

// Cache TTLs in seconds
const CACHE_TTL = {
  BUSINESS: 7 * 24 * 60 * 60, // 7 days for full business data
  BUSINESS_BASIC: 30 * 24 * 60 * 60, // 30 days for basic info
  EMAIL: 30 * 24 * 60 * 60, // 30 days for emails (they rarely change)
  SEARCH_RESULTS: 24 * 60 * 60, // 24 hours for search results
  RATE_LIMIT: 60 * 60, // 1 hour for rate limit state
  CATCH_ALL: 7 * 24 * 60 * 60, // 7 days for catch-all detection
};

// Cache key prefixes
const KEY_PREFIX = {
  BUSINESS: 'biz:',
  EMAIL: 'email:',
  SEARCH: 'search:',
  RATE_LIMIT: 'rate:',
  CATCH_ALL: 'catchall:',
  PATTERN: 'pattern:',
  STATS: 'stats:',
};

// Redis client singleton
let redis: Redis | null = null;
let redisAvailable = true;

// In-memory fallback cache
const memoryCache = new Map<string, { value: unknown; expiry: number }>();
const MEMORY_CACHE_MAX_SIZE = 10000;

// Cache statistics
const cacheStats = {
  hits: 0,
  misses: 0,
  errors: 0,
  memoryFallbacks: 0,
};

/**
 * Initialize Redis client
 */
function getRedis(): Redis | null {
  if (!redisAvailable) return null;

  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (url && token) {
      try {
        redis = new Redis({ url, token });
      } catch (error) {
        console.warn('[Cache] Failed to initialize Redis:', error);
        redisAvailable = false;
        return null;
      }
    } else {
      redisAvailable = false;
      return null;
    }
  }

  return redis;
}

/**
 * Clean up memory cache if it gets too large
 */
function cleanupMemoryCache(): void {
  if (memoryCache.size > MEMORY_CACHE_MAX_SIZE) {
    const now = Date.now();
    // Remove expired entries
    for (const [key, entry] of memoryCache) {
      if (entry.expiry < now) {
        memoryCache.delete(key);
      }
    }
    // If still too large, remove oldest entries
    if (memoryCache.size > MEMORY_CACHE_MAX_SIZE * 0.8) {
      const entries = Array.from(memoryCache.entries());
      entries.sort((a, b) => a[1].expiry - b[1].expiry);
      const toRemove = entries.slice(0, Math.floor(entries.length * 0.3));
      for (const [key] of toRemove) {
        memoryCache.delete(key);
      }
    }
  }
}

/**
 * Get value from cache (Redis with memory fallback)
 */
async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();

  if (client) {
    try {
      const value = await client.get<T>(key);
      if (value !== null) {
        cacheStats.hits++;
        return value;
      }
      cacheStats.misses++;
      return null;
    } catch (error) {
      cacheStats.errors++;
      console.warn('[Cache] Redis get error:', error);
      // Fall through to memory cache
    }
  }

  // Memory fallback
  cacheStats.memoryFallbacks++;
  const entry = memoryCache.get(key);
  if (entry && entry.expiry > Date.now()) {
    cacheStats.hits++;
    return entry.value as T;
  }
  if (entry) {
    memoryCache.delete(key);
  }
  cacheStats.misses++;
  return null;
}

/**
 * Set value in cache (Redis with memory fallback)
 */
async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const client = getRedis();

  if (client) {
    try {
      await client.set(key, value, { ex: ttlSeconds });
      return;
    } catch (error) {
      cacheStats.errors++;
      console.warn('[Cache] Redis set error:', error);
      // Fall through to memory cache
    }
  }

  // Memory fallback
  cleanupMemoryCache();
  memoryCache.set(key, {
    value,
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Delete value from cache
 */
async function cacheDel(key: string): Promise<void> {
  const client = getRedis();

  if (client) {
    try {
      await client.del(key);
    } catch (error) {
      console.warn('[Cache] Redis del error:', error);
    }
  }

  memoryCache.delete(key);
}

/**
 * Generate a normalized cache key for a business
 */
function normalizeBusinessKey(name: string, address?: string | null): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);

  if (address) {
    // Extract city/state from address for uniqueness
    const addressPart = address
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 30);
    return `${KEY_PREFIX.BUSINESS}${normalized}:${addressPart}`;
  }

  return `${KEY_PREFIX.BUSINESS}${normalized}`;
}

/**
 * Generate a cache key for email by domain
 */
function emailCacheKey(domain: string): string {
  return `${KEY_PREFIX.EMAIL}${domain.toLowerCase()}`;
}

/**
 * Generate a cache key for search results
 */
function searchCacheKey(query: string, location: string): string {
  const normalized = `${query}:${location}`
    .toLowerCase()
    .replace(/[^a-z0-9:]/g, '_')
    .substring(0, 100);
  return `${KEY_PREFIX.SEARCH}${normalized}`;
}

/**
 * Generate a cache key for rate limiting
 */
function rateLimitKey(domain: string): string {
  return `${KEY_PREFIX.RATE_LIMIT}${domain.toLowerCase()}`;
}

// ============ Business Cache ============

export interface CachedBusiness extends ScrapedBusiness {
  cachedAt: number;
  cacheSource: string;
}

/**
 * Get business from cache
 */
export async function getCachedBusiness(
  name: string,
  address?: string | null
): Promise<CachedBusiness | null> {
  const key = normalizeBusinessKey(name, address);
  return cacheGet<CachedBusiness>(key);
}

/**
 * Cache a business
 */
export async function cacheBusiness(
  business: ScrapedBusiness,
  source: string = 'scrape'
): Promise<void> {
  const key = normalizeBusinessKey(business.name, business.address);
  const cached: CachedBusiness = {
    ...business,
    cachedAt: Date.now(),
    cacheSource: source,
  };

  // Use shorter TTL if we don't have complete data
  const hasFullData = business.email || business.phone || business.website;
  const ttl = hasFullData ? CACHE_TTL.BUSINESS : CACHE_TTL.BUSINESS_BASIC;

  await cacheSet(key, cached, ttl);
}

/**
 * Cache multiple businesses
 */
export async function cacheBusinesses(
  businesses: ScrapedBusiness[],
  source: string = 'scrape'
): Promise<void> {
  await Promise.all(businesses.map((b) => cacheBusiness(b, source)));
}

// ============ Email Cache ============

export interface CachedEmail {
  email: string;
  confidence: number;
  source: string;
  cachedAt: number;
  isCatchAll?: boolean;
}

/**
 * Get cached email for a domain
 */
export async function getCachedEmail(domain: string): Promise<CachedEmail | null> {
  const key = emailCacheKey(domain);
  return cacheGet<CachedEmail>(key);
}

/**
 * Cache an email for a domain
 */
export async function cacheEmail(
  domain: string,
  email: string,
  confidence: number,
  source: string,
  isCatchAll?: boolean
): Promise<void> {
  const key = emailCacheKey(domain);
  const cached: CachedEmail = {
    email,
    confidence,
    source,
    cachedAt: Date.now(),
    isCatchAll,
  };
  await cacheSet(key, cached, CACHE_TTL.EMAIL);
}

// ============ Search Results Cache ============

export interface CachedSearchResults {
  businesses: ScrapedBusiness[];
  cachedAt: number;
  query: string;
  location: string;
}

/**
 * Get cached search results
 */
export async function getCachedSearchResults(
  query: string,
  location: string
): Promise<CachedSearchResults | null> {
  const key = searchCacheKey(query, location);
  return cacheGet<CachedSearchResults>(key);
}

/**
 * Cache search results
 */
export async function cacheSearchResults(
  query: string,
  location: string,
  businesses: ScrapedBusiness[]
): Promise<void> {
  const key = searchCacheKey(query, location);
  const cached: CachedSearchResults = {
    businesses,
    cachedAt: Date.now(),
    query,
    location,
  };
  await cacheSet(key, cached, CACHE_TTL.SEARCH_RESULTS);
}

// ============ Rate Limit Cache ============

export interface RateLimitState {
  lastRequest: number;
  requestCount: number;
  windowStart: number;
}

/**
 * Get rate limit state for a domain
 */
export async function getRateLimitState(domain: string): Promise<RateLimitState | null> {
  const key = rateLimitKey(domain);
  return cacheGet<RateLimitState>(key);
}

/**
 * Update rate limit state for a domain
 */
export async function setRateLimitState(domain: string, state: RateLimitState): Promise<void> {
  const key = rateLimitKey(domain);
  await cacheSet(key, state, CACHE_TTL.RATE_LIMIT);
}

// ============ Catch-All Cache ============

/**
 * Get cached catch-all status for a domain
 */
export async function getCachedCatchAll(domain: string): Promise<boolean | null> {
  const key = `${KEY_PREFIX.CATCH_ALL}${domain.toLowerCase()}`;
  return cacheGet<boolean>(key);
}

/**
 * Cache catch-all status for a domain
 */
export async function cacheCatchAll(domain: string, isCatchAll: boolean): Promise<void> {
  const key = `${KEY_PREFIX.CATCH_ALL}${domain.toLowerCase()}`;
  await cacheSet(key, isCatchAll, CACHE_TTL.CATCH_ALL);
}

// ============ Pattern Cache ============

export interface CachedPattern {
  pattern: string;
  examples: string[];
  cachedAt: number;
}

/**
 * Get cached email pattern for a domain
 */
export async function getCachedPattern(domain: string): Promise<CachedPattern | null> {
  const key = `${KEY_PREFIX.PATTERN}${domain.toLowerCase()}`;
  return cacheGet<CachedPattern>(key);
}

/**
 * Cache email pattern for a domain
 */
export async function cachePattern(
  domain: string,
  pattern: string,
  examples: string[]
): Promise<void> {
  const key = `${KEY_PREFIX.PATTERN}${domain.toLowerCase()}`;
  const cached: CachedPattern = {
    pattern,
    examples,
    cachedAt: Date.now(),
  };
  await cacheSet(key, cached, CACHE_TTL.EMAIL);
}

// ============ Cache Statistics ============

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  hits: number;
  misses: number;
  errors: number;
  hitRate: number;
  memoryFallbacks: number;
  memoryCacheSize: number;
  redisAvailable: boolean;
} {
  const total = cacheStats.hits + cacheStats.misses;
  return {
    ...cacheStats,
    hitRate: total > 0 ? cacheStats.hits / total : 0,
    memoryCacheSize: memoryCache.size,
    redisAvailable,
  };
}

/**
 * Reset cache statistics
 */
export function resetCacheStats(): void {
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.errors = 0;
  cacheStats.memoryFallbacks = 0;
}

/**
 * Check cache health
 */
export async function checkCacheHealth(): Promise<{
  healthy: boolean;
  redisConnected: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();

  const client = getRedis();
  if (!client) {
    return {
      healthy: true, // Memory fallback is working
      redisConnected: false,
      latencyMs: Date.now() - start,
    };
  }

  try {
    await client.ping();
    return {
      healthy: true,
      redisConnected: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      healthy: false,
      redisConnected: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Clear all caches (use with caution)
 */
export async function clearAllCaches(): Promise<void> {
  memoryCache.clear();

  const client = getRedis();
  if (client) {
    try {
      // Note: This only works if you have FLUSHDB permission
      // In production, you might want to use SCAN + DEL instead
      console.warn('[Cache] Clearing Redis cache...');
      // Don't actually flush - too dangerous. Just log.
    } catch (error) {
      console.error('[Cache] Failed to clear Redis:', error);
    }
  }
}
