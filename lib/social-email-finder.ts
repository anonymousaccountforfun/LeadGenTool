/**
 * Social Media Email Finder
 * Extracts emails from Facebook and Instagram business pages
 */

export interface SocialEmailResult {
  email: string;
  source: 'facebook-page' | 'facebook-search' | 'instagram-page' | 'instagram-search';
  confidence: number;
  socialUrl?: string;
}

// Email regex
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

// Domains to skip
const SKIP_EMAIL_DOMAINS = [
  'example.com', 'email.com', 'test.com', 'domain.com',
  'facebook.com', 'fb.com', 'instagram.com', 'meta.com',
  'google.com', 'gmail.com', 'yahoo.com', 'hotmail.com',
  'sentry.io', 'wixpress.com', 'wordpress.com', 'squarespace.com',
];

// User agents for rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1500; // 1.5 seconds between requests

/**
 * Get random user agent
 */
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Rate-limited delay
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Fetch URL with rate limiting and error handling
 */
async function fetchWithRateLimit(url: string, timeoutMs: number = 10000): Promise<string | null> {
  await waitForRateLimit();

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
 * Extract emails from HTML content
 */
function extractEmailsFromHtml(html: string, websiteDomain?: string): string[] {
  const matches = html.match(EMAIL_REGEX) || [];
  const seen = new Set<string>();
  const validEmails: string[] = [];

  for (const match of matches) {
    const email = match.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);

    const emailDomain = email.split('@')[1];

    // Skip unwanted domains
    if (SKIP_EMAIL_DOMAINS.some((d) => emailDomain?.includes(d))) continue;

    // Skip placeholder emails
    if (email.includes('example') || email.includes('test@') || email.includes('your@')) continue;

    // Prioritize emails that match website domain
    if (websiteDomain && emailDomain === websiteDomain) {
      validEmails.unshift(email); // Add to front
    } else {
      validEmails.push(email);
    }
  }

  return validEmails;
}

/**
 * Extract domain from URL
 */
function getDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

// ============ Facebook Extraction ============

/**
 * Extract email from Facebook page
 */
async function extractEmailFromFacebookPage(facebookUrl: string, websiteDomain?: string): Promise<SocialEmailResult | null> {
  // Normalize Facebook URL
  let url = facebookUrl;
  if (!url.startsWith('http')) {
    url = `https://www.facebook.com/${url.replace(/^@/, '')}`;
  }

  // Try to fetch the about page which often has contact info
  const aboutUrl = url.replace(/\/?$/, '/about');
  const html = await fetchWithRateLimit(aboutUrl);

  if (!html) {
    // Try main page
    const mainHtml = await fetchWithRateLimit(url);
    if (!mainHtml) return null;

    const emails = extractEmailsFromHtml(mainHtml, websiteDomain);
    if (emails.length > 0) {
      return {
        email: emails[0],
        source: 'facebook-page',
        confidence: websiteDomain && emails[0].includes(websiteDomain) ? 0.70 : 0.60,
        socialUrl: url,
      };
    }
    return null;
  }

  const emails = extractEmailsFromHtml(html, websiteDomain);
  if (emails.length > 0) {
    return {
      email: emails[0],
      source: 'facebook-page',
      confidence: websiteDomain && emails[0].includes(websiteDomain) ? 0.75 : 0.65,
      socialUrl: aboutUrl,
    };
  }

  return null;
}

/**
 * Search Facebook for business and extract email
 */
async function searchFacebookForEmail(
  businessName: string,
  location?: string,
  websiteDomain?: string
): Promise<SocialEmailResult | null> {
  // Build search query
  const query = location ? `${businessName} ${location}` : businessName;
  const searchUrl = `https://www.facebook.com/public/${encodeURIComponent(query)}`;

  const html = await fetchWithRateLimit(searchUrl);
  if (!html) return null;

  // Extract any emails found in search results
  const emails = extractEmailsFromHtml(html, websiteDomain);
  if (emails.length > 0) {
    return {
      email: emails[0],
      source: 'facebook-search',
      confidence: websiteDomain && emails[0].includes(websiteDomain) ? 0.60 : 0.50,
    };
  }

  return null;
}

// ============ Instagram Extraction ============

/**
 * Extract email from Instagram profile
 */
