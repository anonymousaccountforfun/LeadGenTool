/**
 * Simple Email Finder
 * Finds emails by fetching website HTML without browser automation
 * Works as a fallback when APIs and Browserless aren't available
 */

export interface SimpleEmailResult {
  email: string;
  source: string;
  confidence: number;
}

// Common paths where contact info is usually found
const CONTACT_PATHS = [
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/team',
  '/company',
  '/info',
  '/support',
];

// Email regex pattern - stricter to avoid false positives
// Must start with a letter and not contain file extensions
const EMAIL_REGEX = /\b[a-zA-Z][a-zA-Z0-9._%+-]{0,63}@[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(?:\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})*\.[a-zA-Z]{2,10}\b/gi;

// File extensions to reject (false positives from image/asset URLs)
const REJECT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.css', '.js', '.pdf'];

// Domains to skip (generic, Google, etc.)
const SKIP_DOMAINS = [
  'example.com',
  'email.com',
  'mail.com',
  'test.com',
  'domain.com',
  'yoursite.com',
  'yourdomain.com',
  'yourcompany.com',
  'sentry.io',
  'wixpress.com',
  'wordpress.com',
  'squarespace.com',
  'shopify.com',
  'google.com',
  'googleapis.com',
  'gstatic.com',
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'linkedin.com',
  'schema.org',
  'w3.org',
  'gravatar.com',
];

// Generic email prefixes to deprioritize
const GENERIC_PREFIXES = ['info', 'contact', 'hello', 'support', 'sales', 'admin', 'help', 'noreply', 'no-reply'];

/**
 * Extract domain from URL
 */
function getDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

/**
 * Check if email domain matches website domain
 */
function emailMatchesDomain(email: string, websiteDomain: string): boolean {
  const emailDomain = email.split('@')[1]?.toLowerCase();
  if (!emailDomain) return false;

  // Exact match
  if (emailDomain === websiteDomain) return true;

  // Subdomain match (e.g., mail.company.com matches company.com)
  if (emailDomain.endsWith('.' + websiteDomain)) return true;
  if (websiteDomain.endsWith('.' + emailDomain)) return true;

  return false;
}

/**
 * Score an email based on quality signals
 */
function scoreEmail(email: string, websiteDomain: string, foundOnContactPage: boolean): number {
  let score = 0.5; // Base score

  const emailLower = email.toLowerCase();
  const prefix = emailLower.split('@')[0];
  const emailDomain = emailLower.split('@')[1];

  // Domain matching is very important
  if (emailMatchesDomain(email, websiteDomain)) {
    score += 0.3;
  } else {
    score -= 0.2; // Penalize non-matching domains
  }

  // Contact page bonus
  if (foundOnContactPage) {
    score += 0.1;
  }

  // Generic email penalty (but still valid)
  if (GENERIC_PREFIXES.some(p => prefix === p)) {
    score -= 0.05;
  }

  // Personal-looking emails get bonus
  if (prefix.includes('.') || /^[a-z]+[a-z]$/.test(prefix)) {
    score += 0.05;
  }

  return Math.min(0.85, Math.max(0.3, score));
}

/**
 * Validate email format and quality
 */
function isValidEmail(email: string): boolean {
  // Must have exactly one @
  const parts = email.split('@');
  if (parts.length !== 2) return false;

  const [localPart, domain] = parts;

  // Local part validation
  if (!localPart || localPart.length === 0 || localPart.length > 64) return false;
  if (/^\d+$/.test(localPart)) return false; // All numbers = likely phone number
  if (/^\d{3,}/.test(localPart)) return false; // Starts with 3+ digits = likely phone number
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
  if (localPart.includes('..')) return false;

  // Domain validation
  if (!domain || domain.length < 4) return false;
  if (!domain.includes('.')) return false;

  // Check for file extensions (false positives)
  const lowerEmail = email.toLowerCase();
  if (REJECT_EXTENSIONS.some(ext => lowerEmail.endsWith(ext))) return false;

  // Check domain TLD
  const tld = domain.split('.').pop() || '';
  if (tld.length < 2 || tld.length > 10) return false;
  if (/\d/.test(tld)) return false; // TLD shouldn't have numbers

  return true;
}

