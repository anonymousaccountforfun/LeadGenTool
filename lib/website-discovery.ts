/**
 * Website Discovery Module
 * Finds missing websites for businesses using search engines and directories
 */

import { googleSearch, bingSearch, duckDuckGoSearch, extractWebsiteFromResults } from './search-engines';
import { scrapeAllDirectories, getBestWebsite } from './directory-scraper';

export interface WebsiteDiscoveryResult {
  website: string;
  source: 'google' | 'bing' | 'duckduckgo' | 'yelp' | 'yellowpages' | 'bbb';
  confidence: number;
}

// Cache for website discoveries
const websiteCache = new Map<string, { website: string | null; timestamp: number }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Generate cache key for business
 */
function getCacheKey(name: string, location: string): string {
  return `${name.toLowerCase().trim()}|${location.toLowerCase().trim()}`;
}

/**
 * Check cache for website
 */
function getCachedWebsite(name: string, location: string): string | null | undefined {
  const key = getCacheKey(name, location);
  const cached = websiteCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.website;
  }

  return undefined; // Not in cache (different from null = searched but not found)
}

/**
 * Cache website result
 */
function cacheWebsite(name: string, location: string, website: string | null): void {
  const key = getCacheKey(name, location);
  websiteCache.set(key, { website, timestamp: Date.now() });
}

/**
 * Validate discovered website
 */