async function extractEmailFromInstagramPage(instagramUrl: string, websiteDomain?: string): Promise<SocialEmailResult | null> {
  // Normalize Instagram URL
  let url = instagramUrl;
  if (!url.startsWith('http')) {
    url = `https://www.instagram.com/${url.replace(/^@/, '')}`;
  }

  const html = await fetchWithRateLimit(url);
  if (!html) return null;

  // Instagram embeds email in various places:
  // 1. In the bio text
  // 2. In structured data
  // 3. In mailto: links

  const emails = extractEmailsFromHtml(html, websiteDomain);

  // Also check for business email in JSON-LD structured data
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const match of jsonLdMatch) {
      const jsonEmails = extractEmailsFromHtml(match, websiteDomain);
      emails.push(...jsonEmails);
    }
  }

  // Check for email in meta tags
  const metaEmailMatch = html.match(/content="([^"]*@[^"]*\.[a-z]{2,})"/gi);
  if (metaEmailMatch) {
    for (const match of metaEmailMatch) {
      const email = match.match(EMAIL_REGEX);
      if (email) emails.push(...email);
    }
  }

  // Deduplicate
  const uniqueEmails = [...new Set(emails.map((e) => e.toLowerCase()))];

  if (uniqueEmails.length > 0) {
    const bestEmail = uniqueEmails.find((e) => websiteDomain && e.includes(websiteDomain)) || uniqueEmails[0];
    return {
      email: bestEmail,
      source: 'instagram-page',
      confidence: websiteDomain && bestEmail.includes(websiteDomain) ? 0.70 : 0.60,
      socialUrl: url,
    };
  }

  return null;
}

/**
 * Search Instagram for business (limited without API)
 */
async function searchInstagramForEmail(
  businessName: string,
  _location?: string,
  websiteDomain?: string
): Promise<SocialEmailResult | null> {
  // Instagram web search is very limited without authentication
  // Try the explore/tags endpoint as a fallback
  const cleanName = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const searchUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(cleanName)}/`;

  const html = await fetchWithRateLimit(searchUrl);
  if (!html) return null;

  const emails = extractEmailsFromHtml(html, websiteDomain);
  if (emails.length > 0) {
    return {
      email: emails[0],
      source: 'instagram-search',
      confidence: websiteDomain && emails[0].includes(websiteDomain) ? 0.55 : 0.45,
    };
  }

  return null;
}

// ============ Main Export Functions ============

export interface SocialSearchParams {
  name: string;
  location?: string;
  websiteDomain?: string;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
}

/**
 * Find email from social media profiles
 * Tries existing URLs first, then searches if not found
 */
export async function findEmailFromSocial(params: SocialSearchParams): Promise<SocialEmailResult | null> {
  const { name, location, websiteDomain, facebookUrl, instagramUrl } = params;

  // Step 1: Try existing Facebook URL
  if (facebookUrl) {
    const result = await extractEmailFromFacebookPage(facebookUrl, websiteDomain);
    if (result) return result;
  }

  // Step 2: Try existing Instagram URL
  if (instagramUrl) {
    const result = await extractEmailFromInstagramPage(instagramUrl, websiteDomain);
    if (result) return result;
  }

  // Step 3: Search Facebook
  const fbSearchResult = await searchFacebookForEmail(name, location, websiteDomain);
  if (fbSearchResult) return fbSearchResult;

  // Step 4: Search Instagram
  const igSearchResult = await searchInstagramForEmail(name, location, websiteDomain);
  if (igSearchResult) return igSearchResult;

  return null;
}

/**
 * Find emails from social media for multiple businesses
 */
export async function findEmailsFromSocialBatch(
  businesses: SocialSearchParams[],
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number, result: { name: string; email: string | null }) => void;
  } = {}
): Promise<Map<string, SocialEmailResult | null>> {
  const { concurrency = 3, onProgress } = options; // Lower concurrency for social media
  const results = new Map<string, SocialEmailResult | null>();
  const queue = [...businesses];
  let completed = 0;

  async function worker() {
    while (queue.length > 0) {
      const business = queue.shift();
      if (!business) break;

      let result: SocialEmailResult | null = null;

      try {
        result = await findEmailFromSocial(business);
      } catch {
        result = null;
      }

      results.set(business.name, result);
      completed++;

      onProgress?.(completed, businesses.length, {
        name: business.name,
        email: result?.email || null,
      });
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, businesses.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}
