/**
 * Stealth Module - Advanced Anti-Bot Evasion
 * Enterprise-grade fingerprint randomization and human behavior simulation
 *
 * Features:
 * - Canvas/AudioContext/WebGL fingerprint randomization
 * - WebRTC leak prevention
 * - Bezier curve mouse movements
 * - Realistic typing cadence
 * - Block/CAPTCHA detection
 */

import { type Browser, type BrowserContext, type Page } from 'playwright';
import { loadConfig } from './config';

// Pool of 30+ realistic User Agents (Chrome/Firefox/Safari on Windows/Mac/Linux)
const USER_AGENTS = {
  desktop: [
    // Chrome on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // Chrome on Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // Chrome on Linux
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // Firefox on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0',
    // Firefox on Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:121.0) Gecko/20100101 Firefox/121.0',
    // Firefox on Linux
    'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    // Safari on Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
    // Edge on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    // Edge on Mac
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  ],
  mobile: [
    // Chrome on Android
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    // Safari on iOS
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  ],
};

// Common desktop viewport resolutions
const VIEWPORTS = {
  desktop: [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
    { width: 1600, height: 900 },
    { width: 1680, height: 1050 },
    { width: 2560, height: 1440 },
    { width: 1280, height: 800 },
    { width: 1360, height: 768 },
  ],
  mobile: [
    { width: 390, height: 844 },  // iPhone 14
    { width: 412, height: 915 },  // Pixel 7
    { width: 393, height: 873 },  // Pixel 8
    { width: 375, height: 812 },  // iPhone X
    { width: 414, height: 896 },  // iPhone 11
  ],
};

// Coherent locale/timezone combinations
const LOCALE_TIMEZONES = [
  { locale: 'en-US', timezone: 'America/New_York' },
  { locale: 'en-US', timezone: 'America/Chicago' },
  { locale: 'en-US', timezone: 'America/Denver' },
  { locale: 'en-US', timezone: 'America/Los_Angeles' },
  { locale: 'en-US', timezone: 'America/Phoenix' },
  { locale: 'en-GB', timezone: 'Europe/London' },
  { locale: 'en-CA', timezone: 'America/Toronto' },
  { locale: 'en-AU', timezone: 'Australia/Sydney' },
];

// WebGL vendor/renderer strings
const WEBGL_CONFIGS = [
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Apple Inc.', renderer: 'Apple M1 Pro' },
  { vendor: 'Apple Inc.', renderer: 'Apple M2' },
  { vendor: 'Apple Inc.', renderer: 'Apple M3' },
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get random delay with variance
 * @param baseMs Base delay in milliseconds
 * @param variancePercent Variance percentage (0-100)
 * @returns Random delay within variance range
 */
export function randomDelay(baseMs: number, variancePercent: number = 30): number {
  const config = loadConfig();
  if (!config.stealth.timingRandomization) {
    return baseMs;
  }

  const variance = (baseMs * variancePercent) / 100;
  const min = Math.max(0, baseMs - variance);
  const max = baseMs + variance;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get random user agent
 * @param mobile Whether to use mobile UA
 */
export function getRandomUserAgent(mobile: boolean = false): string {
  const config = loadConfig();
  if (!config.stealth.userAgentRotation) {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }
  return randomElement(mobile ? USER_AGENTS.mobile : USER_AGENTS.desktop);
}

/**
 * Get random viewport
 * @param mobile Whether to use mobile viewport
 */
export function getRandomViewport(mobile: boolean = false): { width: number; height: number } {
  const config = loadConfig();
  if (!config.stealth.fingerprintRandomization) {
    return { width: 1920, height: 1080 };
  }
  return randomElement(mobile ? VIEWPORTS.mobile : VIEWPORTS.desktop);
}

/**
 * Get coherent fingerprint (matching UA, viewport, locale, timezone)
 */
export interface StealthFingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  locale: string;
  timezone: string;
  webgl: { vendor: string; renderer: string };
  isMobile: boolean;
}

export function generateFingerprint(forceMobile?: boolean): StealthFingerprint {
  const config = loadConfig();
  const isMobile = forceMobile ?? Math.random() < 0.1; // 10% chance of mobile

  if (!config.stealth.enabled) {
    return {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezone: 'America/New_York',
      webgl: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA GeForce GTX 1080)' },
      isMobile: false,
    };
  }

  const localeTimezone = randomElement(LOCALE_TIMEZONES);

  return {
    userAgent: getRandomUserAgent(isMobile),
    viewport: getRandomViewport(isMobile),
    locale: localeTimezone.locale,
    timezone: localeTimezone.timezone,
    webgl: randomElement(WEBGL_CONFIGS),
    isMobile,
  };
}

