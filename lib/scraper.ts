import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { loadConfig } from './config';
import {
  createStealthContext,
  simulateHumanBehavior,
  simulateHumanScroll,
  humanWait,
  randomDelay,
} from './stealth';
import { getPlaywrightProxyConfig, trackProxyRequest, reportProxySuccess, reportProxyFailure, shouldUseDirect } from './proxy';
import { acquireRateLimit } from './rate-limiter';
import {
  searchWithApis,
  isApiFallbackAvailable,
  shouldPreferApis,
  recordSourceUsage,
  resetSessionTracking,
  getApiAvailabilityStatus,
  canApisFullfillRequest,
  getCostSavings,
  getSourceUsageSummary,
} from './api-fallback';
import { withPooledBrowser, warmupBrowserPool } from './browser-pool';
import {
  type DataSource,
  getPrioritizedSources,
  getPrioritizedSourcesWithFilters,
  groupSourcesByPriority,
  filterSourcesByResultCount,
  detectQueryCategory,
  getCategoryDescription,
} from './source-prioritizer';
import {
  getCachedSearchResults,
  cacheSearchResults,
  getCachedBusiness,
  cacheBusinesses,
  getCacheStats,
} from './cache';
import {
  processBusinessBatch,
  type EnrichedBusiness,
} from './data-quality';
import {
  estimateCompanySize,
  matchesCompanySizeFilter,
  classifyBusinessType,
  type CompanySizeEstimate,
} from './company-size';

export interface ScrapedBusiness {
  name: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  instagram: string | null;
  rating: number | null;
  review_count: number | null;
  source: string;
  email?: string | null; // Email found during scraping (e.g., from Google Maps)
  years_in_business?: number | null; // Years in business if available (e.g., from BBB)
  // Quality scoring (added by data-quality module)
  quality_score?: number; // Overall quality score 0-1
  quality_flags?: string[]; // Quality issues detected
  // B2C targeting fields
  employee_count?: number | null;
  industry_code?: string | null;
  is_b2b?: boolean;
}

// B2C search filter options
export interface SearchFilters {
  industryCategory?: string | null;
  companySizeMin?: number | null;
  companySizeMax?: number | null;
  targetState?: string | null;
  b2cOnly?: boolean;
}

export type QueryType = 'local' | 'online' | 'hybrid';

async function getBrowser(): Promise<Browser> {
  const browserlessKey = process.env.BROWSERLESS_API_KEY;
  const proxyConfig = getPlaywrightProxyConfig();

  if (browserlessKey) {
    // Connect to Browserless.io cloud browser using CDP
    // Note: Browserless handles proxy internally if configured in their dashboard
    return chromium.connectOverCDP(`wss://production-sfo.browserless.io?token=${browserlessKey}`);
  }

  // Build launch options
  const launchOptions: Parameters<typeof chromium.launch>[0] = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };

  // Add proxy if enabled and not falling back to direct
  if (proxyConfig && !shouldUseDirect()) {
    launchOptions.proxy = proxyConfig.proxy;
  }

  return chromium.launch(launchOptions);
}

/**
 * Navigate to a URL with rate limiting and stealth features
 */
async function stealthNavigate(
  page: Page,
  url: string,
  options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number }
): Promise<void> {
  const config = loadConfig();

  // Apply rate limiting
  if (config.rateLimit.enabled) {
    await acquireRateLimit(url);
  }

  // Track proxy usage
  trackProxyRequest();

  try {
    await page.goto(url, {
      waitUntil: options?.waitUntil || 'domcontentloaded',
      timeout: options?.timeout || 20000,
    });
    reportProxySuccess();

    // Simulate human behavior after navigation
    if (config.stealth.humanBehavior) {
      await simulateHumanBehavior(page);
    }
  } catch (error) {
    reportProxyFailure();
    throw error;
  }
}

export function classifyQuery(query: string, location: string): QueryType {
  const localSignals = ['dentist', 'doctor', 'spa', 'salon', 'restaurant', 'store', 'clinic', 'studio', 'gym', 'fitness', 'shop', 'repair', 'service', 'plumber', 'electrician', 'contractor', 'builder'];
  const onlineSignals = ['dtc', 'brand', 'subscription', 'startup', 'maker', 'artisan', 'company', 'ecommerce', 'e-commerce', 'online', 'digital'];
  const q = query.toLowerCase();
  const hasLocation = Boolean(location?.trim());
  if (q.includes('dtc') || q.includes('brand')) return 'online';
  if (hasLocation && localSignals.some(s => q.includes(s))) return 'local';
  if (onlineSignals.some(s => q.includes(s))) return 'online';
  return hasLocation ? 'local' : 'hybrid';
}

