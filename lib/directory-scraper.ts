/**
 * Directory Scraper
 * Scrapes Yelp, Yellow Pages, and BBB for business websites and emails
 */

export interface DirectoryResult {
  website: string | null;
  email: string | null;
  source: 'yelp' | 'yellowpages' | 'bbb';
  businessUrl: string | null;
}

// User agents
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

// Rate limiting - 1 request per 2 seconds for directories
let lastDirectoryRequest = 0;
const DIRECTORY_MIN_INTERVAL = 2000;

// Email regex
const EMAIL_REGEX = /\b[a-zA-Z][a-zA-Z0-9._%+-]{0,63}@[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(?:\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})*\.[a-zA-Z]{2,10}\b/gi;

/**
 * Get random user agent
 */
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Wait for rate limit
 */
async function waitForDirectoryRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastDirectoryRequest;

  if (elapsed < DIRECTORY_MIN_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, DIRECTORY_MIN_INTERVAL - elapsed));
  }

  lastDirectoryRequest = Date.now();
}

/**
 * Fetch with timeout
 */
async function fetchDirectory(url: string, timeoutMs: number = 15000): Promise<string | null> {
  await waitForDirectoryRateLimit();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract valid email from HTML
 */
function extractEmail(html: string, businessDomain?: string): string | null {
  const matches = html.match(EMAIL_REGEX) || [];
  const skipDomains = [
    'yelp.com', 'yellowpages.com', 'bbb.org', 'example.com',
    'email.com', 'test.com', 'domain.com', 'sentry.io',
  ];

  for (const match of matches) {
    const email = match.toLowerCase();
    const domain = email.split('@')[1];

    // Skip invalid domains
    if (skipDomains.some(d => domain?.includes(d))) continue;

    // Skip placeholder emails
    if (email.includes('example') || email.includes('test@')) continue;

    // Prefer emails matching business domain
    if (businessDomain && domain === businessDomain) {
      return email;
    }

    // Return first valid email
    return email;
  }

  return null;
}

/**
 * Extract website URL from HTML
 */
function extractWebsite(html: string): string | null {
  // Look for external website links
  // Pattern: href to external site that's not a directory
  const skipDomains = [
    'yelp.com', 'yellowpages.com', 'bbb.org', 'facebook.com',
    'twitter.com', 'instagram.com', 'linkedin.com', 'google.com',
    'youtube.com', 'pinterest.com', 'tiktok.com',
  ];

  // Look for "website" or "visit site" links
  const websitePatterns = [
    /href="(https?:\/\/[^"]+)"[^>]*>\s*(?:website|visit\s*site|official\s*site|view\s*website)/gi,
    /class="[^"]*(?:website|biz-website|external-link)[^"]*"[^>]*href="(https?:\/\/[^"]+)"/gi,
    /href="(https?:\/\/[^"]+)"[^>]*class="[^"]*(?:website|biz-website|external-link)[^"]*"/gi,
    /data-(?:website|url)="(https?:\/\/[^"]+)"/gi,
  ];

  for (const pattern of websitePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      try {
        const url = new URL(match[1]);
        const domain = url.hostname.toLowerCase();

        if (!skipDomains.some(d => domain.includes(d))) {
          return match[1];
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Normalize business name for search
 */
function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
}

/**
 * Normalize location for search
 */
function normalizeLocation(location: string): string {
  // Extract city and state
  const parts = location.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    const city = parts[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
    const state = parts[1].toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
    return `${city}-${state}`;
  }
  return location.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

// ============ Yelp ============

/**
 * Search Yelp for business and extract website/email
 */
export async function scrapeYelp(name: string, location: string): Promise<DirectoryResult> {
  const result: DirectoryResult = {
    website: null,
    email: null,
    source: 'yelp',
    businessUrl: null,
  };

  try {
    // Build Yelp search URL
    const searchQuery = encodeURIComponent(`${name} ${location}`);
    const searchUrl = `https://www.yelp.com/search?find_desc=${searchQuery}`;

    const searchHtml = await fetchDirectory(searchUrl);
    if (!searchHtml) return result;

    // Find business page link
    const businessLinkMatch = searchHtml.match(
      /href="(\/biz\/[^"?]+)(?:\?[^"]*)?"[^>]*>.*?(?:class="[^"]*css-[^"]*"[^>]*>)?([^<]*)/i
    );

    if (!businessLinkMatch) return result;

    const businessPath = businessLinkMatch[1];
    result.businessUrl = `https://www.yelp.com${businessPath}`;

    // Fetch business page
    const businessHtml = await fetchDirectory(result.businessUrl);
    if (!businessHtml) return result;

    // Extract website
    result.website = extractWebsite(businessHtml);

    // Extract email
    const websiteDomain = result.website ? new URL(result.website).hostname.replace(/^www\./, '') : undefined;
    result.email = extractEmail(businessHtml, websiteDomain);

  } catch {
    // Return partial results
  }

  return result;
}

// ============ Yellow Pages ============

/**
 * Search Yellow Pages for business and extract website/email
 */
export async function scrapeYellowPages(name: string, location: string): Promise<DirectoryResult> {
  const result: DirectoryResult = {
    website: null,
    email: null,
    source: 'yellowpages',
    businessUrl: null,
  };

  try {
    // Build Yellow Pages search URL
    const normalizedName = normalizeBusinessName(name);
    const normalizedLocation = normalizeLocation(location);
    const searchUrl = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(name)}&geo_location_terms=${encodeURIComponent(location)}`;

    const searchHtml = await fetchDirectory(searchUrl);
    if (!searchHtml) return result;

    // Find business page link
    const businessLinkMatch = searchHtml.match(
      /href="(\/[^"]+\?lid=[^"]+)"[^>]*class="[^"]*business-name/i
    ) || searchHtml.match(
      /class="[^"]*business-name[^"]*"[^>]*href="([^"]+)"/i
    );

    if (businessLinkMatch) {
      result.businessUrl = `https://www.yellowpages.com${businessLinkMatch[1]}`;

      // Fetch business page
      const businessHtml = await fetchDirectory(result.businessUrl);
      if (businessHtml) {
        // Extract website - YP uses specific class
        const websiteMatch = businessHtml.match(
          /href="(https?:\/\/[^"]+)"[^>]*class="[^"]*primary-btn[^"]*website/i
        ) || businessHtml.match(
          /class="[^"]*website[^"]*"[^>]*href="(https?:\/\/[^"]+)"/i
        );

        if (websiteMatch) {
          result.website = websiteMatch[1];
        }

        // Extract email
        const websiteDomain = result.website ? new URL(result.website).hostname.replace(/^www\./, '') : undefined;
        result.email = extractEmail(businessHtml, websiteDomain);
      }
    }

  } catch {
    // Return partial results
  }

  return result;
}