/**
 * Advanced stealth scripts to inject into pages
 * Covers: navigator, WebGL, Canvas, AudioContext, WebRTC, permissions
 */
function getStealthScripts(fingerprint: StealthFingerprint): string {
  // Generate unique noise values for this session
  const canvasNoise = Math.random() * 0.01;
  const audioNoise = Math.random() * 0.0001;

  return `
    // Remove webdriver indicator
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Add Chrome runtime
    if (!window.chrome) {
      window.chrome = {};
    }
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        connect: () => {},
        sendMessage: () => {},
        onMessage: { addListener: () => {} },
      };
    }

    // Override plugins to look real
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ];
        plugins.length = 3;
        return plugins;
      },
    });

    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['${fingerprint.locale}', '${fingerprint.locale.split('-')[0]}'],
    });

    // Override platform
    Object.defineProperty(navigator, 'platform', {
      get: () => ${fingerprint.isMobile ? "'Linux armv8l'" : "'Win32'"},
    });

    // Override hardware concurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => ${randomInt(4, 16)},
    });

    // Override device memory
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => ${randomElement([4, 8, 16, 32])},
    });

    // Override WebGL
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return '${fingerprint.webgl.vendor}';
      if (parameter === 37446) return '${fingerprint.webgl.renderer}';
      return getParameter.call(this, parameter);
    };

    // Override WebGL2
    if (typeof WebGL2RenderingContext !== 'undefined') {
      const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return '${fingerprint.webgl.vendor}';
        if (parameter === 37446) return '${fingerprint.webgl.renderer}';
        return getParameter2.call(this, parameter);
      };
    }

    // Override permissions query
    const originalQuery = Permissions.prototype.query;
    Permissions.prototype.query = function(parameters) {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission });
      }
      return originalQuery.call(this, parameters);
    };

    // Prevent detection via iframe contentWindow
    try {
      const elementDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        get: function() {
          const contentWindow = elementDescriptor?.get?.call(this);
          if (contentWindow) {
            Object.defineProperty(contentWindow.navigator, 'webdriver', {
              get: () => undefined,
            });
          }
          return contentWindow;
        },
      });
    } catch (e) {}

    // Canvas fingerprint randomization
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
      if (this.width === 0 || this.height === 0) {
        return originalToDataURL.apply(this, arguments);
      }
      const context = this.getContext('2d');
      if (context) {
        const imageData = context.getImageData(0, 0, this.width, this.height);
        const data = imageData.data;
        // Add subtle noise to canvas data
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.max(0, Math.min(255, data[i] + Math.floor((Math.random() - 0.5) * ${canvasNoise} * 10)));
        }
        context.putImageData(imageData, 0, 0);
      }
      return originalToDataURL.apply(this, arguments);
    };

    // Canvas getImageData randomization
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function() {
      const imageData = originalGetImageData.apply(this, arguments);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(255, data[i] + Math.floor((Math.random() - 0.5) * ${canvasNoise} * 5)));
      }
      return imageData;
    };

    // AudioContext fingerprint randomization
    if (typeof AudioContext !== 'undefined') {
      const originalCreateAnalyser = AudioContext.prototype.createAnalyser;
      AudioContext.prototype.createAnalyser = function() {
        const analyser = originalCreateAnalyser.apply(this, arguments);
        const originalGetFloatFrequencyData = analyser.getFloatFrequencyData.bind(analyser);
        analyser.getFloatFrequencyData = function(array) {
          originalGetFloatFrequencyData(array);
          for (let i = 0; i < array.length; i++) {
            array[i] = array[i] + (Math.random() - 0.5) * ${audioNoise};
          }
        };
        return analyser;
      };

      const originalCreateOscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function() {
        const oscillator = originalCreateOscillator.apply(this, arguments);
        const originalFrequency = oscillator.frequency.value;
        oscillator.frequency.value = originalFrequency + (Math.random() - 0.5) * ${audioNoise};
        return oscillator;
      };
    }

    // WebRTC leak prevention
    if (typeof RTCPeerConnection !== 'undefined') {
      const originalRTCPeerConnection = RTCPeerConnection;
      window.RTCPeerConnection = function(config) {
        // Block or modify ICE servers to prevent IP leak
        if (config && config.iceServers) {
          config.iceServers = [];
        }
        return new originalRTCPeerConnection(config);
      };
      window.RTCPeerConnection.prototype = originalRTCPeerConnection.prototype;
    }

    // Prevent font enumeration fingerprinting
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

    // Override screen properties for consistency
    Object.defineProperty(screen, 'availWidth', { get: () => ${fingerprint.viewport.width} });
    Object.defineProperty(screen, 'availHeight', { get: () => ${fingerprint.viewport.height} });
    Object.defineProperty(screen, 'width', { get: () => ${fingerprint.viewport.width} });
    Object.defineProperty(screen, 'height', { get: () => ${fingerprint.viewport.height} });
    Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
    Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });

    // Override connection type
    if (navigator.connection) {
      Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g' });
      Object.defineProperty(navigator.connection, 'rtt', { get: () => ${randomInt(50, 150)} });
      Object.defineProperty(navigator.connection, 'downlink', { get: () => ${randomInt(5, 15)} });
    }

    // Battery API spoofing
    if (navigator.getBattery) {
      navigator.getBattery = () => Promise.resolve({
        charging: true,
        chargingTime: 0,
        dischargingTime: Infinity,
        level: ${(0.5 + Math.random() * 0.5).toFixed(2)},
        addEventListener: () => {},
        removeEventListener: () => {},
      });
    }
  `;
}