const SKIP_DOMAINS = ['google.com', 'facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'wikipedia.org', 'amazon.com', 'ebay.com', 'yelp.com', 'tripadvisor.com', 'pinterest.com', 'reddit.com', 'tiktok.com', 'apple.com', 'microsoft.com', 'forbes.com', 'bloomberg.com'];

function shouldSkipDomain(url: string): boolean {
  try { return SKIP_DOMAINS.some(d => new URL(url).hostname.toLowerCase().includes(d)); } catch { return false; }
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

async function scrapeGoogleMaps(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    const searchQuery = location ? `${query} in ${location}` : query;
    onProgress?.(`Searching Google Maps for "${searchQuery}"...`);
    await stealthNavigate(page, `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, { timeout: 20000 });
    await humanWait(page, 3000, 30);
    try { await page.waitForSelector('[role="feed"]', { timeout: 15000 }); } catch { await context.close(); return results; }
    onProgress?.('Loading more results...');
    // Scroll until we have enough listings or hit the end
    // Scale scroll attempts based on target: more results = more scrolling
    const maxScrollAttempts = Math.min(50, Math.max(15, Math.ceil(limit / 10)));
    let lastCount = 0;
    let noNewResultsCount = 0;
    for (let i = 0; i < maxScrollAttempts; i++) {
      await page.evaluate(() => { const feed = document.querySelector('[role="feed"]'); if (feed) feed.scrollTop = feed.scrollHeight; });
      await humanWait(page, 2000, 25); // Slightly faster scrolling for volume
      const currentCount = await page.$$eval('[role="feed"] > div > div > a', els => els.length);
      onProgress?.(`Loading results... (${currentCount} found)`);
      if (currentCount >= limit * 1.2) break; // Load 20% extra to account for filtering
      if (currentCount === lastCount) {
        noNewResultsCount++;
        if (noNewResultsCount >= 3) break; // No new results after 3 attempts, probably at the end
      } else {
        noNewResultsCount = 0;
      }
      lastCount = currentCount;
    }
    const listings = await page.$$('[role="feed"] > div > div > a');
    onProgress?.(`Processing ${Math.min(listings.length, limit)} listings...`);
    for (const listing of listings) {
      if (results.length >= limit) break;
      try {
        await listing.click();
        await humanWait(page, 2000, 35);
        // Try multiple selectors for the business name
        let name = await page.$eval('h1.DUwDvf', el => el.textContent?.trim() || '').catch(() => '');
        if (!name) name = await page.$eval('h1.fontHeadlineLarge', el => el.textContent?.trim() || '').catch(() => '');
        if (!name) name = await page.$eval('div[role="main"] h1', el => el.textContent?.trim() || '').catch(() => '');
        if (!name || name === 'Results' || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());
        const phone = await page.$eval('[data-tooltip="Copy phone number"]', el => el.textContent?.trim() || '').catch(() => null);
        const address = await page.$eval('[data-tooltip="Copy address"]', el => el.textContent?.trim() || '').catch(() => null);
        // Extract website URL and clean up Google redirect
        let website = await page.$eval('a[data-tooltip="Open website"]', el => el.getAttribute('href') || '').catch(() => null);
        if (website && website.includes('/url?q=')) {
          const match = website.match(/\/url\?q=([^&]+)/);
          if (match) website = decodeURIComponent(match[1]);
        }
        const ratingText = await page.$eval('[role="img"][aria-label*="stars"]', el => el.getAttribute('aria-label') || '').catch(() => '');
        const ratingMatch = ratingText.match(/([\d.]+)\s*stars/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
        const reviewText = await page.$eval('button[jsaction*="review"]', el => el.textContent || '').catch(() => '');
        const reviewMatch = reviewText.match(/(\d+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : null;

        // Enhanced email extraction from Google Maps / Google My Business
        let email: string | null = null;
        try {
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const skipDomains = ['google.com', 'gstatic.com', 'gmail.com', 'googleusercontent.com', 'schema.org', 'googleapis.com', 'ggpht.com'];

          // Method 1: Check for mailto links in the business panel
          const mailtoEmail = await page.$eval('a[href^="mailto:"]', el => {
            const href = el.getAttribute('href') || '';
            return href.replace('mailto:', '').split('?')[0];
          }).catch(() => null);

          if (mailtoEmail && mailtoEmail.includes('@')) {
            const domain = mailtoEmail.split('@')[1]?.toLowerCase();
            if (domain && !skipDomains.some(d => domain.includes(d))) {
              email = mailtoEmail.toLowerCase();
            }
          }

          // Method 2: Click "About" tab if it exists to reveal more info
          if (!email) {
            try {
              const aboutTab = await page.$('button[aria-label*="About"], [role="tab"]:has-text("About")');
              if (aboutTab) {
                await aboutTab.click();
                await humanWait(page, 1500, 40);
              }
            } catch {}
          }

          // Method 3: Look for email in specific GMB info sections
          if (!email) {
            const gmailInfoSelectors = [
              '[data-tooltip*="email"]',
              '[aria-label*="email"]',
              '[data-item-id*="email"]',
              'button[data-item-id*="authority"]',
              '.section-info-text',
              '[class*="business-info"]'
            ];

            for (const selector of gmailInfoSelectors) {
              try {
                const text = await page.$eval(selector, el => el.textContent || '');
                const matches = text.match(emailRegex);
                if (matches) {
                  const valid = matches.find(e => {
                    const d = e.split('@')[1]?.toLowerCase();
                    return d && !skipDomains.some(skip => d.includes(skip));
                  });
                  if (valid) {
                    email = valid.toLowerCase();
                    break;
                  }
                }
              } catch {}
            }
          }

          // Method 4: Scan full page content as fallback
          if (!email) {
            const pageContent = await page.content();
            const foundEmails = pageContent.match(emailRegex) || [];
            const validEmail = foundEmails.find(e => {
              const domain = e.split('@')[1]?.toLowerCase();
              return domain && !skipDomains.some(d => domain.includes(d));
            });
            if (validEmail) email = validEmail.toLowerCase();
          }

          // Method 5: Check aria-labels and data attributes for hidden emails
          if (!email) {
            const ariaEmails = await page.evaluate(() => {
              const found: string[] = [];
              const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
              document.querySelectorAll('[aria-label], [data-value]').forEach(el => {
                const label = el.getAttribute('aria-label') || el.getAttribute('data-value') || '';
                const matches = label.match(emailRegex);
                if (matches) found.push(...matches);
              });
              return found;
            });

            const validAriaEmail = ariaEmails.find(e => {
              const domain = e.split('@')[1]?.toLowerCase();
              return domain && !skipDomains.some(d => domain.includes(d));
            });
            if (validAriaEmail) email = validAriaEmail.toLowerCase();
          }
        } catch {}

        results.push({ name, website, phone, address, instagram: null, rating, review_count: reviewCount, source: 'google_maps', email });
        onProgress?.(`Found: ${name} (${results.length}/${limit})`);
      } catch {}
    }
  } finally { await context.close(); }
  return results;
}

async function scrapeGoogleSearch(browser: Browser, query: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenDomains = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const searchQueries = [`${query} brands`, `best ${query}`, `${query} companies`, `top ${query} 2024`];
  try {
    for (const searchQuery of searchQueries) {
      if (results.length >= limit) break;
      onProgress?.(`Searching: "${searchQuery}"...`);
      await stealthNavigate(page, `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=30`);
      await humanWait(page, 2000, 35);
      const searchResults = await page.$$('div.g');
      for (const result of searchResults) {
        if (results.length >= limit) break;
        try {
          const linkEl = await result.$('a'); const titleEl = await result.$('h3');
          if (!linkEl || !titleEl) continue;
          const url = await linkEl.getAttribute('href'); const title = await titleEl.textContent();
          if (!url || !title || shouldSkipDomain(url)) continue;
          const domain = extractDomain(url);
          if (!domain || seenDomains.has(domain)) continue;
          seenDomains.add(domain);
          results.push({ name: title.trim(), website: url, phone: null, address: null, instagram: null, rating: null, review_count: null, source: 'google_search' });
          onProgress?.(`Found: ${title.trim().substring(0, 40)}... (${results.length}/${limit})`);
        } catch {}
      }
    }
  } finally { await context.close(); }
  return results;
}

/**
 * Extract Local Pack results (the 3-pack with map that appears above organic results)
 */
async function extractLocalPack(page: Page): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];

  try {
    // Try multiple selectors for Local Pack container
    const localPackSelectors = [
      'div[data-attrid="kc:/local:local_pack"]',
      'div.VkpGBb',
      'div[jscontroller] div[data-cid]',
      'div.rllt__link',
    ];

    let localResults: any[] = [];

    // Find Local Pack results
    for (const selector of localPackSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        localResults = elements;
        break;
      }
    }

    // If no direct results found, try to find the local pack container and extract from there
    if (localResults.length === 0) {
      const packContainer = await page.$('div[data-async-context*="local"]');
      if (packContainer) {
        localResults = await packContainer.$$('div[data-cid], div.VkpGBb');
      }
    }

    for (const result of localResults.slice(0, 5)) {
      try {
        // Extract name - try multiple selectors
        let name = '';
        const nameSelectors = ['span.OSrXXb', 'div.dbg0pd', 'span.fontHeadlineSmall', 'div.qBF1Pd', 'span.tZPcob'];
        for (const sel of nameSelectors) {
          name = await result.$eval(sel, (el: Element) => el.textContent?.trim() || '').catch(() => '');
          if (name) break;
        }
        if (!name) continue;

        // Extract rating
        let rating: number | null = null;
        const ratingText = await result.$eval('span.MW4etd, span[role="img"][aria-label*="stars"], span.yi40Hd', (el: Element) => {
          const label = el.getAttribute('aria-label') || el.textContent || '';
          return label;
        }).catch(() => '');
        const ratingMatch = ratingText.match(/([\d.]+)/);
        if (ratingMatch) rating = parseFloat(ratingMatch[1]);

        // Extract review count
        let reviewCount: number | null = null;
        const reviewText = await result.$eval('span.UY7F9, span.RDApEe, span.rllt__details', (el: Element) => el.textContent || '').catch(() => '');
        const reviewMatch = reviewText.match(/\((\d+[,\d]*)\)/);
        if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''));

        // Extract details (address, phone often in second line)
        let address: string | null = null;
        let phone: string | null = null;
        const detailsText = await result.$eval('span.rllt__details, div.rllt__details, span.yi40Hd', (el: Element) => {
          // Get all text content including from child elements
          return el.textContent || '';
        }).catch(() => '');

        // Try to extract phone from details
        const phoneMatch = detailsText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
        if (phoneMatch) phone = phoneMatch[0];

        // Address is typically the remaining text after removing phone
        if (detailsText) {
          let addressText = detailsText.replace(phoneMatch?.[0] || '', '').replace(/[·•]/g, ',').trim();
          if (addressText.startsWith(',')) addressText = addressText.substring(1).trim();
          if (addressText.endsWith(',')) addressText = addressText.slice(0, -1).trim();
          if (addressText) address = addressText;
        }

        // Try to extract website - Local Pack often has "Website" button
        let website: string | null = null;
        const websiteLink = await result.$('a[data-ved][href*="http"]:not([href*="google.com"])');
        if (websiteLink) {
          website = await websiteLink.getAttribute('href');
          // Clean up Google redirect URLs
          if (website && website.includes('/url?q=')) {
            const match = website.match(/\/url\?q=([^&]+)/);
            if (match) website = decodeURIComponent(match[1]);
          }
        }

        results.push({
          name,
          website,
          phone,
          address,
          instagram: null,
          rating,
          review_count: reviewCount,
          source: 'google_serp'
        });
      } catch {}
    }
  } catch {}

  return results;
}

/**
 * Extract Knowledge Panel data (the right sidebar with business info)
 */
async function extractKnowledgePanel(page: Page): Promise<ScrapedBusiness | null> {
  try {
    // Check for Knowledge Panel
    const panelSelectors = ['div.kp-wholepage', 'div.knowledge-panel', 'div[data-attrid="title"]'];
    let panel = null;
    for (const sel of panelSelectors) {
      panel = await page.$(sel);
      if (panel) break;
    }
    if (!panel) return null;

    // Extract business name
    let name = '';
    const nameSels = ['h2[data-attrid="title"]', 'div[data-attrid="title"] span', 'h2.qrShPb'];
    for (const sel of nameSels) {
      name = await page.$eval(sel, (el: Element) => el.textContent?.trim() || '').catch(() => '');
      if (name) break;
    }
    if (!name) return null;

    // Extract phone
    let phone: string | null = null;
    phone = await page.$eval('span[data-dtype="d3ph"], a[href^="tel:"]', (el: Element) => {
      const href = el.getAttribute('href');
      if (href) return href.replace('tel:', '');
      return el.textContent?.trim() || '';
    }).catch(() => null);

    // Extract address
    let address: string | null = null;
    address = await page.$eval('span[data-dtype="d3adr"], div[data-attrid*="address"] span', (el: Element) => el.textContent?.trim() || '').catch(() => null);

    // Extract website
    let website: string | null = null;
    website = await page.$eval('a[data-dtype="d3web"], a[data-attrid*="website"]', (el: Element) => el.getAttribute('href') || '').catch(() => null);
    if (website && website.includes('/url?q=')) {
      const match = website.match(/\/url\?q=([^&]+)/);
      if (match) website = decodeURIComponent(match[1]);
    }

    // Extract rating
    let rating: number | null = null;
    const ratingText = await page.$eval('span[class*="rating"], div[data-attrid*="rating"]', (el: Element) => el.textContent || '').catch(() => '');
    const ratingMatch = ratingText.match(/([\d.]+)/);
    if (ratingMatch) rating = parseFloat(ratingMatch[1]);

    // Extract review count
    let reviewCount: number | null = null;
    const reviewText = await page.$eval('a[data-attrid*="review"], span[class*="review"]', (el: Element) => el.textContent || '').catch(() => '');
    const reviewMatch = reviewText.match(/(\d+[,\d]*)/);
    if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''));

    return {
      name,
      website,
      phone,
      address,
      instagram: null,
      rating,
      review_count: reviewCount,
      source: 'google_serp'
    };
  } catch {
    return null;
  }
}

/**
 * Extract organic search results with rich snippets
 */
async function extractOrganicResults(page: Page, limit: number, seenDomains: Set<string>): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];

  try {
    const organicResults = await page.$$('div.g');

    for (const result of organicResults) {
      if (results.length >= limit) break;

      try {
        const linkEl = await result.$('a');
        const titleEl = await result.$('h3');
        if (!linkEl || !titleEl) continue;

        const url = await linkEl.getAttribute('href');
        const title = await titleEl.textContent();
        if (!url || !title || shouldSkipDomain(url)) continue;

        const domain = extractDomain(url);
        if (!domain || seenDomains.has(domain)) continue;
        seenDomains.add(domain);

        // Extract snippet which may contain phone/address
        let phone: string | null = null;
        let address: string | null = null;
        const snippet = await result.$eval('div[data-content-feature], div.VwiC3b, span.aCOpRe', (el: Element) => el.textContent || '').catch(() => '');

        if (snippet) {
          // Try to extract phone from snippet
          const phoneMatch = snippet.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
          if (phoneMatch) phone = phoneMatch[0];

          // Try to extract address patterns (city, state zip)
          const addressMatch = snippet.match(/\d+[^,]+,\s*[^,]+,\s*[A-Z]{2}\s*\d{5}/);
          if (addressMatch) address = addressMatch[0];
        }

        // Check for rich snippet rating
        let rating: number | null = null;
        let reviewCount: number | null = null;
        const ratingText = await result.$eval('span[aria-label*="rating"], span.Aq14fc', (el: Element) => {
          return el.getAttribute('aria-label') || el.textContent || '';
        }).catch(() => '');
        const ratingMatch = ratingText.match(/([\d.]+)/);
        if (ratingMatch) rating = parseFloat(ratingMatch[1]);

        const reviewText = await result.$eval('span.hqLChc, span[class*="review"]', (el: Element) => el.textContent || '').catch(() => '');
        const reviewMatch = reviewText.match(/(\d+[,\d]*)/);
        if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''));

        results.push({
          name: title.trim(),
          website: url,
          phone,
          address,
          instagram: null,
          rating,
          review_count: reviewCount,
          source: 'google_serp'
        });
      } catch {}
    }
  } catch {}

  return results;
}

/**
 * Scrape Google SERP for business information
 * Extracts from Local Pack (3-pack), Knowledge Panel, and Organic results
 */
async function scrapeGoogleSERP(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenDomains = new Set<string>();
  const seenNames = new Set<string>();

  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    // Build search query with location
    const searchQuery = location ? `${query} in ${location}` : query;
    onProgress?.(`Searching Google SERP for "${searchQuery}"...`);

    await stealthNavigate(page, `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=20`);
    await humanWait(page, 2500, 30);

    // 1. Extract Local Pack first (highest quality data)
    onProgress?.('Extracting Local Pack results...');
    const localPackResults = await extractLocalPack(page);
    for (const biz of localPackResults) {
      if (results.length >= limit) break;
      const nameKey = biz.name.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);
      if (biz.website) {
        const domain = extractDomain(biz.website);
        if (domain) seenDomains.add(domain);
      }
      results.push(biz);
      onProgress?.(`Local Pack: ${biz.name} (${results.length}/${limit})`);
    }

    // 2. Extract Knowledge Panel if present
    if (results.length < limit) {
      onProgress?.('Checking for Knowledge Panel...');
      const knowledgePanelResult = await extractKnowledgePanel(page);
      if (knowledgePanelResult) {
        const nameKey = knowledgePanelResult.name.toLowerCase();
        if (!seenNames.has(nameKey)) {
          seenNames.add(nameKey);
          if (knowledgePanelResult.website) {
            const domain = extractDomain(knowledgePanelResult.website);
            if (domain) seenDomains.add(domain);
          }
          results.push(knowledgePanelResult);
          onProgress?.(`Knowledge Panel: ${knowledgePanelResult.name} (${results.length}/${limit})`);
        }
      }
    }

    // 3. Extract organic results for remaining quota
    if (results.length < limit) {
      onProgress?.('Extracting organic results...');
      const organicResults = await extractOrganicResults(page, limit - results.length, seenDomains);
      for (const biz of organicResults) {
        if (results.length >= limit) break;
        const nameKey = biz.name.toLowerCase();
        if (seenNames.has(nameKey)) continue;
        seenNames.add(nameKey);
        results.push(biz);
        onProgress?.(`Organic: ${biz.name.substring(0, 40)}... (${results.length}/${limit})`);
      }
    }

  } finally {
    await context.close();
  }

  return results;
}

async function scrapeInstagram(browser: Browser, query: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenHandles = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    onProgress?.(`Searching Instagram profiles...`);
    await stealthNavigate(page, `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com "${query}" brand`)}&num=50`);
    await humanWait(page, 2000, 35);
    const links = await page.$$('a[href*="instagram.com"]');
    for (const link of links) {
      if (results.length >= limit) break;
      try {
        const href = await link.getAttribute('href'); if (!href) continue;
        const handleMatch = href.match(/instagram\.com\/([a-zA-Z0-9._]+)/); if (!handleMatch) continue;
        const handle = handleMatch[1].toLowerCase();
        if (seenHandles.has(handle) || ['p', 'explore', 'reels', 'stories', 'accounts'].includes(handle)) continue;
        seenHandles.add(handle);
        const name = await link.evaluate(el => { const parent = el.closest('div.g'); if (parent) { const h3 = parent.querySelector('h3'); if (h3?.textContent) return h3.textContent.replace(/\s*[@•].*$/, '').replace(/\s*\|.*$/, '').trim(); } return null; }) || handle;
        results.push({ name, website: null, phone: null, address: null, instagram: `@${handle}`, rating: null, review_count: null, source: 'instagram' });
        onProgress?.(`Found Instagram: @${handle} (${results.length}/${limit})`);
      } catch {}
    }
  } finally { await context.close(); }
  return results;
}

async function scrapeYelp(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const seenLinks = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    // Paginate through Yelp results - each page has ~10 results
    const maxPages = Math.min(10, Math.ceil(limit / 8)); // Cap at 10 pages
    let currentPage = 0;

    while (results.length < limit && currentPage < maxPages) {
      const start = currentPage * 10;
      const searchUrl = start === 0
        ? `https://www.yelp.com/search?find_desc=${encodeURIComponent(query)}&find_loc=${encodeURIComponent(location)}`
        : `https://www.yelp.com/search?find_desc=${encodeURIComponent(query)}&find_loc=${encodeURIComponent(location)}&start=${start}`;

      onProgress?.(`Searching Yelp page ${currentPage + 1} for "${query}" in ${location}...`);
      await stealthNavigate(page, searchUrl, { timeout: 20000 });
      await humanWait(page, 2500, 30);

      // Get business links from search results
      const businessLinks = await page.$$eval('a[href*="/biz/"]', links =>
        [...new Set(links.map(l => l.getAttribute('href')).filter((h): h is string => Boolean(h && h.startsWith('/biz/') && !h.includes('?'))))]
      );

      // Filter out already seen links
      const newLinks = businessLinks.filter(link => !seenLinks.has(link));
      if (newLinks.length === 0) break; // No new results, stop pagination

      for (const link of newLinks) {
        seenLinks.add(link);
        if (results.length >= limit) break;

        try {
          await stealthNavigate(page, `https://www.yelp.com${link}`, { timeout: 15000 });
          await humanWait(page, 1500, 30);

          const name = await page.$eval('h1', el => el.textContent?.trim() || '').catch(() => '');
          if (!name || seenNames.has(name.toLowerCase())) continue;
          seenNames.add(name.toLowerCase());

          const phone = await page.$eval('p[class*="phone"]', el => el.textContent?.trim() || '').catch(() =>
            page.$eval('a[href^="tel:"]', el => el.textContent?.trim() || '').catch(() => null)
          );

          const address = await page.$eval('address', el => el.textContent?.trim().replace(/\s+/g, ' ') || '').catch(() => null);

          const website = await page.$eval('a[href*="biz_redir"]', el => {
            const href = el.getAttribute('href') || '';
            const match = href.match(/url=([^&]+)/);
            return match ? decodeURIComponent(match[1]) : null;
          }).catch(() => null);

          const ratingText = await page.$eval('[aria-label*="star rating"]', el => el.getAttribute('aria-label') || '').catch(() => '');
          const ratingMatch = ratingText.match(/([\d.]+)/);
          const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

          const reviewText = await page.$eval('a[href*="reviews"]', el => el.textContent || '').catch(() => '');
          const reviewMatch = reviewText.match(/(\d+)/);
          const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : null;

          results.push({ name, website, phone, address, instagram: null, rating, review_count: reviewCount, source: 'yelp' });
          onProgress?.(`Yelp: ${name} (${results.length}/${limit})`);
        } catch {}
      }

      currentPage++;
    }
  } finally { await context.close(); }
  return results;
}

