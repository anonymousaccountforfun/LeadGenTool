/**
 * Proxy Rotation Module
 * Handles proxy rotation with support for multiple providers
 */

import { loadConfig } from './config';

export interface ProxySettings {
  server: string;
  username?: string;
  password?: string;
}

interface ProxyState {
  currentProxy: ProxySettings | null;
  requestCount: number;
  lastRotation: number;
  failureCount: number;
  sessionId: string;
}

class ProxyManager {
  private state: ProxyState = {
    currentProxy: null,
    requestCount: 0,
    lastRotation: 0,
    failureCount: 0,
    sessionId: this.generateSessionId(),
  };

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get the current proxy configuration for Playwright
   * Returns null if proxy is disabled or not configured
   */
  getProxyConfig(): ProxySettings | null {
    const config = loadConfig();

    if (!config.proxy.enabled) {
      return null;
    }

    // Check if we need to rotate
    if (this.shouldRotate()) {
      this.rotate();
    }

    return this.state.currentProxy;
  }

  /**
   * Check if we should rotate the proxy
   */
  private shouldRotate(): boolean {
    const config = loadConfig();

    // No current proxy
    if (!this.state.currentProxy) {
      return true;
    }

    // Rotate every N requests
    if (config.proxy.rotateEvery > 0 && this.state.requestCount >= config.proxy.rotateEvery) {
      return true;
    }

    return false;
  }

  /**
   * Rotate to a new proxy
   */
  rotate(): void {
    const config = loadConfig();

    if (!config.proxy.enabled) {
      this.state.currentProxy = null;
      return;
    }

    // Generate new session ID for non-sticky sessions
    if (!config.proxy.stickySession) {
      this.state.sessionId = this.generateSessionId();
    }

    switch (config.proxy.provider) {
      case 'brightdata':
        this.state.currentProxy = this.getBrightDataProxy();
        break;
      case 'oxylabs':
        this.state.currentProxy = this.getOxylabsProxy();
        break;
      case 'smartproxy':
        this.state.currentProxy = this.getSmartProxyProxy();
        break;
      case 'custom':
        this.state.currentProxy = this.getCustomProxy();
        break;
      default:
        this.state.currentProxy = null;
    }

    this.state.requestCount = 0;
    this.state.lastRotation = Date.now();
  }

  /**
   * Record a request made through the proxy
   */
  recordRequest(): void {
    this.state.requestCount++;
  }

  /**
   * Report a proxy failure
   * May trigger rotation if configured
   */
  reportFailure(): void {
    const config = loadConfig();
    this.state.failureCount++;

    if (config.proxy.rotateOnError) {
      this.rotate();
    }
  }

  /**
   * Reset failure count (e.g., after successful request)
   */
  recordSuccess(): void {
    this.state.failureCount = 0;
  }

  /**
   * Check if we should fall back to direct connection
   */
  shouldFallbackDirect(): boolean {
    const config = loadConfig();
    return config.proxy.fallbackDirect && this.state.failureCount >= 3;
  }

  /**
   * Get proxy stats
   */
  getStats(): { requestCount: number; failureCount: number; lastRotation: number } {
    return {
      requestCount: this.state.requestCount,
      failureCount: this.state.failureCount,
      lastRotation: this.state.lastRotation,
    };
  }

  // Provider-specific proxy configurations

  private getBrightDataProxy(): ProxySettings | null {
    const config = loadConfig();
    const { host, port, username, password } = config.proxy.brightdata;

    if (!username || !password) {
      console.warn('Bright Data proxy credentials not configured');
      return null;
    }

    // Bright Data format with session for rotation
    // Format: customer-{customer_id}-session-{session_id}
    const sessionSuffix = config.proxy.stickySession
      ? `-session-${this.state.sessionId}`
      : `-session-${this.generateSessionId()}`;

    return {
      server: `http://${host}:${port}`,
      username: `${username}${sessionSuffix}`,
      password: password,
    };
  }

  private getOxylabsProxy(): ProxySettings | null {
    const config = loadConfig();
    const { username, password } = config.proxy.oxylabs;

    if (!username || !password) {
      console.warn('Oxylabs proxy credentials not configured');
      return null;
    }

    // Oxylabs residential proxy endpoint
    return {
      server: 'http://pr.oxylabs.io:7777',
      username: username,
      password: password,
    };
  }

  private getSmartProxyProxy(): ProxySettings | null {
    const config = loadConfig();
    const { username, password } = config.proxy.smartproxy;

    if (!username || !password) {
      console.warn('SmartProxy credentials not configured');
      return null;
    }

    // SmartProxy residential endpoint
    return {
      server: 'http://gate.smartproxy.com:7000',
      username: username,
      password: password,
    };
  }

  private getCustomProxy(): ProxySettings | null {
    const config = loadConfig();
    const url = config.proxy.custom.url;

    if (!url) {
      console.warn('Custom proxy URL not configured');
      return null;
    }

    try {
      const parsed = new URL(url);
      return {
        server: `${parsed.protocol}//${parsed.host}`,
        username: parsed.username || undefined,
        password: parsed.password || undefined,
      };
    } catch (error) {
      console.warn('Invalid custom proxy URL:', url);
      return null;
    }
  }
}

// Singleton instance
let proxyManagerInstance: ProxyManager | null = null;

export function getProxyManager(): ProxyManager {
  if (!proxyManagerInstance) {
    proxyManagerInstance = new ProxyManager();
  }
  return proxyManagerInstance;
}

/**
 * Get proxy configuration for Playwright browser launch/connect
 * Returns undefined if proxy is disabled
 */
export function getPlaywrightProxyConfig(): { proxy: ProxySettings } | undefined {
  const manager = getProxyManager();
  const proxyConfig = manager.getProxyConfig();

  if (!proxyConfig) {
    return undefined;
  }

  return { proxy: proxyConfig };
}

/**
 * Helper to wrap navigation with proxy tracking
 */
export function trackProxyRequest(): void {
  getProxyManager().recordRequest();
}

export function reportProxySuccess(): void {
  getProxyManager().recordSuccess();
}

export function reportProxyFailure(): void {
  getProxyManager().reportFailure();
}

export function shouldUseDirect(): boolean {
  return getProxyManager().shouldFallbackDirect();
}

export function rotateProxy(): void {
  getProxyManager().rotate();
}