/**
 * Create a stealth browser context with anti-detection measures
 */
export async function createStealthContext(
  browser: Browser,
  options?: { fingerprint?: StealthFingerprint }
): Promise<BrowserContext> {
  const config = loadConfig();
  const fingerprint = options?.fingerprint || generateFingerprint();

  const contextOptions: Parameters<Browser['newContext']>[0] = {
    userAgent: fingerprint.userAgent,
    viewport: fingerprint.viewport,
    locale: fingerprint.locale,
    timezoneId: fingerprint.timezone,
    deviceScaleFactor: fingerprint.isMobile ? 3 : randomElement([1, 1.25, 1.5, 2]),
    hasTouch: fingerprint.isMobile,
    isMobile: fingerprint.isMobile,
    javaScriptEnabled: true,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      'Accept-Language': `${fingerprint.locale},${fingerprint.locale.split('-')[0]};q=0.9,en;q=0.8`,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...(fingerprint.userAgent.includes('Chrome') && {
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      }),
      'Sec-Ch-Ua-Mobile': fingerprint.isMobile ? '?1' : '?0',
      'Sec-Ch-Ua-Platform': fingerprint.isMobile ? '"Android"' : '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
  };

  const context = await browser.newContext(contextOptions);

  // Inject stealth scripts before every page loads
  if (config.stealth.fingerprintRandomization) {
    await context.addInitScript(getStealthScripts(fingerprint));
  }

  return context;
}

/**
 * Simulate human-like behavior on a page
 * Random scrolling, mouse movements, micro-pauses
 */
export async function simulateHumanBehavior(page: Page): Promise<void> {
  const config = loadConfig();
  if (!config.stealth.humanBehavior) {
    return;
  }

  try {
    // Random initial pause (humans don't act immediately)
    await page.waitForTimeout(randomDelay(500, 50));

    // Random mouse movement
    const viewport = page.viewportSize();
    if (viewport) {
      const x = randomInt(100, viewport.width - 100);
      const y = randomInt(100, Math.min(400, viewport.height - 100));
      await page.mouse.move(x, y, { steps: randomInt(5, 15) });
    }

    // Small pause
    await page.waitForTimeout(randomDelay(300, 40));

    // Random scroll (humans typically scroll to see content)
    const scrollAmount = randomInt(100, 400);
    await page.evaluate((amount) => {
      window.scrollBy({ top: amount, behavior: 'smooth' });
    }, scrollAmount);

    // Wait for scroll to complete
    await page.waitForTimeout(randomDelay(400, 30));

    // Maybe scroll back up a bit
    if (Math.random() > 0.6) {
      const scrollBack = randomInt(50, 150);
      await page.evaluate((amount) => {
        window.scrollBy({ top: -amount, behavior: 'smooth' });
      }, scrollBack);
      await page.waitForTimeout(randomDelay(200, 30));
    }

    // Random micro-movements
    if (viewport && Math.random() > 0.5) {
      const x = randomInt(50, viewport.width - 50);
      const y = randomInt(50, 300);
      await page.mouse.move(x, y, { steps: randomInt(3, 8) });
    }
  } catch {
    // Ignore errors in human behavior simulation
  }
}