async function scrapeYellowPages(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    // Paginate through Yellow Pages - each page has ~30 results
    const maxPages = Math.min(8, Math.ceil(limit / 25));
    let currentPage = 1;

    while (results.length < limit && currentPage <= maxPages) {
      const searchUrl = currentPage === 1
        ? `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(location)}`
        : `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(location)}&page=${currentPage}`;

      onProgress?.(`Searching Yellow Pages page ${currentPage} for "${query}" in ${location}...`);
      await stealthNavigate(page, searchUrl, { timeout: 20000 });
      await humanWait(page, 2000, 30);

      const listings = await page.$$('.result');
      if (listings.length === 0) break; // No more results

      let foundNew = false;
      for (const listing of listings) {
        if (results.length >= limit) break;
        try {
          const name = await listing.$eval('.business-name', el => el.textContent?.trim() || '').catch(() => '');
          if (!name || seenNames.has(name.toLowerCase())) continue;
          seenNames.add(name.toLowerCase());
          foundNew = true;

          const phone = await listing.$eval('.phones', el => el.textContent?.trim() || '').catch(() => null);
          const address = await listing.$eval('.adr', el => el.textContent?.trim().replace(/\s+/g, ' ') || '').catch(() => null);
          const website = await listing.$eval('a.track-visit-website', el => el.getAttribute('href') || '').catch(() => null);

          results.push({ name, website, phone, address, instagram: null, rating: null, review_count: null, source: 'yellowpages' });
          onProgress?.(`Yellow Pages: ${name} (${results.length}/${limit})`);
        } catch {}
      }

      if (!foundNew) break; // No new results found
      currentPage++;
    }
  } finally { await context.close(); }
  return results;
}

