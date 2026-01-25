/**
 * Enhanced Browser Pool Module
 * High-performance browser pooling with page recycling, health checks, and metrics
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { getPlaywrightProxyConfig, shouldUseDirect } from './proxy';
import { isRateLimitError, BrowserConnectionError } from './errors';
import { createStealthContext } from './stealth';

// ============ Types ============

interface PooledBrowser {
  browser: Browser;
  contexts: PooledContext[];
  inUse: boolean;
  createdAt: number;
  lastUsed: number;
  lastHealthCheck: number;
  provider: 'browserless' | 'local';
  requestCount: number;
  errorCount: number;
}

interface PooledContext {
  context: BrowserContext;
  pages: PooledPage[];
  inUse: boolean;
  createdAt: number;
}

interface PooledPage {
  page: Page;
  inUse: boolean;
  lastUsed: number;
  url: string;
}

interface BrowserMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgPageLoadMs: number;
  pageLoadTimes: number[];
  browserlessRequests: number;
  localRequests: number;
  recycledPages: number;
  newPages: number;
}

// ============ Configuration ============

const POOL_CONFIG = {
  maxBrowsers: 5,
  maxContextsPerBrowser: 3,
  maxPagesPerContext: 5,
  browserMaxAge: 10 * 60 * 1000, // 10 minutes
  contextMaxAge: 5 * 60 * 1000, // 5 minutes
  pageMaxAge: 2 * 60 * 1000, // 2 minutes
  healthCheckInterval: 30 * 1000, // 30 seconds
  warmupSize: 2,
  maxPageLoadSamples: 100,
};

// ============ Browserless State ============

let browserlessAvailable = true;
let browserlessFailedAt: number | null = null;
const BROWSERLESS_COOLDOWN_MS = 5 * 60 * 1000;

// ============ Browser Pool Class ============

class EnhancedBrowserPool {
  private pool: PooledBrowser[] = [];
  private metrics: BrowserMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    avgPageLoadMs: 0,
    pageLoadTimes: [],
    browserlessRequests: 0,
    localRequests: 0,
    recycledPages: 0,
    newPages: 0,
  };
  private isShuttingDown = false;
  private initPromise: Promise<void> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Initialize the pool with warm browsers
   */
  async warmup(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      console.log('[BrowserPool] Warming up pool...');
      const promises: Promise<PooledBrowser | null>[] = [];

      for (let i = 0; i < POOL_CONFIG.warmupSize; i++) {
        promises.push(this.addBrowserToPool());
      }

      await Promise.allSettled(promises);

      // Start health check timer
      if (!this.healthCheckTimer) {
        this.healthCheckTimer = setInterval(
          () => this.performHealthChecks(),
          POOL_CONFIG.healthCheckInterval
        );
      }

      console.log(`[BrowserPool] Warmed up with ${this.pool.length} browsers`);
    })();

    return this.initPromise;
  }

  /**
   * Check if Browserless should be attempted
   */
  private shouldTryBrowserless(): boolean {
    const browserlessKey = process.env.BROWSERLESS_API_KEY;
    if (!browserlessKey) return false;

    if (!browserlessAvailable) {
      if (browserlessFailedAt && Date.now() - browserlessFailedAt > BROWSERLESS_COOLDOWN_MS) {
        console.log('[BrowserPool] Browserless cooldown expired, retrying');
        browserlessAvailable = true;
        browserlessFailedAt = null;
      }
    }
    return browserlessAvailable;
  }

  /**
   * Mark Browserless as unavailable
   */
  private markBrowserlessUnavailable(): void {
    browserlessAvailable = false;
    browserlessFailedAt = Date.now();
    console.warn('[BrowserPool] Browserless unavailable, using local Playwright');
  }

  /**
   * Create a local Playwright browser
   */
  private async createLocalBrowser(): Promise<Browser> {
    const proxyConfig = getPlaywrightProxyConfig();

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
      ],
    };

    if (proxyConfig && !shouldUseDirect()) {
      launchOptions.proxy = proxyConfig.proxy;
    }

    return chromium.launch(launchOptions);
  }

  /**
   * Create a Browserless.io browser connection
   */
  private async createBrowserlessBrowser(): Promise<Browser> {
    const browserlessKey = process.env.BROWSERLESS_API_KEY;
    if (!browserlessKey) {
      throw new BrowserConnectionError('browserless', new Error('No API key'));
    }

    // Use connection pooling params for better performance
    const wsUrl = new URL(`wss://production-sfo.browserless.io`);
    wsUrl.searchParams.set('token', browserlessKey);
    wsUrl.searchParams.set('--disable-gpu', 'true');
    wsUrl.searchParams.set('--disable-dev-shm-usage', 'true');
    wsUrl.searchParams.set('blockAds', 'true');
    wsUrl.searchParams.set('stealth', 'true');

    return chromium.connectOverCDP(wsUrl.toString(), {
      timeout: 30000,
    });
  }

  /**
   * Create a new browser with fallback
   */
  private async createBrowser(): Promise<{ browser: Browser; provider: 'browserless' | 'local' }> {
    if (this.shouldTryBrowserless()) {
      try {
        const browser = await this.createBrowserlessBrowser();
        this.metrics.browserlessRequests++;
        return { browser, provider: 'browserless' };
      } catch (error) {
        console.error('[BrowserPool] Browserless failed:', error);
        if (isRateLimitError(error)) {
          this.markBrowserlessUnavailable();
        }
      }
    }

    try {
      const browser = await this.createLocalBrowser();
      this.metrics.localRequests++;
      return { browser, provider: 'local' };
    } catch (error) {
      throw new BrowserConnectionError('local', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Add a new browser to the pool
   */
  private async addBrowserToPool(): Promise<PooledBrowser | null> {
    if (this.pool.length >= POOL_CONFIG.maxBrowsers || this.isShuttingDown) {
      return null;
    }

    try {
      const { browser, provider } = await this.createBrowser();
      const pooled: PooledBrowser = {
        browser,
        contexts: [],
        inUse: false,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        lastHealthCheck: Date.now(),
        provider,
        requestCount: 0,
        errorCount: 0,
      };
      this.pool.push(pooled);
      return pooled;
    } catch (error) {
      console.error('[BrowserPool] Failed to create browser:', error);
      return null;
    }
  }

  /**
   * Get or create a page from a browser
   * Implements page recycling for performance
   */
  private async getPage(pooledBrowser: PooledBrowser): Promise<{ page: Page; context: BrowserContext; isRecycled: boolean }> {
    // Try to find a recyclable page
    for (const ctx of pooledBrowser.contexts) {
      if (ctx.inUse) continue;

      for (const p of ctx.pages) {
        if (!p.inUse && Date.now() - p.lastUsed < POOL_CONFIG.pageMaxAge) {
          try {
            // Check if page is still usable
            await p.page.evaluate(() => true);
            p.inUse = true;
            p.lastUsed = Date.now();
            ctx.inUse = true;
            this.metrics.recycledPages++;
            return { page: p.page, context: ctx.context, isRecycled: true };
          } catch {
            // Page is stale, remove it
            const idx = ctx.pages.indexOf(p);
            if (idx !== -1) ctx.pages.splice(idx, 1);
          }
        }
      }
    }

    // Find or create a context with room for more pages
    let targetContext: PooledContext | null = null;

    for (const ctx of pooledBrowser.contexts) {
      if (!ctx.inUse && ctx.pages.length < POOL_CONFIG.maxPagesPerContext) {
        if (Date.now() - ctx.createdAt < POOL_CONFIG.contextMaxAge) {
          targetContext = ctx;
          break;
        }
      }
    }

    // Create new context if needed
    if (!targetContext && pooledBrowser.contexts.length < POOL_CONFIG.maxContextsPerBrowser) {
      try {
        const context = await createStealthContext(pooledBrowser.browser);
        targetContext = {
          context,
          pages: [],
          inUse: false,
          createdAt: Date.now(),
        };
        pooledBrowser.contexts.push(targetContext);
      } catch (error) {
        console.error('[BrowserPool] Failed to create context:', error);
        throw error;
      }
    }

    if (!targetContext) {
      // Reuse oldest context
      targetContext = pooledBrowser.contexts[0];
      // Clear old pages
      for (const p of targetContext.pages) {
        try {
          await p.page.close();
        } catch {}
      }
      targetContext.pages = [];
    }

    // Create new page
    try {
      const page = await targetContext.context.newPage();
      page.setDefaultTimeout(15000);

      const pooledPage: PooledPage = {
        page,
        inUse: true,
        lastUsed: Date.now(),
        url: '',
      };
      targetContext.pages.push(pooledPage);
      targetContext.inUse = true;
      this.metrics.newPages++;

      return { page, context: targetContext.context, isRecycled: false };
    } catch (error) {
      console.error('[BrowserPool] Failed to create page:', error);
      throw error;
    }
  }

  /**
   * Release a page back to the pool
   */
  private releasePage(page: Page, context: BrowserContext): void {
    for (const pooledBrowser of this.pool) {
      for (const ctx of pooledBrowser.contexts) {
        if (ctx.context === context) {
          ctx.inUse = false;
          for (const p of ctx.pages) {
            if (p.page === page) {
              p.inUse = false;
              p.lastUsed = Date.now();
              break;
            }
          }
          break;
        }
      }
    }
  }

  /**
   * Acquire a browser from the pool
   */
  async acquire(): Promise<Browser> {
    await this.cleanup();

    // Find available browser
    let available = this.pool.find(p => !p.inUse && p.browser.isConnected());

    if (!available && this.pool.length < POOL_CONFIG.maxBrowsers) {
      available = await this.addBrowserToPool() || undefined;
    }

    if (!available) {
      // Wait briefly for a browser to become available
      await new Promise(resolve => setTimeout(resolve, 100));
      available = this.pool.find(p => !p.inUse && p.browser.isConnected());
    }

    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      available.requestCount++;
      return available.browser;
    }

    // Create temporary browser outside pool
    const { browser } = await this.createBrowser();
    return browser;
  }

  /**
   * Release a browser back to the pool
   */
  release(browser: Browser): void {
    const pooled = this.pool.find(p => p.browser === browser);
    if (pooled) {
      pooled.inUse = false;
      pooled.lastUsed = Date.now();

      // Maintain warmup level
      const available = this.pool.filter(p => !p.inUse && p.browser.isConnected()).length;
      if (available < POOL_CONFIG.warmupSize && this.pool.length < POOL_CONFIG.maxBrowsers) {
        this.addBrowserToPool().catch(() => {});
      }
    } else {
      browser.close().catch(() => {});
    }
  }

  /**
   * Execute a function with a pooled browser and page
   * Implements page recycling for better performance
   */
  async withPage<T>(fn: (page: Page, context: BrowserContext) => Promise<T>): Promise<T> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    const browser = await this.acquire();
    const pooledBrowser = this.pool.find(p => p.browser === browser);

    if (!pooledBrowser) {
      // Temporary browser, use simple approach
      try {
        const context = await createStealthContext(browser);
        const page = await context.newPage();
        try {
          const result = await fn(page, context);
          this.recordSuccess(startTime);
          return result;
        } finally {
          await context.close().catch(() => {});
          this.release(browser);
        }
      } catch (error) {
        this.recordFailure();
        throw error;
      }
    }

    try {
      const { page, context, isRecycled } = await this.getPage(pooledBrowser);

      // Clear page state if recycled
      if (isRecycled) {
        try {
          await page.goto('about:blank', { timeout: 5000 });
        } catch {}
      }

      try {
        const result = await fn(page, context);
        this.recordSuccess(startTime);
        return result;
      } finally {
        this.releasePage(page, context);
        this.release(browser);
      }
    } catch (error) {
      pooledBrowser.errorCount++;
      this.recordFailure();
      this.release(browser);
      throw error;
    }
  }

  /**
   * Execute with browser (legacy compatibility)
   */
  async withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
    const browser = await this.acquire();
    try {
      const result = await fn(browser);
      this.metrics.successfulRequests++;
      return result;
    } catch (error) {
      this.metrics.failedRequests++;
      throw error;
    } finally {
      this.release(browser);
    }
  }

  /**
   * Record successful request
   */
  private recordSuccess(startTime: number): void {
    this.metrics.successfulRequests++;
    const loadTime = Date.now() - startTime;
    this.metrics.pageLoadTimes.push(loadTime);

    if (this.metrics.pageLoadTimes.length > POOL_CONFIG.maxPageLoadSamples) {
      this.metrics.pageLoadTimes.shift();
    }

    this.metrics.avgPageLoadMs =
      this.metrics.pageLoadTimes.reduce((a, b) => a + b, 0) / this.metrics.pageLoadTimes.length;
  }

  /**
   * Record failed request
   */
  private recordFailure(): void {
    this.metrics.failedRequests++;
  }

  /**
   * Perform health checks on pooled browsers
   */
  private async performHealthChecks(): Promise<void> {
    if (this.isShuttingDown) return;

    const now = Date.now();
    const unhealthy: PooledBrowser[] = [];

    for (const pooled of this.pool) {
      if (pooled.inUse) continue;

      // Check if browser is still connected
      if (!pooled.browser.isConnected()) {
        unhealthy.push(pooled);
        continue;
      }

      // Check if browser is too old
      if (now - pooled.createdAt > POOL_CONFIG.browserMaxAge) {
        unhealthy.push(pooled);
        continue;
      }

      // Check error rate
      if (pooled.requestCount > 10 && pooled.errorCount / pooled.requestCount > 0.5) {
        console.log(`[BrowserPool] Browser has high error rate, replacing`);
        unhealthy.push(pooled);
        continue;
      }

      // Perform active health check
      if (now - pooled.lastHealthCheck > POOL_CONFIG.healthCheckInterval) {
        try {
          const context = await pooled.browser.newContext();
          const page = await context.newPage();
          await page.goto('about:blank', { timeout: 5000 });
          await context.close();
          pooled.lastHealthCheck = now;
        } catch {
          console.log(`[BrowserPool] Browser failed health check`);
          unhealthy.push(pooled);
        }
      }
    }

    // Remove unhealthy browsers
    for (const pooled of unhealthy) {
      const idx = this.pool.indexOf(pooled);
      if (idx !== -1) {
        this.pool.splice(idx, 1);
        try {
          await pooled.browser.close();
        } catch {}
      }
    }

    // Replenish pool
    const available = this.pool.filter(p => !p.inUse && p.browser.isConnected()).length;
    if (available < POOL_CONFIG.warmupSize) {
      await this.addBrowserToPool();
    }
  }

  /**
   * Clean up old contexts and pages
   */
  private async cleanup(): Promise<void> {
    const now = Date.now();

    for (const pooled of this.pool) {
      if (!pooled.browser.isConnected()) continue;

      // Clean up old contexts
      const contextsToRemove: PooledContext[] = [];
      for (const ctx of pooled.contexts) {
        if (ctx.inUse) continue;

        if (now - ctx.createdAt > POOL_CONFIG.contextMaxAge) {
          contextsToRemove.push(ctx);
        } else {
          // Clean up old pages within context
          const pagesToRemove: PooledPage[] = [];
          for (const p of ctx.pages) {
            if (!p.inUse && now - p.lastUsed > POOL_CONFIG.pageMaxAge) {
              pagesToRemove.push(p);
            }
          }
          for (const p of pagesToRemove) {
            const idx = ctx.pages.indexOf(p);
            if (idx !== -1) {
              ctx.pages.splice(idx, 1);
              try {
                await p.page.close();
              } catch {}
            }
          }
        }
      }

      for (const ctx of contextsToRemove) {
        const idx = pooled.contexts.indexOf(ctx);
        if (idx !== -1) {
          pooled.contexts.splice(idx, 1);
          try {
            await ctx.context.close();
          } catch {}
        }
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    total: number;
    inUse: number;
    available: number;
    browserless: number;
    local: number;
    contexts: number;
    pages: number;
  } {
    const connected = this.pool.filter(p => p.browser.isConnected());
    let totalContexts = 0;
    let totalPages = 0;

    for (const pooled of connected) {
      totalContexts += pooled.contexts.length;
      for (const ctx of pooled.contexts) {
        totalPages += ctx.pages.length;
      }
    }

    return {
      total: connected.length,
      inUse: connected.filter(p => p.inUse).length,
      available: connected.filter(p => !p.inUse).length,
      browserless: connected.filter(p => p.provider === 'browserless').length,
      local: connected.filter(p => p.provider === 'local').length,
      contexts: totalContexts,
      pages: totalPages,
    };
  }

  /**
   * Get performance metrics
   */
  getMetrics(): BrowserMetrics {
    return { ...this.metrics };
  }

  /**
   * Get Browserless status
   */
  getBrowserlessStatus(): { available: boolean; cooldownRemaining: number | null } {
    if (browserlessAvailable) {
      return { available: true, cooldownRemaining: null };
    }
    const remaining = browserlessFailedAt
      ? Math.max(0, BROWSERLESS_COOLDOWN_MS - (Date.now() - browserlessFailedAt))
      : null;
    return { available: false, cooldownRemaining: remaining };
  }

  /**
   * Reset Browserless availability
   */
  resetBrowserlessAvailability(): void {
    browserlessAvailable = true;
    browserlessFailedAt = null;
    console.log('[BrowserPool] Browserless availability reset');
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    const closePromises = this.pool.map(async (pooled) => {
      for (const ctx of pooled.contexts) {
        try {
          await ctx.context.close();
        } catch {}
      }
      try {
        await pooled.browser.close();
      } catch {}
    });

    await Promise.allSettled(closePromises);
    this.pool = [];
    this.isShuttingDown = false;
    this.initPromise = null;
  }
}

// ============ Singleton & Exports ============

let browserPoolInstance: EnhancedBrowserPool | null = null;

export function getBrowserPool(): EnhancedBrowserPool {
  if (!browserPoolInstance) {
    browserPoolInstance = new EnhancedBrowserPool();
  }
  return browserPoolInstance;
}

export async function withPooledBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  return getBrowserPool().withBrowser(fn);
}

export async function withPooledPage<T>(fn: (page: Page, context: BrowserContext) => Promise<T>): Promise<T> {
  return getBrowserPool().withPage(fn);
}

export async function warmupBrowserPool(): Promise<void> {
  return getBrowserPool().warmup();
}

export async function shutdownBrowserPool(): Promise<void> {
  if (browserPoolInstance) {
    await browserPoolInstance.shutdown();
    browserPoolInstance = null;
  }
}

export function getBrowserPoolStats(): ReturnType<EnhancedBrowserPool['getStats']> {
  return getBrowserPool().getStats();
}

export function getBrowserPoolMetrics(): BrowserMetrics {
  return getBrowserPool().getMetrics();
}

export function getBrowserlessStatus(): { available: boolean; cooldownRemaining: number | null } {
  return getBrowserPool().getBrowserlessStatus();
}

export function resetBrowserlessAvailability(): void {
  return getBrowserPool().resetBrowserlessAvailability();
}
