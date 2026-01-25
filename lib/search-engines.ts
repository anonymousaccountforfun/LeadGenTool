/**
 * Search Engines Module
 * Unified interface for Google, Bing, and DuckDuckGo searches
 */

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

// User agents for rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

// Rate limiting
const rateLimiters = {
  google: { lastRequest: 0, minInterval: 1000 }, // 1 req/sec
  bing: { lastRequest: 0, minInterval: 500 }, // 2 req/sec
  duckduckgo: { lastRequest: 0, minInterval: 500 }, // 2 req/sec
};

/**
 * Get random user agent
 */
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Wait for rate limit
 */
async function waitForRateLimit(engine: 'google' | 'bing' | 'duckduckgo'): Promise<void> {
  const limiter = rateLimiters[engine];
  const now = Date.now();
  const elapsed = now - limiter.lastRequest;

  if (elapsed < limiter.minInterval) {
    await new Promise(resolve => setTimeout(resolve, limiter.minInterval - elapsed));
  }

  limiter.lastRequest = Date.now();
}

/**
 * Fetch with timeout and error handling
 */
async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<string | null> {
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
 * Extract search results from Google HTML
 */
function parseGoogleResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Match search result blocks - Google uses various div structures
  // Look for links with /url?q= pattern or direct links in search results
  const linkRegex = /<a[^>]+href="\/url\?q=([^"&]+)[^"]*"[^>]*>([^<]*(?:<[^/][^>]*>[^<]*)*)<\/a>/gi;
  const directLinkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*"[^>]*>.*?<h3[^>]*>([^<]+)<\/h3>/gi;

  let match;

  // Try direct link pattern first (newer Google HTML)
  while ((match = directLinkRegex.exec(html)) !== null && results.length < 10) {
    const url = decodeURIComponent(match[1]);
    const title = match[2].replace(/<[^>]+>/g, '').trim();

    if (url && title && !url.includes('google.com')) {
      // Try to find snippet near this result
      const snippetMatch = html.slice(match.index, match.index + 2000).match(/<span[^>]*>([^<]{50,300})<\/span>/);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      results.push({ url, title, snippet });
    }
  }

  // Fallback: Try /url?q= pattern (older Google HTML)
  if (results.length === 0) {
    while ((match = linkRegex.exec(html)) !== null && results.length < 10) {
      const url = decodeURIComponent(match[1]);
      const title = match[2].replace(/<[^>]+>/g, '').trim();

      if (url && title && !url.includes('google.com') && url.startsWith('http')) {
        results.push({ url, title, snippet: '' });
      }
    }
  }

  return results;
}

/**
 * Extract search results from Bing HTML
 */
function parseBingResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Bing uses <li class="b_algo"> for each result
  const resultRegex = /<li class="b_algo"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([^<]*(?:<[^/][^>]*>[^<]*)*)<\/a>[\s\S]*?<p[^>]*>([^<]*(?:<[^/][^>]*>[^<]*)*)<\/p>/gi;

  let match;
  while ((match = resultRegex.exec(html)) !== null && results.length < 10) {
    const url = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    const snippet = match[3].replace(/<[^>]+>/g, '').trim();

    if (url && title && url.startsWith('http')) {
      results.push({ url, title, snippet });
    }
  }

  return results;
}

/**
 * Extract search results from DuckDuckGo HTML
 */
function parseDuckDuckGoResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // DDG uses data-result for results
  const resultRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([^<]*(?:<[^/][^>]*>[^<]*)*)<\/a>/gi;

  let match;
  while ((match = resultRegex.exec(html)) !== null && results.length < 10) {
    const url = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    const snippet = match[3].replace(/<[^>]+>/g, '').trim();

    if (url && title && url.startsWith('http')) {
      results.push({ url, title, snippet });
    }
  }

  // Fallback: simpler pattern
  if (results.length === 0) {
    const simpleLinkRegex = /<a[^>]+href="(https?:\/\/(?!duckduckgo)[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    while ((match = simpleLinkRegex.exec(html)) !== null && results.length < 10) {
      const url = match[1];
      const title = match[2].trim();
      if (url && title && title.length > 10) {
        results.push({ url, title, snippet: '' });
      }
    }
  }

  return results;
}

/**
 * Search Google
 */