async function scrapeBBB(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    const searchUrl = `https://www.bbb.org/search?find_country=USA&find_text=${encodeURIComponent(query)}&find_loc=${encodeURIComponent(location)}&find_type=Category`;
    onProgress?.(`Searching BBB for "${query}" in ${location}...`);
    await stealthNavigate(page, searchUrl, { timeout: 20000 });
    await humanWait(page, 3000, 30);

    // Get business detail links
    const businessLinks = await page.$$eval('a[href*="/profile/"]', links =>
      [...new Set(links.map(l => l.getAttribute('href')).filter((h): h is string => Boolean(h && h.includes('/profile/'))))]
    );

    // Process up to limit * 1.5 links to account for filtering
    const linksToProcess = businessLinks.slice(0, Math.ceil(limit * 1.5));
    for (const link of linksToProcess) {
      if (results.length >= limit) break;
      try {
        const fullUrl = link.startsWith('http') ? link : `https://www.bbb.org${link}`;
        await stealthNavigate(page, fullUrl, { timeout: 15000 });
        await humanWait(page, 1500, 30);

        const name = await page.$eval('h1', el => el.textContent?.trim() || '').catch(() => '');
        if (!name || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        const phone = await page.$eval('a[href^="tel:"]', el => el.textContent?.trim() || '').catch(() => null);
        const address = await page.$eval('.MuiGrid-root address, .dtm-address', el => el.textContent?.trim().replace(/\s+/g, ' ') || '').catch(() => null);
        const website = await page.$eval('a[href*="track-visit-website"], a.dtm-url', el => el.getAttribute('href') || '').catch(() => null);

        // BBB often shows rating as letter grade
        const ratingText = await page.$eval('.dtm-rating, [class*="rating"]', el => el.textContent?.trim() || '').catch(() => '');
        const letterGrade = ratingText.match(/([A-F][+-]?)/);
        const gradeToNumber: Record<string, number> = { 'A+': 5, 'A': 4.8, 'A-': 4.5, 'B+': 4.2, 'B': 4, 'B-': 3.7, 'C+': 3.4, 'C': 3, 'C-': 2.7, 'D+': 2.4, 'D': 2, 'D-': 1.7, 'F': 1 };
        const rating = letterGrade ? gradeToNumber[letterGrade[1]] || null : null;

        // Extract years in business from BBB profile
        let yearsInBusiness: number | null = null;
        try {
          const pageText = await page.textContent('body') || '';
          // BBB shows "Years in Business: X" or "Business Started: YYYY"
          const yearsMatch = pageText.match(/Years?\s*in\s*Business[:\s]+(\d+)/i);
          if (yearsMatch) {
            yearsInBusiness = parseInt(yearsMatch[1]);
          } else {
            // Try to find "Business Started" and calculate years
            const startedMatch = pageText.match(/Business\s*Started[:\s]+(\d{4})|Started[:\s]+(\d{4})|Established[:\s]+(\d{4})|Founded[:\s]+(\d{4})/i);
            if (startedMatch) {
              const year = parseInt(startedMatch[1] || startedMatch[2] || startedMatch[3] || startedMatch[4]);
              if (year > 1900 && year <= new Date().getFullYear()) {
                yearsInBusiness = new Date().getFullYear() - year;
              }
            }
          }
        } catch {}

        results.push({ name, website, phone, address, instagram: null, rating, review_count: null, source: 'bbb', years_in_business: yearsInBusiness });
        onProgress?.(`BBB: ${name} (${results.length}/${limit})`);
      } catch {}
    }
  } finally { await context.close(); }
  return results;
}