/**
 * Extract emails from HTML content
 */
function extractEmails(html: string, websiteDomain: string, isContactPage: boolean): SimpleEmailResult[] {
  const matches = html.match(EMAIL_REGEX) || [];
  const seen = new Set<string>();
  const results: SimpleEmailResult[] = [];

  for (const match of matches) {
    const email = match.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);

    // Validate email format
    if (!isValidEmail(email)) continue;

    const emailDomain = email.split('@')[1];

    // Skip unwanted domains
    if (SKIP_DOMAINS.some(d => emailDomain?.includes(d))) continue;

    // Skip obvious fake/placeholder emails
    if (email.includes('example') || email.includes('test@') || email.includes('your@')) continue;

    const confidence = scoreEmail(email, websiteDomain, isContactPage);

    results.push({
      email,
      source: isContactPage ? 'website-contact-page' : 'website-scrape',
      confidence,
    });
  }

  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Fetch a URL with timeout and error handling
 */
async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Find email for a website using simple HTTP requests
 */
export async function findEmailSimple(website: string): Promise<SimpleEmailResult | null> {
  if (!website) return null;

  const baseUrl = website.startsWith('http') ? website : `https://${website}`;
  const domain = getDomain(website);
  const allEmails: SimpleEmailResult[] = [];

  // Try homepage first
  const homepageHtml = await fetchWithTimeout(baseUrl);
  if (homepageHtml) {
    const homeEmails = extractEmails(homepageHtml, domain, false);
    allEmails.push(...homeEmails);
  }

  // If we found a high-confidence email on homepage, return it
  const highConfidenceHome = allEmails.find(e => e.confidence >= 0.75 && emailMatchesDomain(e.email, domain));
  if (highConfidenceHome) {
    return highConfidenceHome;
  }

  // Try contact pages
  for (const path of CONTACT_PATHS) {
    try {
      const url = new URL(path, baseUrl).toString();
      const html = await fetchWithTimeout(url, 8000);
      if (html) {
        const contactEmails = extractEmails(html, domain, true);
        allEmails.push(...contactEmails);

        // If we found a good email on contact page, return it
        const good = contactEmails.find(e => e.confidence >= 0.7 && emailMatchesDomain(e.email, domain));
        if (good) {
          return good;
        }
      }
    } catch {
      // Continue to next path
    }
  }

  // Return best email that matches domain
  const domainMatching = allEmails.filter(e => emailMatchesDomain(e.email, domain));
  if (domainMatching.length > 0) {
    return domainMatching[0];
  }

  // Return best email overall (might not match domain)
  if (allEmails.length > 0) {
    return allEmails[0];
  }

  return null;
}

/**
 * Find emails for multiple businesses in parallel
 */
export async function findEmailsSimpleBatch(
  businesses: Array<{ name: string; website: string | null }>,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number, result: { name: string; email: string | null }) => void;
  } = {}
): Promise<Map<string, SimpleEmailResult | null>> {
  const { concurrency = 5, onProgress } = options;
  const results = new Map<string, SimpleEmailResult | null>();
  const queue = [...businesses];
  let completed = 0;

  async function worker() {
    while (queue.length > 0) {
      const business = queue.shift();
      if (!business) break;

      let result: SimpleEmailResult | null = null;

      if (business.website) {
        try {
          result = await findEmailSimple(business.website);
        } catch {
          result = null;
        }
      }

      results.set(business.name, result);
      completed++;

      onProgress?.(completed, businesses.length, {
        name: business.name,
        email: result?.email || null,
      });
    }
  }

  // Run workers in parallel
  const workers = Array.from({ length: Math.min(concurrency, businesses.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
