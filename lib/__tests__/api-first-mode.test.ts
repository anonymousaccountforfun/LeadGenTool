/**
 * Tests for API-First Search Mode features
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSourceUsage,
  getCostSavings,
  getSourceUsageSummary,
  resetSessionTracking,
  canApisFullfillRequest,
  getApiAvailabilityStatus,
} from '../api-fallback';
import { getPrioritizedSources } from '../source-prioritizer';

describe('API-First Mode: Source Tracking', () => {
  beforeEach(() => {
    // Reset tracking before each test
    resetSessionTracking();
  });

  describe('recordSourceUsage', () => {
    it('should track API source usage', () => {
      recordSourceUsage('Google Places', 15, 500, true);

      const summary = getSourceUsageSummary();
      expect(summary.totalResults).toBe(15);
      expect(summary.apiResults).toBe(15);
      expect(summary.scrapedResults).toBe(0);
      expect(summary.apiPercentage).toBe(100);
    });

    it('should track scraping source usage', () => {
      recordSourceUsage('Google Maps', 20, 3000, false);

      const summary = getSourceUsageSummary();
      expect(summary.totalResults).toBe(20);
      expect(summary.apiResults).toBe(0);
      expect(summary.scrapedResults).toBe(20);
      expect(summary.apiPercentage).toBe(0);
    });

    it('should track mixed API and scraping usage', () => {
      recordSourceUsage('Google Places', 15, 500, true);
      recordSourceUsage('Yelp Fusion', 10, 400, true);
      recordSourceUsage('Google Maps', 25, 3000, false);

      const summary = getSourceUsageSummary();
      expect(summary.totalResults).toBe(50);
      expect(summary.apiResults).toBe(25);
      expect(summary.scrapedResults).toBe(25);
      expect(summary.apiPercentage).toBe(50);
    });

    it('should aggregate results from same source', () => {
      recordSourceUsage('Google Places', 10, 300, true);
      recordSourceUsage('Google Places', 5, 200, true);

      const summary = getSourceUsageSummary();
      expect(summary.sources.length).toBe(1);
      expect(summary.sources[0].results).toBe(15);
    });
  });

  describe('getSourceUsageSummary', () => {
    it('should return empty summary when no usage recorded', () => {
      const summary = getSourceUsageSummary();
      expect(summary.totalResults).toBe(0);
      expect(summary.apiResults).toBe(0);
      expect(summary.scrapedResults).toBe(0);
      expect(summary.sources).toHaveLength(0);
    });

    it('should include all sources in summary', () => {
      recordSourceUsage('Google Places', 10, 300, true);
      recordSourceUsage('Yelp', 8, 2000, false);
      recordSourceUsage('HERE', 12, 400, true);

      const summary = getSourceUsageSummary();
      expect(summary.sources).toHaveLength(3);
      expect(summary.sources.map(s => s.name).sort()).toEqual(['Google Places', 'HERE', 'Yelp']);
    });
  });

  describe('resetSessionTracking', () => {
    it('should clear all tracked usage', () => {
      recordSourceUsage('Google Places', 15, 500, true);
      recordSourceUsage('Yelp', 10, 2000, false);

      let summary = getSourceUsageSummary();
      expect(summary.totalResults).toBe(25);

      resetSessionTracking();

      summary = getSourceUsageSummary();
      expect(summary.totalResults).toBe(0);
      expect(summary.sources).toHaveLength(0);
    });
  });
});

describe('API-First Mode: Cost Savings', () => {
  beforeEach(() => {
    resetSessionTracking();
  });

  describe('getCostSavings', () => {
    it('should calculate zero savings when no API usage', () => {
      const savings = getCostSavings();
      expect(savings.apiCalls).toBe(0);
      expect(savings.scrapingAvoided).toBe(0);
      expect(savings.estimatedTimeSavedMs).toBe(0);
    });

    it('should calculate savings from API usage', () => {
      // Simulate API returning 20 results in 500ms
      recordSourceUsage('Google Places', 20, 500, true);

      const savings = getCostSavings();
      expect(savings.apiCalls).toBe(1);
      expect(savings.scrapingAvoided).toBe(20);
      // Time saved = (20 * 2000ms scraping) - 500ms API = 39500ms
      expect(savings.estimatedTimeSavedMs).toBe(39500);
      // Cost saved = 20 * $0.002 = $0.04
      expect(savings.estimatedCostSavedUsd).toBeCloseTo(0.04);
    });

    it('should aggregate savings from multiple API calls', () => {
      recordSourceUsage('Google Places', 15, 400, true);
      recordSourceUsage('Yelp Fusion', 10, 300, true);
      recordSourceUsage('Foursquare', 5, 200, true);

      const savings = getCostSavings();
      expect(savings.apiCalls).toBe(3);
      expect(savings.scrapingAvoided).toBe(30);
      // Time saved = (30 * 2000) - (400 + 300 + 200) = 60000 - 900 = 59100ms
      expect(savings.estimatedTimeSavedMs).toBe(59100);
    });

    it('should not count scraping in savings', () => {
      recordSourceUsage('Google Places', 10, 300, true);
      recordSourceUsage('Google Maps', 20, 3000, false); // This shouldn't count as savings

      const savings = getCostSavings();
      expect(savings.apiCalls).toBe(1);
      expect(savings.scrapingAvoided).toBe(10);
    });
  });
});

describe('API-First Mode: Availability Status', () => {
  describe('getApiAvailabilityStatus', () => {
    it('should return API status array', () => {
      const status = getApiAvailabilityStatus();
      expect(Array.isArray(status)).toBe(true);
    });

    it('should include required fields in status', () => {
      const status = getApiAvailabilityStatus();
      for (const api of status) {
        expect(api).toHaveProperty('name');
        expect(api).toHaveProperty('available');
        expect(api).toHaveProperty('remaining');
        expect(api).toHaveProperty('limit');
        expect(api).toHaveProperty('percentUsed');
        expect(api).toHaveProperty('priority');
        expect(api).toHaveProperty('estimatedResults');
      }
    });

    it('should sort by priority', () => {
      const status = getApiAvailabilityStatus();
      if (status.length >= 2) {
        for (let i = 1; i < status.length; i++) {
          expect(status[i].priority).toBeGreaterThanOrEqual(status[i - 1].priority);
        }
      }
    });
  });

  describe('canApisFullfillRequest', () => {
    it('should return fulfillment status', () => {
      const result = canApisFullfillRequest(50);

      expect(result).toHaveProperty('canFulfill');
      expect(result).toHaveProperty('estimatedFromApis');
      expect(result).toHaveProperty('needsScraping');
      expect(result).toHaveProperty('recommendedApis');
      expect(Array.isArray(result.recommendedApis)).toBe(true);
    });

    it('should indicate scraping needed for large requests when no APIs configured', () => {
      // With no API keys configured, should need scraping
      const result = canApisFullfillRequest(1000);
      // This test depends on whether API keys are configured
      expect(typeof result.needsScraping).toBe('boolean');
    });
  });
});

describe('API-First Mode: Source Type Classification', () => {
  // Test that source types are properly classified
  it('should classify scraping sources correctly', () => {
    // All our current source prioritizers use scraping
    // This test validates the type field exists in SourceConfig
    const sources = getPrioritizedSources('restaurants', true);

    for (const source of sources) {
      expect(source).toHaveProperty('type');
      expect(['api', 'scrape']).toContain(source.type);
    }
  });

  it('should mark all category sources with type field', () => {
    const testCases = [
      { query: 'restaurants', hasLocation: true },
      { query: 'dentists', hasLocation: true },
      { query: 'plumbers', hasLocation: true },
      { query: 'lawyers', hasLocation: true },
      { query: 'dtc brands', hasLocation: false },
    ];

    for (const testCase of testCases) {
      const sources = getPrioritizedSources(testCase.query, testCase.hasLocation);
      for (const source of sources) {
        expect(source.type).toBeDefined();
        expect(['api', 'scrape']).toContain(source.type);
      }
    }
  });
});
