/**
 * Cache Pre-warming Module
 * Pre-fetches and warms cache for popular queries
 */

import {
  getCachedSearchResults,
  cacheSearchResults,
  getCacheStats,
  checkCacheHealth,
} from './cache';
import { discover } from './scraper';

// Popular query templates by industry
const POPULAR_QUERIES = [
  // Food & Beverage
  { query: 'restaurants', locations: ['austin tx', 'denver co', 'miami fl', 'seattle wa'] },
  { query: 'coffee shops', locations: ['new york ny', 'los angeles ca', 'chicago il'] },
  { query: 'bakeries', locations: ['boston ma', 'portland or', 'san francisco ca'] },

  // Home Services
  { query: 'plumbers', locations: ['houston tx', 'phoenix az', 'dallas tx'] },
  { query: 'electricians', locations: ['atlanta ga', 'philadelphia pa'] },
  { query: 'hvac contractors', locations: ['las vegas nv', 'san diego ca'] },

  // Professional Services
  { query: 'lawyers', locations: ['new york ny', 'los angeles ca', 'chicago il'] },
  { query: 'accountants', locations: ['houston tx', 'dallas tx'] },
  { query: 'real estate agents', locations: ['miami fl', 'denver co'] },

  // Health & Wellness
  { query: 'dentists', locations: ['seattle wa', 'san francisco ca'] },
  { query: 'chiropractors', locations: ['phoenix az', 'atlanta ga'] },
  { query: 'gyms', locations: ['austin tx', 'boston ma'] },

  // Auto Services
  { query: 'auto repair', locations: ['houston tx', 'los angeles ca'] },
  { query: 'car wash', locations: ['miami fl', 'dallas tx'] },

  // Retail
  { query: 'pet stores', locations: ['new york ny', 'seattle wa'] },
  { query: 'florists', locations: ['chicago il', 'san diego ca'] },
];

interface WarmupResult {
  query: string;
  location: string;
  cached: boolean;
  refreshed: boolean;
  businessCount: number;
  error?: string;
}

interface WarmupStats {
  total: number;
  cached: number;
  refreshed: number;
  errors: number;
  results: WarmupResult[];
}

/**
 * Check if a cached entry needs refreshing
 */
function needsRefresh(cachedAt: number, maxAgeHours: number = 12): boolean {
  const ageMs = Date.now() - cachedAt;
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  return ageMs > maxAgeMs;
}

/**
 * Pre-warm cache for a single query/location pair
 */
async function warmQuery(
  query: string,
  location: string,
  forceRefresh: boolean = false
): Promise<WarmupResult> {
  try {
    // Check if already cached
    const cached = await getCachedSearchResults(query, location);

    if (cached && !forceRefresh && !needsRefresh(cached.cachedAt)) {
      return {
        query,
        location,
        cached: true,
        refreshed: false,
        businessCount: cached.businesses.length,
      };
    }

    // Need to fetch fresh data
    console.log(`[CacheWarmer] Warming: "${query}" in "${location}"`);

    const businesses = await discover(query, location, 50, undefined, undefined);

    // Cache the results
    await cacheSearchResults(query, location, businesses);

    return {
      query,
      location,
      cached: false,
      refreshed: cached !== null,
      businessCount: businesses.length,
    };
  } catch (error) {
    return {
      query,
      location,
      cached: false,
      refreshed: false,
      businessCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Pre-warm cache for popular queries
 * Runs in batches to avoid overwhelming the system
 */
export async function warmPopularQueries(
  options: {
    maxQueries?: number;
    forceRefresh?: boolean;
    onProgress?: (completed: number, total: number, result: WarmupResult) => void;
  } = {}
): Promise<WarmupStats> {
  const { maxQueries = 20, forceRefresh = false, onProgress } = options;

  // Build list of query/location pairs
  const pairs: { query: string; location: string }[] = [];
  for (const item of POPULAR_QUERIES) {
    for (const location of item.locations) {
      pairs.push({ query: item.query, location });
      if (pairs.length >= maxQueries) break;
    }
    if (pairs.length >= maxQueries) break;
  }

  const stats: WarmupStats = {
    total: pairs.length,
    cached: 0,
    refreshed: 0,
    errors: 0,
    results: [],
  };

  // Process queries sequentially to avoid rate limiting
  for (let i = 0; i < pairs.length; i++) {
    const { query, location } = pairs[i];
    const result = await warmQuery(query, location, forceRefresh);

    stats.results.push(result);

    if (result.cached) stats.cached++;
    else if (result.refreshed) stats.refreshed++;
    if (result.error) stats.errors++;

    onProgress?.(i + 1, pairs.length, result);

    // Small delay between queries to be nice to APIs
    if (i < pairs.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(`[CacheWarmer] Completed: ${stats.cached} cached, ${stats.refreshed} refreshed, ${stats.errors} errors`);

  return stats;
}

/**
 * Warm cache for a specific list of queries
 */
export async function warmSpecificQueries(
  queries: { query: string; location: string }[],
  forceRefresh: boolean = false
): Promise<WarmupStats> {
  const stats: WarmupStats = {
    total: queries.length,
    cached: 0,
    refreshed: 0,
    errors: 0,
    results: [],
  };

  for (const { query, location } of queries) {
    const result = await warmQuery(query, location, forceRefresh);
    stats.results.push(result);

    if (result.cached) stats.cached++;
    else if (result.refreshed) stats.refreshed++;
    if (result.error) stats.errors++;
  }

  return stats;
}

/**
 * Get cache health status
 */
export async function getCacheHealthStatus(): Promise<{
  healthy: boolean;
  stats: ReturnType<typeof getCacheStats>;
  latencyMs: number;
}> {
  const healthCheck = await checkCacheHealth();
  const stats = getCacheStats();

  return {
    healthy: healthCheck.healthy,
    stats,
    latencyMs: healthCheck.latencyMs,
  };
}

/**
 * Warm cache based on recent search history
 */
export async function warmFromHistory(
  recentQueries: { query: string; location: string }[],
  limit: number = 10
): Promise<WarmupStats> {
  // Deduplicate queries
  const uniqueQueries = new Map<string, { query: string; location: string }>();
  for (const q of recentQueries) {
    const key = `${q.query.toLowerCase()}:${q.location.toLowerCase()}`;
    if (!uniqueQueries.has(key)) {
      uniqueQueries.set(key, q);
    }
    if (uniqueQueries.size >= limit) break;
  }

  return warmSpecificQueries(Array.from(uniqueQueries.values()));
}

/**
 * Background cache maintenance
 * Refreshes stale entries and removes expired ones
 */
export async function maintainCache(): Promise<{
  refreshed: number;
  errors: number;
}> {
  // This would be called periodically by a cron job
  // For now, just refresh popular queries that are stale
  const stats = await warmPopularQueries({
    maxQueries: 10,
    forceRefresh: false, // Only refresh if stale
  });

  return {
    refreshed: stats.refreshed,
    errors: stats.errors,
  };
}