function isValidWebsite(url: string, businessName: string): boolean {
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // Skip directory sites
    const skipDomains = [
      'yelp.com', 'yellowpages.com', 'bbb.org', 'facebook.com',
      'instagram.com', 'twitter.com', 'linkedin.com', 'google.com',
      'bing.com', 'mapquest.com', 'foursquare.com', 'tripadvisor.com',
      'angi.com', 'angieslist.com', 'homeadvisor.com', 'thumbtack.com',
      'nextdoor.com', 'manta.com', 'merchantcircle.com', 'superpages.com',
      'citysearch.com', 'local.com', 'chamberofcommerce.com',
      'youtube.com', 'pinterest.com', 'tiktok.com',
    ];

    if (skipDomains.some(d => domain.includes(d))) {
      return false;
    }

    // Domain should have at least one dot
    if (!domain.includes('.')) return false;

    // Domain name (without TLD) should be reasonable length
    const domainName = domain.split('.')[0];
    if (domainName.length < 2 || domainName.length > 63) return false;

    // Optionally: check if domain relates to business name
    const nameParts = businessName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(p => p.length > 2);

    // If we have name parts, at least one should be in domain or it should be a short domain
    if (nameParts.length > 0 && domainName.length > 10) {
      const hasMatch = nameParts.some(part => domainName.includes(part));
      if (!hasMatch) {
        // Allow if it's a common abbreviation pattern
        const initials = nameParts.map(p => p[0]).join('');
        if (!domainName.includes(initials) && domainName.length > 15) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Search engines for website
 */
async function searchEnginesForWebsite(
  name: string,
  location: string
): Promise<WebsiteDiscoveryResult | null> {
  const query = `${name} ${location} official website`;

  // Run searches in parallel
  const [googleResults, bingResults, ddgResults] = await Promise.all([
    googleSearch(query).catch(() => []),
    bingSearch(query).catch(() => []),
    duckDuckGoSearch(query).catch(() => []),
  ]);

  // Try Google first
  const googleWebsite = extractWebsiteFromResults(googleResults, name);
  if (googleWebsite && isValidWebsite(googleWebsite, name)) {
    return { website: googleWebsite, source: 'google', confidence: 0.80 };
  }

  // Try Bing
  const bingWebsite = extractWebsiteFromResults(bingResults, name);
  if (bingWebsite && isValidWebsite(bingWebsite, name)) {
    return { website: bingWebsite, source: 'bing', confidence: 0.75 };
  }

  // Try DuckDuckGo
  const ddgWebsite = extractWebsiteFromResults(ddgResults, name);
  if (ddgWebsite && isValidWebsite(ddgWebsite, name)) {
    return { website: ddgWebsite, source: 'duckduckgo', confidence: 0.70 };
  }

  return null;
}

/**
 * Search directories for website
 */
async function searchDirectoriesForWebsite(
  name: string,
  location: string
): Promise<WebsiteDiscoveryResult | null> {
  const results = await scrapeAllDirectories(name, location);

  for (const result of results) {
    if (result.website && isValidWebsite(result.website, name)) {
      return {
        website: result.website,
        source: result.source,
        confidence: 0.75,
      };
    }
  }

  return null;
}

/**
 * Find missing website for a business
 * Searches multiple sources and returns the best match
 */
export async function findMissingWebsite(
  name: string,
  location: string
): Promise<WebsiteDiscoveryResult | null> {
  // Check cache first
  const cached = getCachedWebsite(name, location);
  if (cached !== undefined) {
    if (cached === null) return null;
    return { website: cached, source: 'google', confidence: 0.80 }; // Cached result
  }

  // Run search engines and directories in parallel
  const [searchResult, directoryResult] = await Promise.all([
    searchEnginesForWebsite(name, location).catch(() => null),
    searchDirectoriesForWebsite(name, location).catch(() => null),
  ]);

  // Prefer search engine results (usually more accurate)
  let bestResult = searchResult;

  // If no search result, use directory
  if (!bestResult && directoryResult) {
    bestResult = directoryResult;
  }

  // If both found the same website, boost confidence
  if (searchResult && directoryResult && searchResult.website === directoryResult.website) {
    bestResult = {
      ...searchResult,
      confidence: Math.min(0.90, searchResult.confidence + 0.10),
    };
  }

  // Cache the result
  cacheWebsite(name, location, bestResult?.website || null);

  return bestResult;
}

/**
 * Find websites for multiple businesses in parallel
 */
export async function findMissingWebsitesBatch(
  businesses: Array<{ name: string; location: string }>,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<Map<string, WebsiteDiscoveryResult | null>> {
  const { concurrency = 2, onProgress } = options; // Low concurrency to avoid rate limits
  const results = new Map<string, WebsiteDiscoveryResult | null>();
  const queue = [...businesses];
  let completed = 0;

  async function worker() {
    while (queue.length > 0) {
      const business = queue.shift();
      if (!business) break;

      try {
        const result = await findMissingWebsite(business.name, business.location);
        results.set(business.name, result);
      } catch {
        results.set(business.name, null);
      }

      completed++;
      onProgress?.(completed, businesses.length);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, businesses.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}

/**
 * Clear website cache (for testing)
 */
export function clearWebsiteCache(): void {
  websiteCache.clear();
}

/**
 * Website classification result
 */
export interface WebsiteClassification {
  normalizedUrl: string;
  type: 'first-party' | 'social-media' | 'directory' | 'invalid';
  isUsableForEmail: boolean;
}

// Known social media domains that can't be used for email pattern generation
const SOCIAL_MEDIA_DOMAINS = [
  'facebook.com',
  'fb.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'tiktok.com',
  'youtube.com',
  'pinterest.com',
  'snapchat.com',
  'threads.net',
];

// Known directory/listing sites that can't be used for email pattern generation
const DIRECTORY_DOMAINS = [
  'yelp.com',
  'yellowpages.com',
  'bbb.org',
  'foursquare.com',
  'tripadvisor.com',
  'google.com',
  'localsearch.com',
  'angi.com',
  'angieslist.com',
  'homeadvisor.com',
  'thumbtack.com',
  'nextdoor.com',
  'manta.com',
  'merchantcircle.com',
  'superpages.com',
  'citysearch.com',
  'local.com',
  'chamberofcommerce.com',
  'mapquest.com',
  'bing.com',
];

/**
 * Normalize a URL for consistent handling
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim();

  // Add protocol if missing
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = `https://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    // Normalize to lowercase hostname, remove trailing slash
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, '')}${parsed.search}`;
  } catch {
    return normalized;
  }
}

/**
 * Extract base domain from URL (removes www. prefix)
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
  }
}

/**
 * Classify a website URL to determine if it's usable for email discovery
 *
 * Social media URLs (facebook.com, instagram.com, etc.) and directory listings
 * (yelp.com, yellowpages.com, etc.) are not usable for pattern-based email finding.
 */
export function normalizeAndClassifyWebsite(url: string | null | undefined): WebsiteClassification | null {
  if (!url || url.trim() === '') {
    return null;
  }

  const normalized = normalizeUrl(url);
  const domain = extractDomain(normalized);

  // Check for invalid URLs
  if (!domain || !domain.includes('.')) {
    return {
      normalizedUrl: normalized,
      type: 'invalid',
      isUsableForEmail: false,
    };
  }

  // Check if it's a social media domain
  if (SOCIAL_MEDIA_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`))) {
    return {
      normalizedUrl: normalized,
      type: 'social-media',
      isUsableForEmail: false,
    };
  }

  // Check if it's a directory domain
  if (DIRECTORY_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`))) {
    return {
      normalizedUrl: normalized,
      type: 'directory',
      isUsableForEmail: false,
    };
  }

  // It's a first-party website
  return {
    normalizedUrl: normalized,
    type: 'first-party',
    isUsableForEmail: true,
  };
}

/**
 * Get usable website URL for email discovery
 *
 * Returns the normalized URL if it's a first-party website that can be used
 * for email pattern generation. Returns null for social media and directory URLs.
 */
export function getUsableWebsite(rawWebsite: string | null | undefined): string | null {
  const classification = normalizeAndClassifyWebsite(rawWebsite);
  return classification?.isUsableForEmail ? classification.normalizedUrl : null;
}