export async function googleSearch(query: string): Promise<SearchResult[]> {
  await waitForRateLimit('google');

  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.google.com/search?q=${encodedQuery}&hl=en&num=10`;

  const html = await fetchWithTimeout(url);
  if (!html) return [];

  return parseGoogleResults(html);
}

/**
 * Search Bing
 */
export async function bingSearch(query: string): Promise<SearchResult[]> {
  await waitForRateLimit('bing');

  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.bing.com/search?q=${encodedQuery}&count=10`;

  const html = await fetchWithTimeout(url);
  if (!html) return [];

  return parseBingResults(html);
}

/**
 * Search DuckDuckGo
 */
export async function duckDuckGoSearch(query: string): Promise<SearchResult[]> {
  await waitForRateLimit('duckduckgo');

  const encodedQuery = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  const html = await fetchWithTimeout(url);
  if (!html) return [];

  return parseDuckDuckGoResults(html);
}

/**
 * Search all engines and combine results
 */
export async function searchAll(query: string): Promise<SearchResult[]> {
  const [googleResults, bingResults, ddgResults] = await Promise.all([
    googleSearch(query).catch(() => []),
    bingSearch(query).catch(() => []),
    duckDuckGoSearch(query).catch(() => []),
  ]);

  // Combine and deduplicate by URL
  const seen = new Set<string>();
  const combined: SearchResult[] = [];

  for (const result of [...googleResults, ...bingResults, ...ddgResults]) {
    const normalizedUrl = result.url.toLowerCase().replace(/\/$/, '');
    if (!seen.has(normalizedUrl)) {
      seen.add(normalizedUrl);
      combined.push(result);
    }
  }

  return combined;
}

/**
 * Extract emails from search result snippets
 */
export function extractEmailsFromResults(results: SearchResult[]): string[] {
  const emailRegex = /\b[a-zA-Z][a-zA-Z0-9._%+-]{0,63}@[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(?:\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})*\.[a-zA-Z]{2,10}\b/gi;
  const emails: string[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const text = `${result.title} ${result.snippet}`;
    const matches = text.match(emailRegex) || [];

    for (const match of matches) {
      const email = match.toLowerCase();
      if (!seen.has(email) && isValidSearchEmail(email)) {
        seen.add(email);
        emails.push(email);
      }
    }
  }

  return emails;
}

/**
 * Validate email from search results
 */
function isValidSearchEmail(email: string): boolean {
  const [localPart, domain] = email.split('@');

  if (!localPart || !domain) return false;
  if (localPart.length > 64) return false;
  if (/^\d+$/.test(localPart)) return false; // All numbers
  if (/^\d{3,}/.test(localPart)) return false; // Starts with 3+ digits

  // Skip common invalid domains
  const skipDomains = [
    'example.com', 'test.com', 'email.com', 'domain.com',
    'google.com', 'bing.com', 'duckduckgo.com',
    'facebook.com', 'twitter.com', 'instagram.com',
  ];

  if (skipDomains.some(d => domain.includes(d))) return false;

  // Check TLD
  const tld = domain.split('.').pop() || '';
  if (tld.length < 2 || tld.length > 10 || /\d/.test(tld)) return false;

  return true;
}

/**
 * Extract website URLs from search results for a business
 */
export function extractWebsiteFromResults(
  results: SearchResult[],
  businessName: string
): string | null {
  const nameParts = businessName.toLowerCase().split(/\s+/).filter(p => p.length > 2);

  // Skip these domains - they're directories, not business websites
  const skipDomains = [
    'yelp.com', 'yellowpages.com', 'bbb.org', 'facebook.com',
    'instagram.com', 'twitter.com', 'linkedin.com', 'google.com',
    'bing.com', 'mapquest.com', 'foursquare.com', 'tripadvisor.com',
    'angi.com', 'angieslist.com', 'homeadvisor.com', 'thumbtack.com',
  ];

  for (const result of results) {
    try {
      const url = new URL(result.url);
      const domain = url.hostname.toLowerCase().replace(/^www\./, '');

      // Skip directory sites
      if (skipDomains.some(d => domain.includes(d))) continue;

      // Check if domain relates to business name
      const domainName = domain.split('.')[0];
      const titleLower = result.title.toLowerCase();

      // Match if domain contains business name parts or title contains business name
      const domainMatches = nameParts.some(part => domainName.includes(part));
      const titleMatches = nameParts.filter(part => titleLower.includes(part)).length >= Math.min(2, nameParts.length);

      if (domainMatches || titleMatches) {
        return result.url;
      }
    } catch {
      continue;
    }
  }

  return null;
}
