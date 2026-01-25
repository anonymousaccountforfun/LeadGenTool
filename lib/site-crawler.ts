/**
 * Site Crawler Module
 * Discovers and crawls internal pages to find emails
 */

import { type Page } from 'playwright';
import { humanWait } from './stealth';
import { acquireRateLimit } from './rate-limiter';
import { loadConfig } from './config';

interface CrawlResult {
  url: string;
  emails: string[];
  links: string[];
}

interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  prioritizeContactPages?: boolean;
  timeout?: number;
}

// Keywords that suggest a page might have contact info (higher priority)
const CONTACT_KEYWORDS = [
  'contact', 'about', 'team', 'staff', 'people', 'leadership',
  'management', 'directory', 'location', 'office', 'reach',
  'connect', 'get-in-touch', 'support', 'help', 'service',
  'our-team', 'meet', 'who-we-are', 'company', 'careers',
  'jobs', 'join', 'dealer', 'store', 'branch', 'agents'
];

// Patterns to skip (not useful for finding emails)
const SKIP_PATTERNS = [
  /\.(jpg|jpeg|png|gif|svg|webp|ico|pdf|zip|doc|docx|xls|xlsx|ppt|pptx)$/i,
  /\/(cart|checkout|login|signin|signup|register|account|password|reset)/i,
  /\/(wp-admin|wp-content|wp-includes|admin|assets|static|css|js|images|fonts)/i,
  /\/(privacy|terms|cookie|legal|disclaimer|policy|gdpr|ccpa)/i,
  /\/(blog|news|article|post)\/\d+/i, // Individual blog posts
  /\/(category|tag|archive|page)\/\d+/i, // Pagination/archives
  /\?.*=/i, // Query strings (dynamic pages)
  /#/i, // Anchor links
  /\/\d{4}\/\d{2}\//i, // Date-based archives
];

// File extensions that are definitely not HTML pages
const SKIP_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.tar', '.gz', '.mp3', '.mp4', '.avi', '.mov',
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.bmp',
  '.css', '.js', '.json', '.xml', '.rss', '.atom'
];

/**
 * Check if a URL should be skipped
 */
function shouldSkipUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();

  // Skip files with known non-HTML extensions
  if (SKIP_EXTENSIONS.some(ext => lowerUrl.endsWith(ext))) {
    return true;
  }

  // Skip URLs matching skip patterns
  if (SKIP_PATTERNS.some(pattern => pattern.test(url))) {
    return true;
  }

  return false;
}

/**
 * Calculate priority score for a URL (lower = higher priority)
 */
function getUrlPriority(url: string): number {
  const lowerUrl = url.toLowerCase();

  // Highest priority: URLs containing contact keywords
  if (CONTACT_KEYWORDS.some(kw => lowerUrl.includes(kw))) {
    return 1;
  }

  // High priority: Short paths (likely main pages)
  const path = new URL(url).pathname;
  if (path.split('/').filter(Boolean).length <= 1) {
    return 2;
  }

  // Medium priority: Medium-length paths
  if (path.split('/').filter(Boolean).length <= 2) {
    return 3;
  }

  // Lower priority: Deep paths
  return 4;
}

/**
 * Extract all internal links from a page
 */
async function extractInternalLinks(page: Page, baseUrl: string): Promise<string[]> {
  try {
    const baseHostname = new URL(baseUrl).hostname;

    const links = await page.evaluate((hostname) => {
      const found: string[] = [];

      document.querySelectorAll('a[href]').forEach(anchor => {
        const href = anchor.getAttribute('href');
        if (!href) return;

        try {
          // Handle relative URLs
          const url = new URL(href, window.location.origin);

          // Only include internal links
          if (url.hostname === hostname || url.hostname === `www.${hostname}` || hostname === `www.${url.hostname}`) {
            // Normalize the URL
            const normalized = `${url.origin}${url.pathname}`.replace(/\/$/, '');
            found.push(normalized);
          }
        } catch {
          // Invalid URL, skip
        }
      });

      return [...new Set(found)];
    }, baseHostname);

    return links;
  } catch {
    return [];
  }
}

/**
 * Extract emails from page content
 */
