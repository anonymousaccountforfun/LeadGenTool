/**
 * Central Configuration Module
 * Loads all settings from environment variables with sensible defaults
 */

export interface StealthConfig {
  enabled: boolean;
  userAgentRotation: boolean;
  fingerprintRandomization: boolean;
  humanBehavior: boolean;
  timingRandomization: boolean;
  // Advanced evasion
  canvasNoise: boolean;
  audioNoise: boolean;
  webrtcProtection: boolean;
  // CAPTCHA solving (optional integration)
  captchaSolver: {
    enabled: boolean;
    provider: '2captcha' | 'anticaptcha' | 'capsolver' | null;
    apiKey: string | null;
  };
}

export interface ProxyConfig {
  enabled: boolean;
  provider: 'brightdata' | 'oxylabs' | 'smartproxy' | 'custom';
  brightdata: {
    host: string;
    port: number;
    username: string;
    password: string;
  };
  oxylabs: {
    username: string;
    password: string;
  };
  smartproxy: {
    username: string;
    password: string;
  };
  custom: {
    url: string;
  };
  rotateEvery: number;
  rotateOnError: boolean;
  stickySession: boolean;
  fallbackDirect: boolean;
}

export interface RateLimitConfig {
  enabled: boolean;
  perDomain: number;
  minDelay: number;
  maxDelay: number;
  respectRobots: boolean;
  domainPresets: Record<string, { requestsPerMinute: number; minDelay: number }>;
}

export interface ApiFallbackConfig {
  enabled: boolean;
  preferApis: boolean;
  // Primary APIs (supports multiple keys comma-separated for pooling)
  googlePlacesApiKey: string | null;
  googlePlacesApiKeys: string[]; // Pooled keys
  yelpFusionApiKey: string | null;
  yelpFusionApiKeys: string[]; // Pooled keys
  // Additional Free/Freemium APIs (supports multiple keys)
  foursquareApiKey: string | null;
  foursquareApiKeys: string[];
  hereApiKey: string | null;
  hereApiKeys: string[];
  tomtomApiKey: string | null;
  tomtomApiKeys: string[];
  opencageApiKey: string | null;
  opencageApiKeys: string[];
  // Quota limits (daily unless noted) - per key
  quotaLimits: {
    googlePlaces: number; // ~200 free requests/day with $200 credit
    yelpFusion: number; // 5000/day free
    foursquare: number; // 100k/month = ~3333/day
    here: number; // 250k/month = ~8333/day
    tomtom: number; // 2500/day
    opencage: number; // 2500/day
  };
}

