/**
 * Rate Limiting Module
 * Per-domain rate limiting with robots.txt respect
 * Uses Redis for persistence across serverless instances
 */

import { loadConfig } from './config';
import { randomDelay } from './stealth';
import { getRateLimitState, setRateLimitState, type RateLimitState } from './cache';

interface DomainState {
  lastRequest: number;
  requestCount: number;
  windowStart: number;
  crawlDelay: number | null; // From robots.txt
}

interface QueuedRequest {
  url: string;
  resolve: () => void;
  reject: (error: Error) => void;
  addedAt: number;
}

class RateLimiter {
  private domainStates: Map<string, DomainState> = new Map();
  private robotsCache: Map<string, { crawlDelay: number | null; fetchedAt: number }> = new Map();
  private requestQueue: Map<string, QueuedRequest[]> = new Map();
  private processingDomains: Set<string> = new Set();

  private readonly ROBOTS_CACHE_TTL = 3600000; // 1 hour
  private readonly QUEUE_TIMEOUT = 60000; // 1 minute
  private readonly MAX_QUEUE_SIZE = 100;

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      // Normalize to root domain for rate limiting
      // e.g., maps.google.com -> google.com
      const parts = parsed.hostname.split('.');
      if (parts.length > 2) {
        // Check if it's a subdomain of a known domain
        const rootDomain = parts.slice(-2).join('.');
        const config = loadConfig();
        if (config.rateLimit.domainPresets[rootDomain]) {
          return rootDomain;
        }
      }
      return parsed.hostname;
    } catch {
      return url;
    }
  }

  /**
   * Get rate limit settings for a domain
   */
  private getDomainSettings(domain: string): { requestsPerMinute: number; minDelay: number } {
    const config = loadConfig();

    // Check for domain-specific presets
    for (const [presetDomain, settings] of Object.entries(config.rateLimit.domainPresets)) {
      if (domain.includes(presetDomain)) {
        return settings;
      }
    }

    // Use global defaults
    return {
      requestsPerMinute: config.rateLimit.perDomain,
      minDelay: config.rateLimit.minDelay,
    };
  }

  /**
   * Parse crawl-delay from robots.txt
   */
  private async fetchCrawlDelay(domain: string): Promise<number | null> {
    const config = loadConfig();

    if (!config.rateLimit.respectRobots) {
      return null;
    }

    // Check cache first
    const cached = this.robotsCache.get(domain);
    if (cached && Date.now() - cached.fetchedAt < this.ROBOTS_CACHE_TTL) {
      return cached.crawlDelay;
    }

    try {
      const robotsUrl = `https://${domain}/robots.txt`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(robotsUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LeadGenBot/1.0)',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.robotsCache.set(domain, { crawlDelay: null, fetchedAt: Date.now() });
        return null;
      }

      const text = await response.text();
      let crawlDelay: number | null = null;
      let inUserAgentBlock = false;
      let isWildcardBlock = false;

      for (const line of text.split('\n')) {
        const trimmed = line.trim().toLowerCase();

        if (trimmed.startsWith('user-agent:')) {
          const agent = trimmed.substring(11).trim();
          isWildcardBlock = agent === '*';
          inUserAgentBlock = isWildcardBlock || agent.includes('bot');
        } else if (inUserAgentBlock && trimmed.startsWith('crawl-delay:')) {
          const value = parseFloat(trimmed.substring(12).trim());
          if (!isNaN(value) && value > 0) {
            // Convert to milliseconds
            crawlDelay = value * 1000;
          }
        }
      }

      this.robotsCache.set(domain, { crawlDelay, fetchedAt: Date.now() });
      return crawlDelay;
    } catch {
      this.robotsCache.set(domain, { crawlDelay: null, fetchedAt: Date.now() });
      return null;
    }
  }

  /**
   * Get or create domain state (with Redis persistence)
   */
  private async getDomainStateAsync(domain: string): Promise<DomainState> {
    // Check local cache first
    let state = this.domainStates.get(domain);
    if (state) {
      return state;
    }

    // Try to get from Redis
    try {
      const redisState = await getRateLimitState(domain);
      if (redisState) {
        state = {
          lastRequest: redisState.lastRequest,
          requestCount: redisState.requestCount,
          windowStart: redisState.windowStart,
          crawlDelay: null,
        };
        this.domainStates.set(domain, state);
        return state;
      }
    } catch {
      // Fall through to create new state
    }

    // Create new state
    state = {
      lastRequest: 0,
      requestCount: 0,
      windowStart: Date.now(),
      crawlDelay: null,
    };
    this.domainStates.set(domain, state);
    return state;
  }

  /**
   * Get or create domain state (sync version for compatibility)
   */
  private getDomainState(domain: string): DomainState {
    let state = this.domainStates.get(domain);
    if (!state) {
      state = {
        lastRequest: 0,
        requestCount: 0,
        windowStart: Date.now(),
        crawlDelay: null,
      };
      this.domainStates.set(domain, state);
    }
    return state;
  }

  /**
   * Persist domain state to Redis
   */
  private async persistDomainState(domain: string, state: DomainState): Promise<void> {
    try {
      await setRateLimitState(domain, {
        lastRequest: state.lastRequest,
        requestCount: state.requestCount,
        windowStart: state.windowStart,
      });
    } catch {
      // Ignore persistence errors - local state is sufficient
    }
  }

  /**
   * Calculate delay needed before next request
   */
  private async calculateDelay(domain: string): Promise<number> {
    const config = loadConfig();
    const settings = this.getDomainSettings(domain);
    const state = this.getDomainState(domain);

    // Reset window if needed (1 minute window)
    const now = Date.now();
    if (now - state.windowStart >= 60000) {
      state.windowStart = now;
      state.requestCount = 0;
    }

    // Check if we've exceeded requests per minute
    if (state.requestCount >= settings.requestsPerMinute) {
      // Wait until window resets
      const waitTime = 60000 - (now - state.windowStart);
      return Math.max(waitTime, settings.minDelay);
    }

    // Calculate time since last request
    const timeSinceLastRequest = now - state.lastRequest;

    // Get minimum delay (consider robots.txt crawl-delay)
    let minDelay = settings.minDelay;

    // Fetch crawl-delay if not cached
    if (state.crawlDelay === null && config.rateLimit.respectRobots) {
      state.crawlDelay = await this.fetchCrawlDelay(domain);
    }

    if (state.crawlDelay !== null && state.crawlDelay > minDelay) {
      minDelay = state.crawlDelay;
    }

    // Add variance for stealth
    const targetDelay = config.stealth.timingRandomization
      ? randomDelay(minDelay, 30)
      : minDelay;

    const remainingDelay = Math.max(0, targetDelay - timeSinceLastRequest);
    return remainingDelay;
  }

  /**
   * Acquire permission to make a request to a URL
   * Will wait if rate limit would be exceeded
   */
  async acquire(url: string): Promise<void> {
    const config = loadConfig();

    if (!config.rateLimit.enabled) {
      return;
    }

    const domain = this.extractDomain(url);

    return new Promise((resolve, reject) => {
      // Add to queue
      const queue = this.requestQueue.get(domain) || [];

      if (queue.length >= this.MAX_QUEUE_SIZE) {
        reject(new Error(`Rate limit queue full for domain: ${domain}`));
        return;
      }

      queue.push({
        url,
        resolve,
        reject,
        addedAt: Date.now(),
      });

      this.requestQueue.set(domain, queue);

      // Start processing if not already processing this domain
      if (!this.processingDomains.has(domain)) {
        this.processQueue(domain);
      }
    });
  }

  /**
   * Process the request queue for a domain
   */
  private async processQueue(domain: string): Promise<void> {
    this.processingDomains.add(domain);

    try {
      while (true) {
        const queue = this.requestQueue.get(domain);
        if (!queue || queue.length === 0) {
          break;
        }

        const request = queue[0];

        // Check for timeout
        if (Date.now() - request.addedAt > this.QUEUE_TIMEOUT) {
          queue.shift();
          request.reject(new Error('Rate limit queue timeout'));
          continue;
        }

        // Calculate and wait for delay
        const delay = await this.calculateDelay(domain);
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Remove from queue and resolve
        queue.shift();
        const state = this.getDomainState(domain);
        state.lastRequest = Date.now();
        state.requestCount++;

        // Persist state to Redis (non-blocking)
        this.persistDomainState(domain, state).catch(() => {});

        request.resolve();
      }
    } finally {
      this.processingDomains.delete(domain);
    }
  }

  /**
   * Get current stats for debugging
   */
  getStats(): Map<string, { requestCount: number; lastRequest: number }> {
    const stats = new Map<string, { requestCount: number; lastRequest: number }>();
    for (const [domain, state] of this.domainStates) {
      stats.set(domain, {
        requestCount: state.requestCount,
        lastRequest: state.lastRequest,
      });
    }
    return stats;
  }

  /**
   * Clear state for testing
   */
  reset(): void {
    this.domainStates.clear();
    this.robotsCache.clear();
    this.requestQueue.clear();
    this.processingDomains.clear();
  }
}

// Singleton instance
let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter();
  }
  return rateLimiterInstance;
}

/**
 * Acquire rate limit permission for a URL
 * Use before making any navigation request
 */
export async function acquireRateLimit(url: string): Promise<void> {
  return getRateLimiter().acquire(url);
}

/**
 * Get rate limiter stats
 */
export function getRateLimitStats(): Map<string, { requestCount: number; lastRequest: number }> {
  return getRateLimiter().getStats();
}

/**
 * Reset rate limiter (for testing)
 */
export function resetRateLimiter(): void {
  getRateLimiter().reset();
}
