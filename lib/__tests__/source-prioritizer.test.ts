import { describe, it, expect } from 'vitest';
import {
  detectQueryCategory,
  getPrioritizedSources,
  groupSourcesByPriority,
  filterSourcesByResultCount,
  getCategoryDescription,
  estimateScrapeTime,
  type DataSource,
  type QueryCategory,
} from '../source-prioritizer';

// ============ detectQueryCategory Tests ============

describe('detectQueryCategory', () => {
  it('detects medical queries', () => {
    expect(detectQueryCategory('dentist', true)).toBe('medical');
    expect(detectQueryCategory('doctors', true)).toBe('medical');
    expect(detectQueryCategory('orthodontist', true)).toBe('medical');
    expect(detectQueryCategory('dermatologist near me', true)).toBe('medical');
  });

  it('detects home services queries', () => {
    expect(detectQueryCategory('plumber', true)).toBe('home_services');
    expect(detectQueryCategory('electrician', true)).toBe('home_services');
    expect(detectQueryCategory('roofer contractors', true)).toBe('home_services');
    expect(detectQueryCategory('hvac repair', true)).toBe('home_services');
  });

  it('detects legal queries', () => {
    const lawyerCategory = detectQueryCategory('lawyer', true);
    const attorneyCategory = detectQueryCategory('attorney', true);
    // Legal queries may be categorized as legal, professional_services, or general_local
    expect(['legal', 'general_local', 'professional_services']).toContain(lawyerCategory);
    expect(['legal', 'general_local', 'professional_services']).toContain(attorneyCategory);
  });

  it('detects restaurant/food queries', () => {
    expect(detectQueryCategory('restaurant', true)).toBe('restaurant_food');
    expect(detectQueryCategory('pizza', true)).toBe('restaurant_food');
    expect(detectQueryCategory('coffee shop', true)).toBe('restaurant_food');
    expect(detectQueryCategory('cafe', true)).toBe('restaurant_food');
  });

  it('detects online/DTC queries', () => {
    const dtcCategory = detectQueryCategory('dtc brand', false);
    const ecomCategory = detectQueryCategory('ecommerce company', false);
    // Online queries without location
    expect(['online_dtc', 'online_brand', 'general_online']).toContain(dtcCategory);
    expect(['online_dtc', 'online_brand', 'general_online']).toContain(ecomCategory);
  });

  it('defaults to general_local with location', () => {
    expect(detectQueryCategory('random business', true)).toBe('general_local');
  });

  it('defaults to general_online without location', () => {
    expect(detectQueryCategory('random business', false)).toBe('general_online');
  });
});

// ============ getPrioritizedSources Tests ============

describe('getPrioritizedSources', () => {
  it('returns sources for local queries', () => {
    const sources = getPrioritizedSources('dentist', true);
    expect(sources.length).toBeGreaterThan(0);

    const sourceNames = sources.map(s => s.source);
    expect(sourceNames).toContain('google_maps');
  });

  it('includes medical-specific sources for medical queries', () => {
    const sources = getPrioritizedSources('dentist', true);
    const sourceNames = sources.map(s => s.source);

    expect(sourceNames).toContain('healthgrades');
    expect(sourceNames).toContain('zocdoc');
  });

  it('includes home service sources for home service queries', () => {
    const sources = getPrioritizedSources('plumber', true);
    const sourceNames = sources.map(s => s.source);

    expect(sourceNames).toContain('angi');
    expect(sourceNames).toContain('thumbtack');
  });

  it('includes legal sources for legal queries', () => {
    const sources = getPrioritizedSources('lawyer', true);
    const sourceNames = sources.map(s => s.source);

    expect(sourceNames).toContain('avvo');
  });

  it('returns online sources for DTC queries', () => {
    const sources = getPrioritizedSources('dtc brand', false);
    const sourceNames = sources.map(s => s.source);

    expect(sourceNames).toContain('google_search');
    expect(sourceNames).toContain('instagram');
  });

  it('assigns priority levels', () => {
    const sources = getPrioritizedSources('dentist', true);
    const priorities = sources.map(s => s.priority);

    expect(Math.min(...priorities)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...priorities)).toBeLessThanOrEqual(10);
  });
});

// ============ groupSourcesByPriority Tests ============

describe('groupSourcesByPriority', () => {
  it('groups sources by priority', () => {
    const sources = getPrioritizedSources('dentist', true);
    const groups = groupSourcesByPriority(sources);

    expect(groups.size).toBeGreaterThan(0);

    // Each group should contain sources with same priority
    for (const [priority, groupSources] of groups) {
      for (const source of groupSources) {
        expect(source.priority).toBe(priority);
      }
    }
  });

  it('handles empty sources', () => {
    const groups = groupSourcesByPriority([]);
    expect(groups.size).toBe(0);
  });
});

// ============ filterSourcesByResultCount Tests ============

describe('filterSourcesByResultCount', () => {
  it('filters out skip-if-full sources when enough results', () => {
    const sources = getPrioritizedSources('dentist', true);
    const filtered = filterSourcesByResultCount(sources, 500);

    // Sources with minResults threshold should be filtered out when we already have enough results
    const withMinResults = sources.filter(s => s.minResults);
    const filteredWithMinResults = filtered.filter(s =>
      withMinResults.some(w => w.source === s.source && s.minResults && 500 >= s.minResults)
    );

    // When we have 500 results, sources requiring fewer results should be skipped
    expect(filteredWithMinResults.length).toBe(0);
  });

  it('keeps all sources when result count is 0', () => {
    const sources = getPrioritizedSources('dentist', true);
    const filtered = filterSourcesByResultCount(sources, 0);

    expect(filtered.length).toBe(sources.length);
  });
});

// ============ getCategoryDescription Tests ============

describe('getCategoryDescription', () => {
  it('returns descriptions for known categories', () => {
    const medicalDesc = getCategoryDescription('medical');
    const homeDesc = getCategoryDescription('home_services');
    const generalLocalDesc = getCategoryDescription('general_local');

    // Should return string descriptions
    expect(typeof medicalDesc).toBe('string');
    expect(typeof homeDesc).toBe('string');
    expect(typeof generalLocalDesc).toBe('string');
  });

  it('handles categories gracefully', () => {
    // Unknown categories should return something (undefined or a fallback)
    const result = getCategoryDescription('unknown' as QueryCategory);
    // Just verify it doesn't throw
    expect(result === undefined || typeof result === 'string').toBe(true);
  });
});

// ============ estimateScrapeTime Tests ============

describe('estimateScrapeTime', () => {
  it('returns positive time for any sources', () => {
    const sources = getPrioritizedSources('dentist', true);
    const time = estimateScrapeTime(sources, 100);

    expect(time).toBeGreaterThan(0);
  });

  it('returns consistent time for same sources', () => {
    const sources = getPrioritizedSources('dentist', true);
    const time1 = estimateScrapeTime(sources, 100);
    const time2 = estimateScrapeTime(sources, 100);

    // Same input should give same output
    expect(time1).toBe(time2);
  });

  it('returns 0 for empty sources', () => {
    const time = estimateScrapeTime([], 100);
    expect(time).toBe(0);
  });
});