/**
 * Simulate human-like scrolling to load more content
 */
export async function simulateHumanScroll(page: Page, options?: {
  scrolls?: number;
  scrollAmount?: number;
  pauseBetween?: number;
}): Promise<void> {
  const config = loadConfig();
  const numScrolls = options?.scrolls ?? randomInt(2, 5);
  const baseAmount = options?.scrollAmount ?? 300;
  const basePause = options?.pauseBetween ?? 800;

  for (let i = 0; i < numScrolls; i++) {
    const amount = config.stealth.humanBehavior
      ? randomInt(baseAmount - 100, baseAmount + 200)
      : baseAmount;

    await page.evaluate((scrollAmount) => {
      window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    }, amount);

    const pause = config.stealth.timingRandomization
      ? randomDelay(basePause, 40)
      : basePause;

    await page.waitForTimeout(pause);

    // Occasional pause variation (like reading)
    if (config.stealth.humanBehavior && Math.random() > 0.7) {
      await page.waitForTimeout(randomDelay(500, 50));
    }
  }
}

/**
 * Wait with human-like timing variation
 * Use this instead of fixed waitForTimeout calls
 */
export async function humanWait(page: Page, baseMs: number, variancePercent: number = 30): Promise<void> {
  const delay = randomDelay(baseMs, variancePercent);
  await page.waitForTimeout(delay);
}

// ============ Advanced Mouse Movement (Bezier Curves) ============

interface Point {
  x: number;
  y: number;
}

/**
 * Calculate point on a cubic Bezier curve
 */
function bezierPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

/**
 * Generate human-like mouse path using Bezier curves
 */
function generateMousePath(start: Point, end: Point, numPoints: number = 20): Point[] {
  // Random control points for natural curve
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Control points with some randomness
  const cp1: Point = {
    x: start.x + dx * 0.25 + (Math.random() - 0.5) * Math.abs(dx) * 0.3,
    y: start.y + dy * 0.1 + (Math.random() - 0.5) * Math.abs(dy) * 0.5,
  };
  const cp2: Point = {
    x: start.x + dx * 0.75 + (Math.random() - 0.5) * Math.abs(dx) * 0.3,
    y: start.y + dy * 0.9 + (Math.random() - 0.5) * Math.abs(dy) * 0.5,
  };

  const points: Point[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    // Add slight jitter for more natural movement
    const point = bezierPoint(t, start, cp1, cp2, end);
    points.push({
      x: Math.round(point.x + (Math.random() - 0.5) * 2),
      y: Math.round(point.y + (Math.random() - 0.5) * 2),
    });
  }

  return points;
}

/**
 * Move mouse along a human-like Bezier curve path
 */
export async function humanMouseMove(
  page: Page,
  toX: number,
  toY: number,
  options?: { speed?: 'slow' | 'normal' | 'fast' }
): Promise<void> {
  const config = loadConfig();
  if (!config.stealth.humanBehavior) {
    await page.mouse.move(toX, toY);
    return;
  }

  try {
    // Get current mouse position (approximate from last known or center)
    const viewport = page.viewportSize();
    const startX = viewport ? viewport.width / 2 : 500;
    const startY = viewport ? viewport.height / 2 : 300;

    const numPoints = options?.speed === 'fast' ? 10 : options?.speed === 'slow' ? 30 : 20;
    const path = generateMousePath({ x: startX, y: startY }, { x: toX, y: toY }, numPoints);

    // Variable delay between movements for natural feel
    const baseDelay = options?.speed === 'fast' ? 5 : options?.speed === 'slow' ? 20 : 10;

    for (const point of path) {
      await page.mouse.move(point.x, point.y);
      // Random micro-delays
      if (Math.random() > 0.7) {
        await page.waitForTimeout(randomInt(baseDelay, baseDelay * 3));
      }
    }
  } catch {
    // Fallback to simple move
    await page.mouse.move(toX, toY);
  }
}

/**
 * Click with human-like behavior (move + pause + click)
 */
export async function humanClick(
  page: Page,
  x: number,
  y: number,
  options?: { button?: 'left' | 'right'; doubleClick?: boolean }
): Promise<void> {
  const config = loadConfig();

  if (config.stealth.humanBehavior) {
    // Move to target with Bezier curve
    await humanMouseMove(page, x, y);

    // Brief pause before clicking (natural hesitation)
    await page.waitForTimeout(randomInt(50, 150));
  }

  // Click
  if (options?.doubleClick) {
    await page.mouse.dblclick(x, y, { button: options.button });
  } else {
    await page.mouse.click(x, y, { button: options?.button });
  }

  // Brief pause after clicking
  if (config.stealth.humanBehavior) {
    await page.waitForTimeout(randomInt(100, 300));
  }
}