// ============ BBB ============

/**
 * Search BBB for business and extract website/email
 */
export async function scrapeBBB(name: string, location: string): Promise<DirectoryResult> {
  const result: DirectoryResult = {
    website: null,
    email: null,
    source: 'bbb',
    businessUrl: null,
  };

  try {
    // Build BBB search URL
    const searchUrl = `https://www.bbb.org/search?find_country=USA&find_text=${encodeURIComponent(name)}&find_loc=${encodeURIComponent(location)}&find_type=Category`;

    const searchHtml = await fetchDirectory(searchUrl);
    if (!searchHtml) return result;

    // Find business page link - BBB uses specific structure
    const businessLinkMatch = searchHtml.match(
      /href="(https:\/\/www\.bbb\.org\/[^"]+\/profile\/[^"]+)"/i
    );

    if (businessLinkMatch) {
      result.businessUrl = businessLinkMatch[1];

      // Fetch business page
      const businessHtml = await fetchDirectory(result.businessUrl);
      if (businessHtml) {
        // Extract website - BBB shows it in business info
        const websiteMatch = businessHtml.match(
          /(?:Website|Visit Website)[^<]*<[^>]*href="(https?:\/\/[^"]+)"/i
        ) || businessHtml.match(
          /href="(https?:\/\/[^"]+)"[^>]*>(?:Visit Website|Website)</i
        );

        if (websiteMatch) {
          const url = websiteMatch[1];
          // Make sure it's not a BBB URL
          if (!url.includes('bbb.org')) {
            result.website = url;
          }
        }

        // Extract email
        const websiteDomain = result.website ? new URL(result.website).hostname.replace(/^www\./, '') : undefined;
        result.email = extractEmail(businessHtml, websiteDomain);

        // BBB sometimes shows email directly
        const emailMatch = businessHtml.match(
          /(?:Email|Contact)[^<]*<[^>]*href="mailto:([^"]+)"/i
        );
        if (emailMatch && !result.email) {
          result.email = emailMatch[1].toLowerCase();
        }
      }
    }

  } catch {
    // Return partial results
  }

  return result;
}

// ============ Combined Search ============

/**
 * Search all directories for a business
 */
export async function scrapeAllDirectories(
  name: string,
  location: string
): Promise<DirectoryResult[]> {
  const results = await Promise.all([
    scrapeYelp(name, location).catch(() => ({
      website: null,
      email: null,
      source: 'yelp' as const,
      businessUrl: null,
    })),
    scrapeYellowPages(name, location).catch(() => ({
      website: null,
      email: null,
      source: 'yellowpages' as const,
      businessUrl: null,
    })),
    scrapeBBB(name, location).catch(() => ({
      website: null,
      email: null,
      source: 'bbb' as const,
      businessUrl: null,
    })),
  ]);

  return results;
}

/**
 * Get best website from directory results
 */
export function getBestWebsite(results: DirectoryResult[]): string | null {
  for (const result of results) {
    if (result.website) {
      return result.website;
    }
  }
  return null;
}

/**
 * Get best email from directory results
 */
export function getBestEmail(results: DirectoryResult[]): { email: string; source: string } | null {
  for (const result of results) {
    if (result.email) {
      return {
        email: result.email,
        source: `directory-${result.source}`,
      };
    }
  }
  return null;
}