async function extractEmailsFromCrawledPage(page: Page): Promise<string[]> {
  try {
    const emails = await page.evaluate(() => {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const found = new Set<string>();

      // Check mailto links
      document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
        const href = link.getAttribute('href') || '';
        const email = href.replace('mailto:', '').split('?')[0].toLowerCase();
        if (email.includes('@')) found.add(email);
      });

      // Check page text content
      const textContent = document.body?.innerText || '';
      const textMatches = textContent.match(emailRegex) || [];
      textMatches.forEach(email => found.add(email.toLowerCase()));

      // Check HTML content (catches emails in attributes, comments, etc.)
      const htmlContent = document.body?.innerHTML || '';
      const htmlMatches = htmlContent.match(emailRegex) || [];
      htmlMatches.forEach(email => found.add(email.toLowerCase()));

      // Check meta tags
      document.querySelectorAll('meta').forEach(meta => {
        const content = meta.getAttribute('content') || '';
        const matches = content.match(emailRegex) || [];
        matches.forEach(email => found.add(email.toLowerCase()));
      });

      // Check structured data
      document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
        try {
          const text = script.textContent || '';
          const matches = text.match(emailRegex) || [];
          matches.forEach(email => found.add(email.toLowerCase()));
        } catch {}
      });

      return [...found];
    });

    return emails;
  } catch {
    return [];
  }
}

/**
 * Crawl a website to find emails
 */
export async function crawlSiteForEmails(
  page: Page,
  baseUrl: string,
  visitedUrls: Set<string>,
  options: CrawlOptions = {}
): Promise<Map<string, string[]>> {
  const config = loadConfig();
  const maxPages = options.maxPages ?? 30;
  const timeout = options.timeout ?? 8000;

  const results = new Map<string, string[]>(); // URL -> emails found
  const urlQueue: Array<{ url: string; priority: number }> = [];
  const baseHostname = new URL(baseUrl).hostname;

  // Start with the homepage if not already visited
  if (!visitedUrls.has('/') && !visitedUrls.has(baseUrl)) {
    urlQueue.push({ url: baseUrl, priority: 0 });
  }

  // Collect links from already-visited pages would require re-visiting them
  // Instead, let's start fresh from homepage and discover links

  let pagesVisited = 0;

  while (urlQueue.length > 0 && pagesVisited < maxPages) {
    // Sort by priority and get next URL
    urlQueue.sort((a, b) => a.priority - b.priority);
    const { url } = urlQueue.shift()!;

    // Skip if already visited
    const urlPath = new URL(url).pathname;
    if (visitedUrls.has(url) || visitedUrls.has(urlPath)) {
      continue;
    }

    // Skip URLs that match skip patterns
    if (shouldSkipUrl(url)) {
      continue;
    }

    visitedUrls.add(url);
    visitedUrls.add(urlPath);
    pagesVisited++;

    try {
      // Rate limiting
      if (config.rateLimit.enabled) {
        await acquireRateLimit(url);
      }

      // Navigate to page
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      await humanWait(page, 800, 40);

      // Extract emails
      const emails = await extractEmailsFromCrawledPage(page);
      if (emails.length > 0) {
        results.set(url, emails);
      }

      // Extract links for further crawling
      const links = await extractInternalLinks(page, baseUrl);

      for (const link of links) {
        const linkPath = new URL(link).pathname;
        if (!visitedUrls.has(link) && !visitedUrls.has(linkPath) && !shouldSkipUrl(link)) {
          // Check if link is on same domain
          try {
            const linkHostname = new URL(link).hostname;
            if (linkHostname === baseHostname ||
                linkHostname === `www.${baseHostname}` ||
                baseHostname === `www.${linkHostname}`) {
              urlQueue.push({ url: link, priority: getUrlPriority(link) });
            }
          } catch {}
        }
      }

    } catch {
      // Page failed to load, continue to next
    }
  }

  return results;
}

/**
 * Quick crawl - just discover high-priority pages from homepage
 */
export async function discoverContactPages(page: Page, baseUrl: string): Promise<string[]> {
  try {
    const links = await extractInternalLinks(page, baseUrl);

    // Filter and prioritize contact-related pages
    const contactPages = links
      .filter(url => !shouldSkipUrl(url))
      .map(url => ({ url, priority: getUrlPriority(url) }))
      .filter(item => item.priority <= 2) // Only high-priority pages
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 15) // Limit to top 15
      .map(item => new URL(item.url).pathname);

    return [...new Set(contactPages)];
  } catch {
    return [];
  }
}

/**
 * Get crawl statistics
 */
export function getCrawlStats(results: Map<string, string[]>): {
  pagesWithEmails: number;
  totalEmails: number;
  uniqueEmails: number;
} {
  const allEmails = new Set<string>();
  let totalCount = 0;

  for (const emails of results.values()) {
    totalCount += emails.length;
    emails.forEach(email => allEmails.add(email));
  }

  return {
    pagesWithEmails: results.size,
    totalEmails: totalCount,
    uniqueEmails: allEmails.size,
  };
}