// ============ Realistic Typing ============

/**
 * Type text with human-like cadence
 * Includes variable delays, occasional pauses, and realistic rhythm
 */
export async function humanType(
  page: Page,
  selector: string,
  text: string,
  options?: { speed?: 'slow' | 'normal' | 'fast'; clearFirst?: boolean }
): Promise<void> {
  const config = loadConfig();

  // Click the input first
  try {
    await page.click(selector);
    await page.waitForTimeout(randomInt(100, 200));
  } catch {
    // Continue even if click fails
  }

  // Clear existing text if requested
  if (options?.clearFirst) {
    await page.fill(selector, '');
    await page.waitForTimeout(randomInt(50, 150));
  }

  if (!config.stealth.humanBehavior) {
    // Fast typing without human simulation
    await page.fill(selector, text);
    return;
  }

  // Human typing simulation
  const baseDelay = options?.speed === 'fast' ? 30 : options?.speed === 'slow' ? 150 : 80;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Type the character
    await page.type(selector, char, { delay: 0 });

    // Variable delay based on character type
    let delay = baseDelay;

    // Longer pause after punctuation
    if (['.', ',', '!', '?', ';', ':'].includes(char)) {
      delay *= randomInt(2, 4);
    }
    // Slightly longer for capital letters (shift key)
    else if (char === char.toUpperCase() && char !== char.toLowerCase()) {
      delay *= 1.3;
    }
    // Faster for repeated characters
    else if (i > 0 && text[i - 1] === char) {
      delay *= 0.7;
    }
    // Faster within words
    else if (char !== ' ' && i > 0 && text[i - 1] !== ' ') {
      delay *= 0.9;
    }

    // Add variance
    delay = randomDelay(delay, 40);

    // Occasional longer pause (like thinking)
    if (Math.random() > 0.95) {
      delay += randomInt(200, 500);
    }

    await page.waitForTimeout(delay);
  }
}

// ============ Block & CAPTCHA Detection ============

export interface BlockDetectionResult {
  isBlocked: boolean;
  blockType: 'none' | 'captcha' | 'rate_limit' | 'access_denied' | 'bot_detection' | 'unknown';
  confidence: number;
  details?: string;
}

/**
 * Detect if a page shows signs of being blocked
 */
export async function detectBlock(page: Page): Promise<BlockDetectionResult> {
  try {
    const url = page.url();
    const title = await page.title();
    const content = await page.content();
    const contentLower = content.toLowerCase();

    // Check for CAPTCHA indicators
    const captchaIndicators = [
      'recaptcha',
      'hcaptcha',
      'captcha-container',
      'g-recaptcha',
      'cf-turnstile',
      'challenge-form',
      'challenge-running',
      'px-captcha',
      'arkose',
      'funcaptcha',
    ];

    for (const indicator of captchaIndicators) {
      if (contentLower.includes(indicator)) {
        return {
          isBlocked: true,
          blockType: 'captcha',
          confidence: 0.95,
          details: `CAPTCHA detected: ${indicator}`,
        };
      }
    }

    // Check for Cloudflare challenge
    if (
      contentLower.includes('checking your browser') ||
      contentLower.includes('just a moment') ||
      contentLower.includes('cf-browser-verification') ||
      contentLower.includes('cloudflare')
    ) {
      return {
        isBlocked: true,
        blockType: 'bot_detection',
        confidence: 0.9,
        details: 'Cloudflare challenge detected',
      };
    }

    // Check for rate limit pages
    const rateLimitIndicators = [
      'rate limit',
      'too many requests',
      'slow down',
      'request limit exceeded',
      '429',
    ];

    for (const indicator of rateLimitIndicators) {
      if (contentLower.includes(indicator) || title.toLowerCase().includes(indicator)) {
        return {
          isBlocked: true,
          blockType: 'rate_limit',
          confidence: 0.9,
          details: `Rate limit detected: ${indicator}`,
        };
      }
    }

    // Check for access denied
    const accessDeniedIndicators = [
      'access denied',
      'forbidden',
      'not authorized',
      'permission denied',
      'blocked',
      '403 forbidden',
      '401 unauthorized',
    ];

    for (const indicator of accessDeniedIndicators) {
      if (contentLower.includes(indicator) || title.toLowerCase().includes(indicator)) {
        return {
          isBlocked: true,
          blockType: 'access_denied',
          confidence: 0.85,
          details: `Access denied: ${indicator}`,
        };
      }
    }

    // Check for bot detection pages
    const botDetectionIndicators = [
      'unusual traffic',
      'automated queries',
      'bot detected',
      'suspicious activity',
      'verify you are human',
      'prove you are not a robot',
      'security check',
    ];

    for (const indicator of botDetectionIndicators) {
      if (contentLower.includes(indicator)) {
        return {
          isBlocked: true,
          blockType: 'bot_detection',
          confidence: 0.85,
          details: `Bot detection: ${indicator}`,
        };
      }
    }

    // Check HTTP status via response if available
    // Note: This would need to be passed in from navigation

    return {
      isBlocked: false,
      blockType: 'none',
      confidence: 0.8,
    };
  } catch {
    return {
      isBlocked: false,
      blockType: 'unknown',
      confidence: 0.5,
      details: 'Error during block detection',
    };
  }
}