export interface Config {
  stealth: StealthConfig;
  proxy: ProxyConfig;
  rateLimit: RateLimitConfig;
  apiFallback: ApiFallbackConfig;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse comma-separated API keys into an array
 * Supports format: KEY1,KEY2,KEY3 or single key
 */
function parseApiKeys(value: string | undefined): string[] {
  if (!value || value === '') return [];
  return value.split(',').map(k => k.trim()).filter(k => k.length > 0);
}

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const config: Config = {
    stealth: {
      enabled: parseBoolean(process.env.STEALTH_ENABLED, true),
      userAgentRotation: parseBoolean(process.env.STEALTH_USER_AGENT_ROTATION, true),
      fingerprintRandomization: parseBoolean(process.env.STEALTH_FINGERPRINT_RANDOMIZATION, true),
      humanBehavior: parseBoolean(process.env.STEALTH_HUMAN_BEHAVIOR, true),
      timingRandomization: parseBoolean(process.env.STEALTH_TIMING_RANDOMIZATION, true),
      // Advanced evasion
      canvasNoise: parseBoolean(process.env.STEALTH_CANVAS_NOISE, true),
      audioNoise: parseBoolean(process.env.STEALTH_AUDIO_NOISE, true),
      webrtcProtection: parseBoolean(process.env.STEALTH_WEBRTC_PROTECTION, true),
      // CAPTCHA solving
      captchaSolver: {
        enabled: parseBoolean(process.env.CAPTCHA_SOLVER_ENABLED, false),
        provider: (process.env.CAPTCHA_SOLVER_PROVIDER as '2captcha' | 'anticaptcha' | 'capsolver' | null) || null,
        apiKey: process.env.CAPTCHA_SOLVER_API_KEY || null,
      },
    },
    proxy: {
      enabled: parseBoolean(process.env.PROXY_ENABLED, false),
      provider: (process.env.PROXY_PROVIDER as ProxyConfig['provider']) || 'brightdata',
      brightdata: {
        host: process.env.BRIGHTDATA_HOST || 'brd.superproxy.io',
        port: parseNumber(process.env.BRIGHTDATA_PORT, 22225),
        username: process.env.BRIGHTDATA_USERNAME || '',
        password: process.env.BRIGHTDATA_PASSWORD || '',
      },
      oxylabs: {
        username: process.env.OXYLABS_USERNAME || '',
        password: process.env.OXYLABS_PASSWORD || '',
      },
      smartproxy: {
        username: process.env.SMARTPROXY_USERNAME || '',
        password: process.env.SMARTPROXY_PASSWORD || '',
      },
      custom: {
        url: process.env.PROXY_CUSTOM_URL || '',
      },
      rotateEvery: parseNumber(process.env.PROXY_ROTATE_EVERY, 10),
      rotateOnError: parseBoolean(process.env.PROXY_ROTATE_ON_ERROR, true),
      stickySession: parseBoolean(process.env.PROXY_STICKY_SESSION, false),
      fallbackDirect: parseBoolean(process.env.PROXY_FALLBACK_DIRECT, true),
    },
    rateLimit: {
      enabled: parseBoolean(process.env.RATE_LIMIT_ENABLED, true),
      perDomain: parseNumber(process.env.RATE_LIMIT_PER_DOMAIN, 20),
      minDelay: parseNumber(process.env.RATE_LIMIT_MIN_DELAY, 2000),
      maxDelay: parseNumber(process.env.RATE_LIMIT_MAX_DELAY, 5000),
      respectRobots: parseBoolean(process.env.RATE_LIMIT_RESPECT_ROBOTS, true),
      domainPresets: {
        'google.com': { requestsPerMinute: 10, minDelay: 3000 },
        'maps.google.com': { requestsPerMinute: 10, minDelay: 3000 },
        'yelp.com': { requestsPerMinute: 15, minDelay: 2500 },
        'yellowpages.com': { requestsPerMinute: 20, minDelay: 2000 },
        'bbb.org': { requestsPerMinute: 15, minDelay: 2500 },
        'healthgrades.com': { requestsPerMinute: 20, minDelay: 2000 },
        'zocdoc.com': { requestsPerMinute: 15, minDelay: 2500 },
        'angi.com': { requestsPerMinute: 20, minDelay: 2000 },
        'instagram.com': { requestsPerMinute: 10, minDelay: 3000 },
        'facebook.com': { requestsPerMinute: 10, minDelay: 3000 },
        'linkedin.com': { requestsPerMinute: 10, minDelay: 3000 },
      },
    },
    apiFallback: {
      enabled: parseBoolean(process.env.API_FALLBACK_ENABLED, false),
      preferApis: parseBoolean(process.env.API_FALLBACK_PREFER_APIS, false),
      // Primary APIs (single key for backwards compatibility)
      googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || null,
      googlePlacesApiKeys: parseApiKeys(process.env.GOOGLE_PLACES_API_KEYS || process.env.GOOGLE_PLACES_API_KEY),
      yelpFusionApiKey: process.env.YELP_FUSION_API_KEY || null,
      yelpFusionApiKeys: parseApiKeys(process.env.YELP_FUSION_API_KEYS || process.env.YELP_FUSION_API_KEY),
      // Additional Free/Freemium APIs
      foursquareApiKey: process.env.FOURSQUARE_API_KEY || null,
      foursquareApiKeys: parseApiKeys(process.env.FOURSQUARE_API_KEYS || process.env.FOURSQUARE_API_KEY),
      hereApiKey: process.env.HERE_API_KEY || null,
      hereApiKeys: parseApiKeys(process.env.HERE_API_KEYS || process.env.HERE_API_KEY),
      tomtomApiKey: process.env.TOMTOM_API_KEY || null,
      tomtomApiKeys: parseApiKeys(process.env.TOMTOM_API_KEYS || process.env.TOMTOM_API_KEY),
      opencageApiKey: process.env.OPENCAGE_API_KEY || null,
      opencageApiKeys: parseApiKeys(process.env.OPENCAGE_API_KEYS || process.env.OPENCAGE_API_KEY),
      // Quota limits (per key)
      quotaLimits: {
        googlePlaces: parseNumber(process.env.QUOTA_GOOGLE_PLACES, 200),
        yelpFusion: parseNumber(process.env.QUOTA_YELP_FUSION, 5000),
        foursquare: parseNumber(process.env.QUOTA_FOURSQUARE, 3333),
        here: parseNumber(process.env.QUOTA_HERE, 8333),
        tomtom: parseNumber(process.env.QUOTA_TOMTOM, 2500),
        opencage: parseNumber(process.env.QUOTA_OPENCAGE, 2500),
      },
    },
  };

  cachedConfig = config;
  return config;
}

export function validateConfig(): string[] {
  const warnings: string[] = [];
  const config = loadConfig();

  // Proxy validation
  if (config.proxy.enabled) {
    switch (config.proxy.provider) {
      case 'brightdata':
        if (!config.proxy.brightdata.username || !config.proxy.brightdata.password) {
          warnings.push('Proxy enabled with Bright Data but credentials not configured');
        }
        break;
      case 'oxylabs':
        if (!config.proxy.oxylabs.username || !config.proxy.oxylabs.password) {
          warnings.push('Proxy enabled with Oxylabs but credentials not configured');
        }
        break;
      case 'smartproxy':
        if (!config.proxy.smartproxy.username || !config.proxy.smartproxy.password) {
          warnings.push('Proxy enabled with SmartProxy but credentials not configured');
        }
        break;
      case 'custom':
        if (!config.proxy.custom.url) {
          warnings.push('Proxy enabled with custom provider but URL not configured');
        }
        break;
    }
  }

  // API fallback validation
  if (config.apiFallback.enabled) {
    const hasAnyApiKey = config.apiFallback.googlePlacesApiKey ||
      config.apiFallback.yelpFusionApiKey ||
      config.apiFallback.foursquareApiKey ||
      config.apiFallback.hereApiKey ||
      config.apiFallback.tomtomApiKey;
    if (!hasAnyApiKey) {
      warnings.push('API fallback enabled but no API keys configured');
    }
  }

  return warnings;
}

export function clearConfigCache(): void {
  cachedConfig = null;
}