// Industry-specific: Healthgrades (doctors, dentists, medical)
async function scrapeHealthgrades(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    const searchUrl = `https://www.healthgrades.com/search?what=${encodeURIComponent(query)}&where=${encodeURIComponent(location)}`;
    onProgress?.(`Searching Healthgrades for "${query}" in ${location}...`);
    await stealthNavigate(page, searchUrl, { timeout: 20000 });
    await humanWait(page, 3000, 30);

    // Get provider links
    const providerLinks = await page.$$eval('a[href*="/provider/"]', links =>
      [...new Set(links.map(l => l.getAttribute('href')).filter((h): h is string => Boolean(h && h.includes('/provider/'))))]
    );

    for (const link of providerLinks.slice(0, Math.ceil(limit * 1.5))) {
      if (results.length >= limit) break;
      try {
        const fullUrl = link.startsWith('http') ? link : `https://www.healthgrades.com${link}`;
        await stealthNavigate(page, fullUrl, { timeout: 15000 });
        await humanWait(page, 2000, 35);

        const name = await page.$eval('h1', el => el.textContent?.trim() || '').catch(() => '');
        if (!name || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        const phone = await page.$eval('a[href^="tel:"]', el => el.textContent?.trim() || '').catch(() => null);
        const address = await page.$eval('[data-qa-target="practice-location-address"]', el => el.textContent?.trim().replace(/\s+/g, ' ') || '').catch(() => null);
        const website = await page.$eval('a[data-qa-target="practice-website"]', el => el.getAttribute('href') || '').catch(() => null);

        const ratingText = await page.$eval('[class*="star-rating"]', el => el.textContent?.trim() || '').catch(() => '');
        const ratingMatch = ratingText.match(/([\d.]+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        results.push({ name, website, phone, address, instagram: null, rating, review_count: null, source: 'healthgrades' });
        onProgress?.(`Healthgrades: ${name} (${results.length}/${limit})`);
      } catch {}
    }
  } finally { await context.close(); }
  return results;
}

// Industry-specific: Zocdoc (doctors, dentists, medical)
async function scrapeZocdoc(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    const searchUrl = `https://www.zocdoc.com/search?address=${encodeURIComponent(location)}&searchQueryTerm=${encodeURIComponent(query)}`;
    onProgress?.(`Searching Zocdoc for "${query}" in ${location}...`);
    await stealthNavigate(page, searchUrl, { timeout: 20000 });
    await humanWait(page, 3000, 30);

    // Get doctor profile links
    const doctorLinks = await page.$$eval('a[href*="/doctor/"]', links =>
      [...new Set(links.map(l => l.getAttribute('href')).filter((h): h is string => Boolean(h && h.includes('/doctor/'))))]
    );

    for (const link of doctorLinks.slice(0, Math.ceil(limit * 1.5))) {
      if (results.length >= limit) break;
      try {
        const fullUrl = link.startsWith('http') ? link : `https://www.zocdoc.com${link}`;
        await stealthNavigate(page, fullUrl, { timeout: 15000 });
        await humanWait(page, 2000, 35);

        const name = await page.$eval('h1', el => el.textContent?.trim() || '').catch(() => '');
        if (!name || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        const phone = await page.$eval('a[href^="tel:"]', el => el.textContent?.trim() || '').catch(() => null);
        const address = await page.$eval('[class*="address"], [data-test="address"]', el => el.textContent?.trim().replace(/\s+/g, ' ') || '').catch(() => null);

        const ratingText = await page.$eval('[class*="rating"]', el => el.textContent?.trim() || '').catch(() => '');
        const ratingMatch = ratingText.match(/([\d.]+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        const reviewText = await page.$eval('[class*="review-count"]', el => el.textContent || '').catch(() => '');
        const reviewMatch = reviewText.match(/(\d+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : null;

        results.push({ name, website: null, phone, address, instagram: null, rating, review_count: reviewCount, source: 'zocdoc' });
        onProgress?.(`Zocdoc: ${name} (${results.length}/${limit})`);
      } catch {}
    }
  } finally { await context.close(); }
  return results;
}

// Industry-specific: Angi (home services)
async function scrapeAngi(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    const searchUrl = `https://www.angi.com/search?query=${encodeURIComponent(query)}&zip=${encodeURIComponent(location)}`;
    onProgress?.(`Searching Angi for "${query}" in ${location}...`);
    await stealthNavigate(page, searchUrl, { timeout: 20000 });
    await humanWait(page, 3000, 30);

    // Get company links
    const companyLinks = await page.$$eval('a[href*="/companylist/"]', links =>
      [...new Set(links.map(l => l.getAttribute('href')).filter((h): h is string => Boolean(h)))]
    );

    for (const link of companyLinks.slice(0, Math.ceil(limit * 1.5))) {
      if (results.length >= limit) break;
      try {
        const fullUrl = link.startsWith('http') ? link : `https://www.angi.com${link}`;
        await stealthNavigate(page, fullUrl, { timeout: 15000 });
        await humanWait(page, 2000, 35);

        const name = await page.$eval('h1', el => el.textContent?.trim() || '').catch(() => '');
        if (!name || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        const phone = await page.$eval('a[href^="tel:"]', el => el.textContent?.trim() || '').catch(() => null);
        const address = await page.$eval('[class*="address"]', el => el.textContent?.trim().replace(/\s+/g, ' ') || '').catch(() => null);
        const website = await page.$eval('a[data-test="website-link"]', el => el.getAttribute('href') || '').catch(() => null);

        const ratingText = await page.$eval('[class*="rating"]', el => el.textContent?.trim() || '').catch(() => '');
        const ratingMatch = ratingText.match(/([\d.]+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        const reviewText = await page.$eval('[class*="review"]', el => el.textContent || '').catch(() => '');
        const reviewMatch = reviewText.match(/(\d+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : null;

        results.push({ name, website, phone, address, instagram: null, rating, review_count: reviewCount, source: 'angi' });
        onProgress?.(`Angi: ${name} (${results.length}/${limit})`);
      } catch {}
    }
  } finally { await context.close(); }
  return results;
}

// Chamber of Commerce scraper - searches local chamber directories
async function scrapeChamberOfCommerce(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    // Search Google for local chamber of commerce business directories
    const searchQuery = `"${location}" chamber of commerce business directory ${query}`;
    onProgress?.(`Searching Chamber of Commerce for "${query}" in ${location}...`);

    await stealthNavigate(page, `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=20`, { timeout: 20000 });
    await humanWait(page, 2000, 35);

    // Find chamber directory links
    const chamberLinks = await page.evaluate(() => {
      const links: string[] = [];
      const results = document.querySelectorAll('a');
      results.forEach(a => {
        const href = a.getAttribute('href') || '';
        // Look for chamber of commerce member directory URLs
        if ((href.includes('chamber') || href.includes('commerce')) &&
            (href.includes('directory') || href.includes('member') || href.includes('business') || href.includes('list'))) {
          if (href.startsWith('http') && !href.includes('google.com')) {
            links.push(href);
          }
        }
      });
      return [...new Set(links)].slice(0, 5);
    });

    // Visit chamber directories and extract business listings
    for (const chamberUrl of chamberLinks) {
      if (results.length >= limit) break;

      try {
        await stealthNavigate(page, chamberUrl, { timeout: 15000 });
        await humanWait(page, 2000, 35);

        // Extract business information from directory pages
        const businesses = await page.evaluate((searchQuery) => {
          const found: Array<{
            name: string;
            website: string | null;
            phone: string | null;
            address: string | null;
            email: string | null;
          }> = [];

          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const phoneRegex = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

          // Common selectors for chamber directory listings
          const listingSelectors = [
            '.directory-item', '.member-item', '.business-listing', '.listing',
            '[class*="directory"]', '[class*="member"]', '[class*="business"]',
            '.card', 'article', '.result'
          ];

          for (const selector of listingSelectors) {
            const items = document.querySelectorAll(selector);
            if (items.length > 0) {
              items.forEach(item => {
                const text = item.textContent || '';
                const lowerText = text.toLowerCase();

                // Check if this listing might match our query
                if (!searchQuery || lowerText.includes(searchQuery.toLowerCase())) {
                  // Extract name (usually in h2, h3, h4, or strong)
                  const nameEl = item.querySelector('h2, h3, h4, h5, strong, .name, .title, [class*="name"]');
                  const name = nameEl?.textContent?.trim() || '';

                  if (name && name.length > 2 && name.length < 100) {
                    // Extract website
                    const websiteEl = item.querySelector('a[href^="http"]:not([href*="facebook"]):not([href*="twitter"]):not([href*="linkedin"]):not([href*="instagram"])');
                    let website = websiteEl?.getAttribute('href') || null;
                    if (website && (website.includes('chamber') || website.includes('commerce'))) {
                      website = null; // Skip links back to chamber site
                    }

                    // Extract phone
                    const phoneMatch = text.match(phoneRegex);
                    const phone = phoneMatch ? phoneMatch[0] : null;

                    // Extract email
                    const emailMatch = text.match(emailRegex);
                    let email = emailMatch ? emailMatch[0] : null;
                    if (email && (email.includes('chamber') || email.includes('commerce'))) {
                      email = null; // Skip chamber emails
                    }

                    // Extract address (look for patterns with state abbreviations)
                    const addressMatch = text.match(/\d+[^,]+,\s*[^,]+,\s*[A-Z]{2}\s*\d{5}/);
                    const address = addressMatch ? addressMatch[0] : null;

                    found.push({ name, website, phone, address, email });
                  }
                }
              });
              if (found.length > 0) break; // Found listings with this selector
            }
          }

          return found.slice(0, 20);
        }, query);

        for (const biz of businesses) {
          if (results.length >= limit) break;
          if (!biz.name || seenNames.has(biz.name.toLowerCase())) continue;
          seenNames.add(biz.name.toLowerCase());

          const business: ScrapedBusiness = {
            name: biz.name,
            website: biz.website,
            phone: biz.phone,
            address: biz.address,
            instagram: null,
            rating: null,
            review_count: null,
            source: 'chamber_of_commerce'
          };
          if (biz.email) (business as any).email = biz.email;

          results.push(business);
          onProgress?.(`Chamber of Commerce: ${biz.name} (${results.length}/${limit})`);
        }
      } catch {
        // Failed to scrape this chamber, continue to next
      }
    }
  } finally {
    await context.close();
  }

  return results;
}

// Manta - Small business directory
async function scrapeManta(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    // Format location for Manta URL (city-state format)
    const locationSlug = location.toLowerCase().replace(/[,\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
    const querySlug = query.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const maxPages = Math.min(5, Math.ceil(limit / 20));
    let currentPage = 1;

    while (results.length < limit && currentPage <= maxPages) {
      const searchUrl = currentPage === 1
        ? `https://www.manta.com/search?search=${encodeURIComponent(query)}&search_location=${encodeURIComponent(location)}`
        : `https://www.manta.com/search?search=${encodeURIComponent(query)}&search_location=${encodeURIComponent(location)}&pg=${currentPage}`;

      onProgress?.(`Searching Manta page ${currentPage}...`);
      await stealthNavigate(page, searchUrl, { timeout: 20000 });
      await humanWait(page, 2000, 30);

      const listings = await page.$$('.card, .search-result, [class*="listing"]');
      if (listings.length === 0) break;

      let foundNew = false;
      for (const listing of listings) {
        if (results.length >= limit) break;
        try {
          const name = await listing.$eval('h2, h3, .company-name, [class*="title"]', (el: Element) => el.textContent?.trim() || '').catch(() => '');
          if (!name || seenNames.has(name.toLowerCase())) continue;
          seenNames.add(name.toLowerCase());
          foundNew = true;

          const phone = await listing.$eval('a[href^="tel:"], .phone', (el: Element) => el.textContent?.trim() || '').catch(() => null);
          const address = await listing.$eval('.address, [class*="address"]', (el: Element) => el.textContent?.trim().replace(/\s+/g, ' ') || '').catch(() => null);
          const website = await listing.$eval('a[href*="http"]:not([href*="manta.com"])', (el: Element) => el.getAttribute('href') || '').catch(() => null);

          results.push({ name, website, phone, address, instagram: null, rating: null, review_count: null, source: 'manta' });
          onProgress?.(`Manta: ${name} (${results.length}/${limit})`);
        } catch {}
      }

      if (!foundNew) break;
      currentPage++;
    }
  } finally { await context.close(); }
  return results;
}

// Thumbtack - Service professionals
async function scrapeThumbtack(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    const searchUrl = `https://www.thumbtack.com/search/${encodeURIComponent(query)}/${encodeURIComponent(location)}`;
    onProgress?.(`Searching Thumbtack for "${query}" in ${location}...`);
    await stealthNavigate(page, searchUrl, { timeout: 20000 });
    await humanWait(page, 3000, 30);

    // Scroll to load more results
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await humanWait(page, 1500, 25);
    }

    const profileLinks = await page.$$eval('a[href*="/pro/"]', links =>
      [...new Set(links.map(l => l.getAttribute('href')).filter((h): h is string => Boolean(h && h.includes('/pro/'))))]
    );

    for (const link of profileLinks.slice(0, Math.ceil(limit * 1.5))) {
      if (results.length >= limit) break;
      try {
        const fullUrl = link.startsWith('http') ? link : `https://www.thumbtack.com${link}`;
        await stealthNavigate(page, fullUrl, { timeout: 15000 });
        await humanWait(page, 1500, 30);

        const name = await page.$eval('h1', (el: Element) => el.textContent?.trim() || '').catch(() => '');
        if (!name || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        const phone = await page.$eval('a[href^="tel:"]', (el: Element) => el.textContent?.trim() || '').catch(() => null);
        const address = await page.$eval('[class*="location"], [class*="address"]', (el: Element) => el.textContent?.trim() || '').catch(() => null);

        const ratingText = await page.$eval('[class*="rating"], [class*="stars"]', (el: Element) => el.textContent || el.getAttribute('aria-label') || '').catch(() => '');
        const ratingMatch = ratingText.match(/([\d.]+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        const reviewText = await page.$eval('[class*="review"]', (el: Element) => el.textContent || '').catch(() => '');
        const reviewMatch = reviewText.match(/(\d+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : null;

        results.push({ name, website: null, phone, address, instagram: null, rating, review_count: reviewCount, source: 'thumbtack' });
        onProgress?.(`Thumbtack: ${name} (${results.length}/${limit})`);
      } catch {}
    }
  } finally { await context.close(); }
  return results;
}

// TripAdvisor - Restaurants, hotels, attractions
async function scrapeTripAdvisor(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    const searchUrl = `https://www.tripadvisor.com/Search?q=${encodeURIComponent(query + ' ' + location)}`;
    onProgress?.(`Searching TripAdvisor for "${query}" in ${location}...`);
    await stealthNavigate(page, searchUrl, { timeout: 20000 });
    await humanWait(page, 3000, 30);

    // Get business links
    const businessLinks = await page.$$eval('a[href*="/Restaurant_Review"], a[href*="/Hotel_Review"], a[href*="/Attraction_Review"]', links =>
      [...new Set(links.map(l => l.getAttribute('href')).filter((h): h is string => Boolean(h)))]
    );

    for (const link of businessLinks.slice(0, Math.ceil(limit * 1.5))) {
      if (results.length >= limit) break;
      try {
        const fullUrl = link.startsWith('http') ? link : `https://www.tripadvisor.com${link}`;
        await stealthNavigate(page, fullUrl, { timeout: 15000 });
        await humanWait(page, 2000, 30);

        const name = await page.$eval('h1', (el: Element) => el.textContent?.trim() || '').catch(() => '');
        if (!name || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        const phone = await page.$eval('a[href^="tel:"], [class*="phone"]', (el: Element) => {
          const href = el.getAttribute('href');
          return href ? href.replace('tel:', '') : el.textContent?.trim() || '';
        }).catch(() => null);

        const address = await page.$eval('[class*="address"], [data-test-target="restaurant-address"]', (el: Element) => el.textContent?.trim().replace(/\s+/g, ' ') || '').catch(() => null);

        const website = await page.$eval('a[class*="website"], a[data-test-target="website-link"]', (el: Element) => el.getAttribute('href') || '').catch(() => null);

        const ratingText = await page.$eval('[class*="rating"], svg[aria-label*="bubble"]', (el: Element) => el.getAttribute('aria-label') || el.textContent || '').catch(() => '');
        const ratingMatch = ratingText.match(/([\d.]+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        const reviewText = await page.$eval('[class*="reviewCount"], [class*="review"]', (el: Element) => el.textContent || '').catch(() => '');
        const reviewMatch = reviewText.match(/([\d,]+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : null;

        results.push({ name, website, phone, address, instagram: null, rating, review_count: reviewCount, source: 'tripadvisor' });
        onProgress?.(`TripAdvisor: ${name} (${results.length}/${limit})`);
      } catch {}
    }
  } finally { await context.close(); }
  return results;
}

// Avvo - Lawyers and legal professionals
async function scrapeAvvo(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    // Avvo uses specific practice area URLs
    const practiceArea = query.toLowerCase().includes('lawyer') || query.toLowerCase().includes('attorney')
      ? query.replace(/lawyer|attorney/gi, '').trim()
      : query;

    const searchUrl = `https://www.avvo.com/search/lawyer_search?q=${encodeURIComponent(practiceArea)}&loc=${encodeURIComponent(location)}`;
    onProgress?.(`Searching Avvo for "${query}" in ${location}...`);
    await stealthNavigate(page, searchUrl, { timeout: 20000 });
    await humanWait(page, 3000, 30);

    const lawyerLinks = await page.$$eval('a[href*="/attorneys/"]', links =>
      [...new Set(links.map(l => l.getAttribute('href')).filter((h): h is string => Boolean(h && h.includes('/attorneys/'))))]
    );

    for (const link of lawyerLinks.slice(0, Math.ceil(limit * 1.5))) {
      if (results.length >= limit) break;
      try {
        const fullUrl = link.startsWith('http') ? link : `https://www.avvo.com${link}`;
        await stealthNavigate(page, fullUrl, { timeout: 15000 });
        await humanWait(page, 1500, 30);

        const name = await page.$eval('h1', (el: Element) => el.textContent?.trim() || '').catch(() => '');
        if (!name || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        const phone = await page.$eval('a[href^="tel:"], [class*="phone"]', (el: Element) => el.textContent?.trim() || '').catch(() => null);
        const address = await page.$eval('[class*="address"], [class*="location"]', (el: Element) => el.textContent?.trim().replace(/\s+/g, ' ') || '').catch(() => null);
        const website = await page.$eval('a[class*="website"]', (el: Element) => el.getAttribute('href') || '').catch(() => null);

        const ratingText = await page.$eval('[class*="rating"]', (el: Element) => el.textContent || '').catch(() => '');
        const ratingMatch = ratingText.match(/([\d.]+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        const reviewText = await page.$eval('[class*="review"]', (el: Element) => el.textContent || '').catch(() => '');
        const reviewMatch = reviewText.match(/(\d+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : null;

        results.push({ name, website, phone, address, instagram: null, rating, review_count: reviewCount, source: 'avvo' });
        onProgress?.(`Avvo: ${name} (${results.length}/${limit})`);
      } catch {}
    }
  } finally { await context.close(); }
  return results;
}

// Houzz - Home improvement professionals
async function scrapeHouzz(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    const searchUrl = `https://www.houzz.com/professionals/query/${encodeURIComponent(query)}/location/${encodeURIComponent(location)}`;
    onProgress?.(`Searching Houzz for "${query}" in ${location}...`);
    await stealthNavigate(page, searchUrl, { timeout: 20000 });
    await humanWait(page, 3000, 30);

    // Scroll to load more
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await humanWait(page, 1500, 25);
    }

    const proLinks = await page.$$eval('a[href*="/professionals/"], a[href*="/pro/"]', links =>
      [...new Set(links.map(l => l.getAttribute('href')).filter((h): h is string => Boolean(h)))]
    );

    for (const link of proLinks.slice(0, Math.ceil(limit * 1.5))) {
      if (results.length >= limit) break;
      try {
        const fullUrl = link.startsWith('http') ? link : `https://www.houzz.com${link}`;
        await stealthNavigate(page, fullUrl, { timeout: 15000 });
        await humanWait(page, 1500, 30);

        const name = await page.$eval('h1', (el: Element) => el.textContent?.trim() || '').catch(() => '');
        if (!name || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        const phone = await page.$eval('a[href^="tel:"], [class*="phone"]', (el: Element) => el.textContent?.trim() || '').catch(() => null);
        const address = await page.$eval('[class*="address"], [class*="location"]', (el: Element) => el.textContent?.trim().replace(/\s+/g, ' ') || '').catch(() => null);
        const website = await page.$eval('a[class*="website"], a[href*="redirect"]', (el: Element) => el.getAttribute('href') || '').catch(() => null);

        const ratingText = await page.$eval('[class*="rating"], [class*="stars"]', (el: Element) => el.textContent || el.getAttribute('aria-label') || '').catch(() => '');
        const ratingMatch = ratingText.match(/([\d.]+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        const reviewText = await page.$eval('[class*="review"]', (el: Element) => el.textContent || '').catch(() => '');
        const reviewMatch = reviewText.match(/(\d+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : null;

        results.push({ name, website, phone, address, instagram: null, rating, review_count: reviewCount, source: 'houzz' });
        onProgress?.(`Houzz: ${name} (${results.length}/${limit})`);
      } catch {}
    }
  } finally { await context.close(); }
  return results;
}

// HomeAdvisor - Home services
async function scrapeHomeAdvisor(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    const searchUrl = `https://www.homeadvisor.com/rated.${encodeURIComponent(query.replace(/\s+/g, '-'))}.${encodeURIComponent(location.replace(/[,\s]+/g, '-'))}.html`;
    onProgress?.(`Searching HomeAdvisor for "${query}" in ${location}...`);
    await stealthNavigate(page, searchUrl, { timeout: 20000 });
    await humanWait(page, 3000, 30);

    const proLinks = await page.$$eval('a[href*="/rated/"], a[href*="/sp/"]', links =>
      [...new Set(links.map(l => l.getAttribute('href')).filter((h): h is string => Boolean(h)))]
    );

    for (const link of proLinks.slice(0, Math.ceil(limit * 1.5))) {
      if (results.length >= limit) break;
      try {
        const fullUrl = link.startsWith('http') ? link : `https://www.homeadvisor.com${link}`;
        await stealthNavigate(page, fullUrl, { timeout: 15000 });
        await humanWait(page, 1500, 30);

        const name = await page.$eval('h1', (el: Element) => el.textContent?.trim() || '').catch(() => '');
        if (!name || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        const phone = await page.$eval('a[href^="tel:"]', (el: Element) => el.textContent?.trim() || '').catch(() => null);
        const address = await page.$eval('[class*="address"], [class*="location"]', (el: Element) => el.textContent?.trim().replace(/\s+/g, ' ') || '').catch(() => null);
        const website = await page.$eval('a[class*="website"]', (el: Element) => el.getAttribute('href') || '').catch(() => null);

        const ratingText = await page.$eval('[class*="rating"]', (el: Element) => el.textContent || '').catch(() => '');
        const ratingMatch = ratingText.match(/([\d.]+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        const reviewText = await page.$eval('[class*="review"]', (el: Element) => el.textContent || '').catch(() => '');
        const reviewMatch = reviewText.match(/(\d+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : null;

        results.push({ name, website, phone, address, instagram: null, rating, review_count: reviewCount, source: 'homeadvisor' });
        onProgress?.(`HomeAdvisor: ${name} (${results.length}/${limit})`);
      } catch {}
    }
  } finally { await context.close(); }
  return results;
}

// Bing Places - Microsoft's local business search
async function scrapeBingPlaces(browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void): Promise<ScrapedBusiness[]> {
  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();
  const context = await createStealthContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    const searchQuery = location ? `${query} in ${location}` : query;
    const searchUrl = `https://www.bing.com/maps?q=${encodeURIComponent(searchQuery)}`;
    onProgress?.(`Searching Bing Places for "${searchQuery}"...`);
    await stealthNavigate(page, searchUrl, { timeout: 20000 });
    await humanWait(page, 3000, 30);

    // Click on "List view" if available
    try {
      await page.click('[aria-label="List view"], [title*="list"]');
      await humanWait(page, 1500, 25);
    } catch {}

    // Scroll the results list
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => {
        const list = document.querySelector('.taskList, [class*="listing"]');
        if (list) list.scrollTop = list.scrollHeight;
      });
      await humanWait(page, 1500, 25);
    }

    const listings = await page.$$('.taskItem, .listing, [class*="business"]');

    for (const listing of listings) {
      if (results.length >= limit) break;
      try {
        const name = await listing.$eval('h2, .title, [class*="name"]', (el: Element) => el.textContent?.trim() || '').catch(() => '');
        if (!name || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        const phone = await listing.$eval('a[href^="tel:"], [class*="phone"]', (el: Element) => el.textContent?.trim() || '').catch(() => null);
        const address = await listing.$eval('[class*="address"]', (el: Element) => el.textContent?.trim().replace(/\s+/g, ' ') || '').catch(() => null);
        const website = await listing.$eval('a[href*="http"]:not([href*="bing.com"])', (el: Element) => el.getAttribute('href') || '').catch(() => null);

        const ratingText = await listing.$eval('[class*="rating"], [aria-label*="star"]', (el: Element) => el.textContent || el.getAttribute('aria-label') || '').catch(() => '');
        const ratingMatch = ratingText.match(/([\d.]+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        const reviewText = await listing.$eval('[class*="review"]', (el: Element) => el.textContent || '').catch(() => '');
        const reviewMatch = reviewText.match(/(\d+)/);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : null;

        results.push({ name, website, phone, address, instagram: null, rating, review_count: reviewCount, source: 'bing_places' });
        onProgress?.(`Bing Places: ${name} (${results.length}/${limit})`);
      } catch {}
    }
  } finally { await context.close(); }
  return results;
}

// Check if query is medical/healthcare related
function isMedicalQuery(query: string): boolean {
  const medicalTerms = ['doctor', 'dentist', 'physician', 'surgeon', 'dermatologist', 'orthodontist', 'pediatrician', 'therapist', 'psychiatrist', 'cardiologist', 'optometrist', 'chiropractor', 'physical therapy', 'medical', 'clinic', 'healthcare', 'dental'];
  const q = query.toLowerCase();
  return medicalTerms.some(term => q.includes(term));
}

// Check if query is home services related
function isHomeServicesQuery(query: string): boolean {
  const homeTerms = ['plumber', 'electrician', 'contractor', 'roofer', 'painter', 'landscaper', 'hvac', 'handyman', 'remodeling', 'renovation', 'flooring', 'carpentry', 'pest control', 'cleaning', 'mover', 'garage door', 'window', 'siding', 'deck', 'fence'];
  const q = query.toLowerCase();
  return homeTerms.some(term => q.includes(term));
}

function dedupeByDomainLegacy(results: ScrapedBusiness[]): ScrapedBusiness[] {
  const seen = new Set<string>();
  return results.filter(r => { const key = r.website ? extractDomain(r.website) : r.instagram || r.name.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
}

/**
 * Enhanced deduplication using fuzzy matching and quality scoring
 */
function dedupeAndScore(results: ScrapedBusiness[], limit: number): EnrichedBusiness[] {
  const { results: processed, stats } = processBusinessBatch(results, {
    similarityThreshold: 0.75,
    minQualityScore: 0.15, // Low threshold to not lose leads, but still filter garbage
    maxResults: limit,
  });

  console.log(`[DataQuality] Processed ${stats.total} -> ${stats.unique} unique (${stats.duplicates} duplicates removed)`);

  return processed;
}

// Source name mapping for progress messages
const SOURCE_NAMES: Record<DataSource, string> = {
  google_maps: 'Google Maps',
  google_serp: 'Google SERP',
  bing_places: 'Bing Places',
  yelp: 'Yelp',
  yellow_pages: 'Yellow Pages',
  manta: 'Manta',
  bbb: 'BBB',
  chamber_of_commerce: 'Chamber of Commerce',
  healthgrades: 'Healthgrades',
  zocdoc: 'Zocdoc',
  angi: 'Angi',
  homeadvisor: 'HomeAdvisor',
  thumbtack: 'Thumbtack',
  houzz: 'Houzz',
  tripadvisor: 'TripAdvisor',
  avvo: 'Avvo',
  google_search: 'Google Search',
  instagram: 'Instagram',
};

// Map source to scraper function
type ScraperFunction = (browser: Browser, query: string, location: string, limit: number, onProgress?: (message: string) => void) => Promise<ScrapedBusiness[]>;

function getScraperForSource(source: DataSource): ScraperFunction {
  const scrapers: Record<DataSource, ScraperFunction> = {
    google_maps: scrapeGoogleMaps,
    google_serp: scrapeGoogleSERP,
    bing_places: scrapeBingPlaces,
    yelp: scrapeYelp,
    yellow_pages: scrapeYellowPages,
    manta: scrapeManta,
    bbb: scrapeBBB,
    chamber_of_commerce: scrapeChamberOfCommerce,
    healthgrades: scrapeHealthgrades,
    zocdoc: scrapeZocdoc,
    angi: scrapeAngi,
    homeadvisor: scrapeHomeAdvisor,
    thumbtack: scrapeThumbtack,
    houzz: scrapeHouzz,
    tripadvisor: scrapeTripAdvisor,
    avvo: scrapeAvvo,
    google_search: (browser, query, _location, limit, onProgress) => scrapeGoogleSearch(browser, query, limit, onProgress),
    instagram: (browser, query, _location, limit, onProgress) => scrapeInstagram(browser, query, limit, onProgress),
  };
  return scrapers[source];
}

// Run a single source scraper with pooled browser
async function runSource(
  source: DataSource,
  query: string,
  location: string,
  limit: number,
  onProgress?: (message: string) => void
): Promise<{ source: DataSource; results: ScrapedBusiness[]; error?: Error; durationMs: number }> {
  const startTime = Date.now();
  try {
    const scraper = getScraperForSource(source);
    const results = await withPooledBrowser(browser => scraper(browser, query, location, limit, onProgress));
    const durationMs = Date.now() - startTime;

    // Track source usage (scraping sources are not APIs)
    recordSourceUsage(SOURCE_NAMES[source], results.length, durationMs, false);

    return { source, results, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error(`${SOURCE_NAMES[source]} scrape failed:`, error);
    return { source, results: [], error: error as Error, durationMs };
  }
}

// Run multiple sources in parallel
async function runSourcesParallel(
  sources: DataSource[],
  query: string,
  location: string,
  limit: number,
  onProgress?: (message: string) => void
): Promise<ScrapedBusiness[]> {
  if (sources.length === 0) return [];

  const sourceNames = sources.map(s => SOURCE_NAMES[s]).join(', ');
  onProgress?.(`Searching ${sourceNames}...`);

  const promises = sources.map(source => runSource(source, query, location, limit, onProgress));
  const results = await Promise.allSettled(promises);

  const allResults: ScrapedBusiness[] = [];
  let totalDuration = 0;
  let successCount = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.results.length > 0) {
        allResults.push(...result.value.results);
        successCount++;
      }
      totalDuration = Math.max(totalDuration, result.value.durationMs);
    }
  }

  console.log(`[Scraper] Parallel search completed: ${successCount}/${sources.length} sources returned ${allResults.length} results in ${(totalDuration / 1000).toFixed(1)}s`);

  return allResults;
}

export async function discover(
  query: string,
  location: string,
  count: number,
  onProgress?: (message: string, progress: number) => void,
  filters?: SearchFilters
): Promise<ScrapedBusiness[]> {
  const hasLocation = Boolean(location?.trim());
  const type = classifyQuery(query, location);
  let results: ScrapedBusiness[] = [];

  // Log filter settings if provided
  if (filters) {
    console.log('[Discover] Filters:', {
      industry: filters.industryCategory,
      companySize: filters.companySizeMin && filters.companySizeMax
        ? `${filters.companySizeMin}-${filters.companySizeMax}`
        : filters.companySizeMin ? `${filters.companySizeMin}+` : 'any',
      state: filters.targetState,
      b2cOnly: filters.b2cOnly,
    });
  }

  // Detect query category and get prioritized sources
  const category = detectQueryCategory(query, hasLocation);
  const categoryName = getCategoryDescription(category);
  console.log(`Query category: ${categoryName}`);

  // Check cache first for recent search results
  try {
    const cachedResults = await getCachedSearchResults(query, location);
    if (cachedResults && cachedResults.businesses.length > 0) {
      const cacheAge = Date.now() - cachedResults.cachedAt;
      const cacheAgeHours = Math.round(cacheAge / (1000 * 60 * 60));
      console.log(`[Cache] Found ${cachedResults.businesses.length} cached results (${cacheAgeHours}h old)`);
      onProgress?.(`Found ${cachedResults.businesses.length} cached results`, 10);

      // If cache has enough results, use them
      if (cachedResults.businesses.length >= count * 0.8) {
        const stats = getCacheStats();
        console.log(`[Cache] Using cached results. Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
        return cachedResults.businesses.slice(0, count);
      }

      // Otherwise, start with cached results and fetch more
      results = [...cachedResults.businesses];
      console.log(`[Cache] Starting with ${results.length} cached, fetching ${count - results.length} more`);
    }
  } catch (cacheError) {
    console.warn('[Cache] Error reading cache:', cacheError);
  }

  // Warmup browser pool in the background
  warmupBrowserPool().catch(() => {});

  // Reset session tracking for this new search
  resetSessionTracking();

  const updateProgress = (msg: string) => onProgress?.(msg, Math.min(40, Math.round((results.length / count) * 40)));

  // API-First Mode: Check API availability and prioritize APIs
  const apiStatus = getApiAvailabilityStatus();
  const availableApis = apiStatus.filter(a => a.available);
  const apiCapacity = canApisFullfillRequest(count - results.length);

  if (availableApis.length > 0) {
    console.log(`[API-First] Available APIs: ${availableApis.map(a => `${a.name} (${a.remaining} remaining)`).join(', ')}`);
    console.log(`[API-First] Can fulfill ${apiCapacity.estimatedFromApis}/${count} from APIs, needs scraping: ${apiCapacity.needsScraping}`);
  }

  // API Fallback: Try official APIs first if configured and preferred
  if (shouldPreferApis() && (type === 'local' || type === 'hybrid')) {
    try {
      // Show which APIs are being used
      const apiNames = apiCapacity.recommendedApis.join(', ');
      onProgress?.(`Searching via ${apiNames || 'official APIs'}...`, 5);

      const apiStartTime = Date.now();
      const apiResults = await searchWithApis(query, location, count, updateProgress);
      const apiDuration = Date.now() - apiStartTime;

      if (apiResults.length > 0) {
        results.push(...apiResults);
        // Track API usage for cost savings
        recordSourceUsage('official_apis', apiResults.length, apiDuration, true);
        onProgress?.(`Found ${results.length} results via APIs (${(apiDuration / 1000).toFixed(1)}s)`, 20);
      }
    } catch (error) {
      console.error('API fallback failed, continuing with scraping:', error);
    }

    // If APIs provided enough results, return early with quality processing
    if (results.length >= count) {
      const enrichedResults = dedupeAndScore(results, count);
      const finalResults: ScrapedBusiness[] = enrichedResults.map((b) => ({
        name: b.name,
        website: b.website,
        phone: b.phone,
        address: b.address,
        instagram: b.instagram,
        rating: b.rating,
        review_count: b.review_count,
        source: b.source,
        email: b.email,
        years_in_business: b.years_in_business,
        quality_score: b.quality.overallScore,
        quality_flags: b.quality.flags,
      }));

      // Log source usage summary
      const usageSummary = getSourceUsageSummary();
      const costSavings = getCostSavings();
      console.log(`[API-First] Results: ${usageSummary.apiResults} from APIs (${usageSummary.apiPercentage.toFixed(0)}%), ${usageSummary.scrapedResults} from scraping`);
      console.log(`[API-First] Cost savings: ~$${costSavings.estimatedCostSavedUsd.toFixed(3)}, time saved: ${(costSavings.estimatedTimeSavedMs / 1000).toFixed(1)}s`);

      onProgress?.(`Found ${finalResults.length} unique businesses (100% from APIs)`, 40);
      // Cache results for future queries
      cacheSearchResults(query, location, finalResults).catch(() => {});
      cacheBusinesses(finalResults, 'api').catch(() => {});
      return finalResults;
    }
  }

  // Get prioritized sources for this query type (use filters if provided)
  let sources = filters?.industryCategory
    ? getPrioritizedSourcesWithFilters(query, hasLocation, {
        industryCategory: filters.industryCategory,
        targetState: filters.targetState,
      })
    : getPrioritizedSources(query, hasLocation);

  // Group sources by priority for batch execution
  const priorityGroups = groupSourcesByPriority(sources);
  const priorities = Array.from(priorityGroups.keys()).sort((a, b) => a - b);

  let progressPercent = 5;
  const progressPerGroup = 30 / Math.max(priorities.length, 1);

  // Execute each priority group
  for (const priority of priorities) {
    if (results.length >= count) break;

    // Filter sources based on current result count
    const groupSources = filterSourcesByResultCount(
      priorityGroups.get(priority) || [],
      results.length
    );

    if (groupSources.length === 0) continue;

    // Separate parallel and sequential sources
    const parallelSources = groupSources.filter(s => s.parallel).map(s => s.source);
    const sequentialSources = groupSources.filter(s => !s.parallel).map(s => s.source);

    // Calculate how many results we still need
    const remaining = count - results.length;
    // Request more than needed since we'll dedupe
    const targetPerSource = Math.ceil(remaining * 1.5 / Math.max(groupSources.length, 1));

    // Run parallel sources first
    if (parallelSources.length > 0) {
      onProgress?.(`Searching ${parallelSources.length} sources in parallel...`, progressPercent);

      const parallelResults = await runSourcesParallel(
        parallelSources,
        query,
        location,
        Math.min(targetPerSource, count),
        updateProgress
      );

      results.push(...parallelResults);
      progressPercent += progressPerGroup / 2;
    }

    // Run sequential sources
    for (const source of sequentialSources) {
      if (results.length >= count) break;

      const remainingNeeded = count - results.length;
      if (remainingNeeded <= 0) break;

      onProgress?.(`Searching ${SOURCE_NAMES[source]}...`, progressPercent);

      const sourceResult = await runSource(source, query, location, remainingNeeded, updateProgress);
      if (sourceResult.results.length > 0) {
        results.push(...sourceResult.results);
      }

      progressPercent += progressPerGroup / Math.max(sequentialSources.length, 1) / 2;
    }
  }

  // For hybrid queries, also search online sources if we need more
  if (type === 'hybrid' && results.length < count) {
    const onlineSources: DataSource[] = ['google_search'];
    const onlineResults = await runSourcesParallel(
      onlineSources,
      query,
      location,
      count - results.length,
      updateProgress
    );
    results.push(...onlineResults);
  }

  // Apply enhanced deduplication and quality scoring
  onProgress?.(`Processing ${results.length} results for quality and deduplication...`, 38);
  const enrichedResults = dedupeAndScore(results, count);
  onProgress?.(`Found ${enrichedResults.length} unique, quality businesses`, 40);

  // Convert back to ScrapedBusiness for API compatibility (quality data is included)
  let finalResults: ScrapedBusiness[] = enrichedResults.map((b) => ({
    name: b.name,
    website: b.website,
    phone: b.phone,
    address: b.address,
    instagram: b.instagram,
    rating: b.rating,
    review_count: b.review_count,
    source: b.source,
    email: b.email,
    years_in_business: b.years_in_business,
    // Include quality data as extra fields
    quality_score: b.quality.overallScore,
    quality_flags: b.quality.flags,
  } as ScrapedBusiness & { quality_score: number; quality_flags: string[] }));

  // Apply B2C filters if provided
  if (filters) {
    onProgress?.('Applying B2C filters...', 42);

    // Add company size estimates and B2B classification
    const enrichedWithSize = await Promise.all(
      finalResults.map(async (business) => {
        // Estimate company size based on review count and other heuristics
        const sizeEstimate = await estimateCompanySize({
          name: business.name,
          website: business.website,
          reviewCount: business.review_count,
          yearsInBusiness: business.years_in_business || null,
          address: business.address,
          rating: business.rating,
        });

        // Classify as B2B or B2C
        const businessType = classifyBusinessType(business.name, filters.industryCategory || null);

        return {
          ...business,
          employee_count: sizeEstimate.employeeCount,
          is_b2b: !businessType.isB2C,
        };
      })
    );

    // Apply company size filter
    const minSize = filters.companySizeMin ?? null;
    const maxSize = filters.companySizeMax ?? null;
    if (minSize !== null || maxSize !== null) {
      const beforeCount = enrichedWithSize.length;
      finalResults = enrichedWithSize.filter((b) => {
        if (b.employee_count === null || b.employee_count === undefined) return true; // Don't filter out unknowns
        if (minSize !== null && b.employee_count < minSize) return false;
        if (maxSize !== null && b.employee_count > maxSize) return false;
        return true;
      });
      console.log(`[Filters] Company size filter: ${beforeCount} -> ${finalResults.length}`);
    } else {
      finalResults = enrichedWithSize;
    }

    // Apply B2C only filter
    if (filters.b2cOnly) {
      const beforeCount = finalResults.length;
      finalResults = finalResults.filter((b) => !b.is_b2b);
      console.log(`[Filters] B2C only filter: ${beforeCount} -> ${finalResults.length}`);
    }

    onProgress?.(`Filtered to ${finalResults.length} matching businesses`, 45);
  }

  // Cache results for future queries
  if (finalResults.length > 0) {
    cacheSearchResults(query, location, finalResults).catch((err) => {
      console.warn('[Cache] Failed to cache search results:', err);
    });
    cacheBusinesses(finalResults, 'scrape').catch((err) => {
      console.warn('[Cache] Failed to cache businesses:', err);
    });
    const stats = getCacheStats();
    console.log(`[Cache] Cached ${finalResults.length} results. Stats: hits=${stats.hits}, misses=${stats.misses}, hitRate=${(stats.hitRate * 100).toFixed(1)}%`);
  }

  // Log final source usage summary
  const usageSummary = getSourceUsageSummary();
  const costSavings = getCostSavings();
  if (usageSummary.totalResults > 0) {
    console.log(`[API-First] Final summary:`);
    console.log(`  - Total results: ${usageSummary.totalResults}`);
    console.log(`  - From APIs: ${usageSummary.apiResults} (${usageSummary.apiPercentage.toFixed(0)}%)`);
    console.log(`  - From scraping: ${usageSummary.scrapedResults} (${(100 - usageSummary.apiPercentage).toFixed(0)}%)`);
    console.log(`  - Sources used: ${usageSummary.sources.map(s => `${s.name} (${s.results})`).join(', ')}`);
    if (costSavings.estimatedTimeSavedMs > 0) {
      console.log(`  - Estimated time saved: ${(costSavings.estimatedTimeSavedMs / 1000).toFixed(1)}s`);
    }
  }

  return finalResults;
}