/**
 * Wait for Cloudflare or similar challenges to complete
 */
export async function waitForChallenge(
  page: Page,
  timeoutMs: number = 30000
): Promise<{ passed: boolean; waitedMs: number }> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const blockResult = await detectBlock(page);

    if (!blockResult.isBlocked) {
      return {
        passed: true,
        waitedMs: Date.now() - startTime,
      };
    }

    // If it's a CAPTCHA that requires solving, we can't auto-pass
    if (blockResult.blockType === 'captcha') {
      return {
        passed: false,
        waitedMs: Date.now() - startTime,
      };
    }

    // Wait and check again
    await page.waitForTimeout(1000);
  }

  return {
    passed: false,
    waitedMs: Date.now() - startTime,
  };
}

// ============ Tab Focus Simulation ============

/**
 * Simulate tab focus/blur events (like user switching tabs)
 */
export async function simulateTabBehavior(page: Page): Promise<void> {
  const config = loadConfig();
  if (!config.stealth.humanBehavior) return;

  try {
    // Occasionally simulate losing focus
    if (Math.random() > 0.9) {
      await page.evaluate(() => {
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hidden', { value: true, writable: true });
      });

      await page.waitForTimeout(randomInt(500, 2000));

      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { value: false, writable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }
  } catch {
    // Ignore errors
  }
}

// ============ Stealth Navigation ============

export interface StealthNavigationResult {
  success: boolean;
  blocked: boolean;
  blockType: BlockDetectionResult['blockType'];
  loadTimeMs: number;
  finalUrl: string;
}

/**
 * Navigate with stealth measures and block detection
 */
export async function stealthNavigate(
  page: Page,
  url: string,
  options?: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    timeout?: number;
    checkForBlocks?: boolean;
  }
): Promise<StealthNavigationResult> {
  const startTime = Date.now();
  const config = loadConfig();

  try {
    // Pre-navigation behavior
    if (config.stealth.humanBehavior) {
      await page.waitForTimeout(randomInt(100, 300));
    }

    // Navigate
    await page.goto(url, {
      waitUntil: options?.waitUntil || 'domcontentloaded',
      timeout: options?.timeout || 30000,
    });

    const loadTimeMs = Date.now() - startTime;

    // Check for blocks if requested
    if (options?.checkForBlocks !== false) {
      const blockResult = await detectBlock(page);

      if (blockResult.isBlocked) {
        // Try waiting for challenge
        if (blockResult.blockType === 'bot_detection') {
          const challengeResult = await waitForChallenge(page, 10000);
          if (challengeResult.passed) {
            return {
              success: true,
              blocked: false,
              blockType: 'none',
              loadTimeMs: loadTimeMs + challengeResult.waitedMs,
              finalUrl: page.url(),
            };
          }
        }

        return {
          success: false,
          blocked: true,
          blockType: blockResult.blockType,
          loadTimeMs,
          finalUrl: page.url(),
        };
      }
    }

    // Post-navigation behavior
    if (config.stealth.humanBehavior) {
      await simulateHumanBehavior(page);
    }

    return {
      success: true,
      blocked: false,
      blockType: 'none',
      loadTimeMs,
      finalUrl: page.url(),
    };
  } catch (error) {
    return {
      success: false,
      blocked: false,
      blockType: 'none',
      loadTimeMs: Date.now() - startTime,
      finalUrl: page.url(),
    };
  }
}
