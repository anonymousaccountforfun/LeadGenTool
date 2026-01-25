/**
 * Tests for Email Pattern Learning and Database
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the feedback-aggregator module before imports
vi.mock('../feedback-aggregator', () => ({
  getDomainPattern: vi.fn(),
  learnEmailPattern: vi.fn(),
}));

import {
  detectPattern,
  learnPattern,
  generateFromPattern,
  getEmailVariations,
  adjustConfidenceForCatchAll,
  getPatternMatchBoost,
  recordConfirmedPattern,
  getLearnedPattern,
  getIndustryPatterns,
  getSizePatterns,
  getSmartEmailVariations,
  findSimilarDomains,
  calculateEmailConfidence,
  getPatternStats,
  clearPatternCache,
  INDUSTRY_PATTERN_PREFERENCES,
  SIZE_PATTERN_PREFERENCES,
  type EmailPattern,
} from '../email-patterns';

import { getDomainPattern, learnEmailPattern } from '../feedback-aggregator';

const mockGetDomainPattern = vi.mocked(getDomainPattern);
const mockLearnEmailPattern = vi.mocked(learnEmailPattern);

describe('Email Patterns', () => {
  beforeEach(() => {
    clearPatternCache();
    vi.clearAllMocks();
    mockGetDomainPattern.mockResolvedValue(null);
    mockLearnEmailPattern.mockResolvedValue(undefined);
  });

  describe('detectPattern', () => {
    it('should detect first.last pattern', () => {
      expect(detectPattern('john.smith@example.com', 'John', 'Smith')).toBe('first.last');
    });

    it('should detect firstlast pattern', () => {
      expect(detectPattern('johnsmith@example.com', 'John', 'Smith')).toBe('firstlast');
    });

    it('should detect first_last pattern', () => {
      expect(detectPattern('john_smith@example.com', 'John', 'Smith')).toBe('first_last');
    });

    it('should detect flast pattern', () => {
      expect(detectPattern('jsmith@example.com', 'John', 'Smith')).toBe('flast');
    });

    it('should detect firstl pattern', () => {
      expect(detectPattern('johns@example.com', 'John', 'Smith')).toBe('firstl');
    });

    it('should detect f.last pattern', () => {
      expect(detectPattern('j.smith@example.com', 'John', 'Smith')).toBe('f.last');
    });

    it('should detect first pattern', () => {
      expect(detectPattern('john@example.com', 'John', 'Smith')).toBe('first');
    });

    it('should detect last pattern', () => {
      expect(detectPattern('smith@example.com', 'John', 'Smith')).toBe('last');
    });

    it('should detect lastfirst pattern', () => {
      expect(detectPattern('smithjohn@example.com', 'John', 'Smith')).toBe('lastfirst');
    });

    it('should detect last.first pattern', () => {
      expect(detectPattern('smith.john@example.com', 'John', 'Smith')).toBe('last.first');
    });

    it('should detect lastf pattern', () => {
      expect(detectPattern('smithj@example.com', 'John', 'Smith')).toBe('lastf');
    });

    it('should detect fl pattern', () => {
      expect(detectPattern('js@example.com', 'John', 'Smith')).toBe('fl');
    });

    it('should return unknown for unrecognized patterns', () => {
      expect(detectPattern('admin@example.com', 'John', 'Smith')).toBe('unknown');
    });

    it('should be case-insensitive', () => {
      expect(detectPattern('JOHN.SMITH@example.com', 'john', 'smith')).toBe('first.last');
    });
  });

  describe('generateFromPattern', () => {
    const testCases: Array<{ pattern: EmailPattern; expected: string }> = [
      { pattern: 'first.last', expected: 'john.smith@example.com' },
      { pattern: 'firstlast', expected: 'johnsmith@example.com' },
      { pattern: 'first_last', expected: 'john_smith@example.com' },
      { pattern: 'flast', expected: 'jsmith@example.com' },
      { pattern: 'firstl', expected: 'johns@example.com' },
      { pattern: 'f.last', expected: 'j.smith@example.com' },
      { pattern: 'first', expected: 'john@example.com' },
      { pattern: 'last', expected: 'smith@example.com' },
      { pattern: 'lastfirst', expected: 'smithjohn@example.com' },
      { pattern: 'last.first', expected: 'smith.john@example.com' },
      { pattern: 'lastf', expected: 'smithj@example.com' },
      { pattern: 'fl', expected: 'js@example.com' },
    ];

    testCases.forEach(({ pattern, expected }) => {
      it(`should generate ${pattern} pattern correctly`, () => {
        expect(generateFromPattern(pattern, 'John', 'Smith', 'example.com')).toBe(expected);
      });
    });

    it('should handle unknown pattern with default', () => {
      expect(generateFromPattern('unknown', 'John', 'Smith', 'example.com')).toBe('john.smith@example.com');
    });

    it('should lowercase names', () => {
      expect(generateFromPattern('first.last', 'JOHN', 'SMITH', 'example.com')).toBe('john.smith@example.com');
    });

    it('should trim whitespace', () => {
      expect(generateFromPattern('first.last', ' John ', ' Smith ', 'example.com')).toBe('john.smith@example.com');
    });
  });

  describe('learnPattern', () => {
    it('should learn the most common pattern from emails', () => {
      const emails = [
        { email: 'john.doe@company.com', firstName: 'John', lastName: 'Doe' },
        { email: 'jane.smith@company.com', firstName: 'Jane', lastName: 'Smith' },
        { email: 'bob.wilson@company.com', firstName: 'Bob', lastName: 'Wilson' },
      ];

      expect(learnPattern('company.com', emails)).toBe('first.last');
    });

    it('should ignore emails without names', () => {
      const emails = [
        { email: 'info@company.com' },
        { email: 'john.doe@company.com', firstName: 'John', lastName: 'Doe' },
        { email: 'contact@company.com' },
      ];

      expect(learnPattern('company.com', emails)).toBe('first.last');
    });

    it('should return first.last as default when no patterns detected', () => {
      const emails = [
        { email: 'info@company.com' },
        { email: 'contact@company.com' },
      ];

      expect(learnPattern('company.com', emails)).toBe('first.last');
    });

    it('should cache the learned pattern', () => {
      const emails = [
        { email: 'jsmith@company.com', firstName: 'John', lastName: 'Smith' },
      ];

      learnPattern('company.com', emails);

      // Second call should use cache
      expect(learnPattern('company.com', [])).toBe('flast');
    });
  });

  describe('getEmailVariations', () => {
    it('should return common email variations', () => {
      const variations = getEmailVariations('John', 'Smith', 'example.com');

      expect(variations).toContain('john.smith@example.com');
      expect(variations).toContain('johnsmith@example.com');
      expect(variations).toContain('jsmith@example.com');
      expect(variations).toContain('john@example.com');
    });

    it('should remove duplicates', () => {
      const variations = getEmailVariations('John', 'Smith', 'example.com');
      const unique = new Set(variations);

      expect(variations.length).toBe(unique.size);
    });

    it('should prioritize learned pattern', () => {
      // First learn a pattern
      learnPattern('learned.com', [
        { email: 'jsmith@learned.com', firstName: 'John', lastName: 'Smith' },
        { email: 'jdoe@learned.com', firstName: 'Jane', lastName: 'Doe' },
      ]);

      const variations = getEmailVariations('Bob', 'Wilson', 'learned.com');

      // The learned pattern (flast) should be first
      expect(variations[0]).toBe('bwilson@learned.com');
    });
  });

  describe('adjustConfidenceForCatchAll', () => {
    it('should reduce confidence for guessed emails on catch-all domains', () => {
      const result = adjustConfidenceForCatchAll(0.9, true, true);
      expect(result).toBe(0.65);
    });

    it('should not reduce confidence for non-guessed emails', () => {
      const result = adjustConfidenceForCatchAll(0.9, true, false);
      expect(result).toBe(0.9);
    });

    it('should not reduce confidence for non-catch-all domains', () => {
      const result = adjustConfidenceForCatchAll(0.9, false, true);
      expect(result).toBe(0.9);
    });

    it('should cap at 0.65 for catch-all guessed emails', () => {
      const result = adjustConfidenceForCatchAll(0.5, true, true);
      expect(result).toBe(0.5);
    });
  });

  describe('getPatternMatchBoost', () => {
    it('should return 0 for unknown domains', () => {
      expect(getPatternMatchBoost('unknown.com')).toBe(0);
    });

    it('should return boost for domains with multiple confirmed emails', () => {
      // Learn pattern with multiple emails
      learnPattern('confirmed.com', [
        { email: 'john.doe@confirmed.com', firstName: 'John', lastName: 'Doe' },
        { email: 'jane.smith@confirmed.com', firstName: 'Jane', lastName: 'Smith' },
      ]);

      expect(getPatternMatchBoost('confirmed.com')).toBe(0.10);
    });

    it('should return 0 for domains with single email', () => {
      learnPattern('single.com', [
        { email: 'john.doe@single.com', firstName: 'John', lastName: 'Doe' },
      ]);

      expect(getPatternMatchBoost('single.com')).toBe(0);
    });
  });

  describe('recordConfirmedPattern', () => {
    it('should record a confirmed email pattern', async () => {
      const result = await recordConfirmedPattern(
        'john.smith@company.com',
        'John',
        'Smith',
        'company.com'
      );

      expect(result.pattern).toBe('first.last');
      expect(result.confidence).toBeGreaterThan(0);
      expect(mockLearnEmailPattern).toHaveBeenCalledWith('company.com', 'john.smith@company.com');
    });

    it('should extract domain from email if not provided', async () => {
      const result = await recordConfirmedPattern(
        'jane.doe@extracted.com',
        'Jane',
        'Doe'
      );

      expect(result.pattern).toBe('first.last');
      expect(mockLearnEmailPattern).toHaveBeenCalledWith('extracted.com', 'jane.doe@extracted.com');
    });

    it('should increase confidence on repeated confirmations', async () => {
      await recordConfirmedPattern('john.smith@repeat.com', 'John', 'Smith');
      const first = await recordConfirmedPattern('john.smith@repeat.com', 'John', 'Smith');
      const second = await recordConfirmedPattern('jane.doe@repeat.com', 'Jane', 'Doe', 'repeat.com');

      expect(second.confidence).toBeGreaterThanOrEqual(first.confidence);
    });

    it('should handle database errors gracefully', async () => {
      mockLearnEmailPattern.mockRejectedValueOnce(new Error('DB error'));

      const result = await recordConfirmedPattern(
        'john.smith@error.com',
        'John',
        'Smith'
      );

      expect(result.pattern).toBe('first.last');
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('getLearnedPattern', () => {
    it('should return null for unknown domains', async () => {
      const result = await getLearnedPattern('unknown.com');

      expect(result.pattern).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('should return cached pattern', async () => {
      await recordConfirmedPattern('jsmith@cached.com', 'John', 'Smith');

      const result = await getLearnedPattern('cached.com');

      expect(result.pattern).toBe('flast');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should fetch from database when cache misses', async () => {
      mockGetDomainPattern.mockResolvedValueOnce({
        domain: 'db.com',
        email_pattern: '{first}.{last}',
        pattern_confidence: 0.85,
        sample_count: 5,
      });

      const result = await getLearnedPattern('db.com');

      expect(result.pattern).toBe('first.last');
      expect(result.confidence).toBe(0.85);
    });
  });

  describe('getIndustryPatterns', () => {
    it('should return patterns for known industries', () => {
      expect(getIndustryPatterns('law')).toEqual(['first.last', 'firstl', 'f.last']);
      expect(getIndustryPatterns('technology')).toEqual(['first', 'flast', 'first.last']);
      expect(getIndustryPatterns('restaurant')).toEqual(['info', 'contact', 'first']);
    });

    it('should be case-insensitive', () => {
      expect(getIndustryPatterns('LAW')).toEqual(['first.last', 'firstl', 'f.last']);
    });

    it('should match partial industry names', () => {
      expect(getIndustryPatterns('dental care')).toEqual(INDUSTRY_PATTERN_PREFERENCES['dental']);
    });

    it('should return default patterns for unknown industries', () => {
      expect(getIndustryPatterns('unknown')).toEqual(INDUSTRY_PATTERN_PREFERENCES['default']);
    });
  });

  describe('getSizePatterns', () => {
    it('should return enterprise patterns for 500+ employees', () => {
      expect(getSizePatterns(500)).toEqual(SIZE_PATTERN_PREFERENCES['enterprise']);
      expect(getSizePatterns(1000)).toEqual(SIZE_PATTERN_PREFERENCES['enterprise']);
    });

    it('should return medium patterns for 50-499 employees', () => {
      expect(getSizePatterns(50)).toEqual(SIZE_PATTERN_PREFERENCES['medium']);
      expect(getSizePatterns(200)).toEqual(SIZE_PATTERN_PREFERENCES['medium']);
    });

    it('should return small patterns for 10-49 employees', () => {
      expect(getSizePatterns(10)).toEqual(SIZE_PATTERN_PREFERENCES['small']);
      expect(getSizePatterns(30)).toEqual(SIZE_PATTERN_PREFERENCES['small']);
    });

    it('should return micro patterns for 1-9 employees', () => {
      expect(getSizePatterns(1)).toEqual(SIZE_PATTERN_PREFERENCES['micro']);
      expect(getSizePatterns(9)).toEqual(SIZE_PATTERN_PREFERENCES['micro']);
    });
  });

  describe('getSmartEmailVariations', () => {
    it('should return prioritized email variations', async () => {
      const result = await getSmartEmailVariations('John', 'Smith', 'example.com');

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(10);
      expect(result[0]).toHaveProperty('email');
      expect(result[0]).toHaveProperty('pattern');
      expect(result[0]).toHaveProperty('confidence');
    });

    it('should prioritize learned patterns', async () => {
      await recordConfirmedPattern('jsmith@learned.com', 'John', 'Smith');

      const result = await getSmartEmailVariations('Bob', 'Wilson', 'learned.com');

      expect(result[0].pattern).toBe('flast');
      expect(result[0].email).toBe('bwilson@learned.com');
    });

    it('should consider industry when provided', async () => {
      const result = await getSmartEmailVariations('John', 'Smith', 'lawfirm.com', {
        industry: 'law',
      });

      // Law industry prefers first.last
      const firstLastVariation = result.find(v => v.pattern === 'first.last');
      expect(firstLastVariation).toBeDefined();
      expect(firstLastVariation!.confidence).toBeGreaterThan(0.5);
    });

    it('should consider company size when provided', async () => {
      const result = await getSmartEmailVariations('John', 'Smith', 'enterprise.com', {
        employeeCount: 1000,
      });

      // Should include enterprise-preferred patterns
      const patterns = result.map(v => v.pattern);
      expect(patterns).toContain('first.last');
    });
  });

  describe('findSimilarDomains', () => {
    it('should find domains with similar structure', () => {
      const allDomains = [
        'techcorp.com',
        'techstart.com',
        'techsolutions.io',
        'marketingco.com',
        'tech.io',
      ];

      const similar = findSimilarDomains('techcompany.com', allDomains);

      expect(similar).toContain('techcorp.com');
      expect(similar).toContain('techstart.com');
    });

    it('should not include the same domain', () => {
      const allDomains = ['example.com', 'example.org', 'test.com'];

      const similar = findSimilarDomains('example.com', allDomains);

      expect(similar).not.toContain('example.com');
    });

    it('should return at most 5 similar domains', () => {
      const allDomains = Array.from({ length: 20 }, (_, i) => `company${i}.com`);

      const similar = findSimilarDomains('company.com', allDomains);

      expect(similar.length).toBeLessThanOrEqual(5);
    });
  });

  describe('calculateEmailConfidence', () => {
    it('should calculate confidence for a generated email', async () => {
      const result = await calculateEmailConfidence(
        'john.smith@example.com',
        'John',
        'Smith'
      );

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.breakdown).toHaveProperty('patternMatch');
      expect(result.recommendations).toBeInstanceOf(Array);
    });

    it('should increase confidence for learned patterns', async () => {
      await recordConfirmedPattern('jane.doe@confirmed.com', 'Jane', 'Doe');

      const confirmedResult = await calculateEmailConfidence(
        'john.smith@confirmed.com',
        'John',
        'Smith'
      );

      const unknownResult = await calculateEmailConfidence(
        'john.smith@unknown.com',
        'John',
        'Smith'
      );

      expect(confirmedResult.confidence).toBeGreaterThanOrEqual(unknownResult.confidence);
    });

    it('should reduce confidence for catch-all domains', async () => {
      const normalResult = await calculateEmailConfidence(
        'john.smith@normal.com',
        'John',
        'Smith'
      );

      const catchAllResult = await calculateEmailConfidence(
        'john.smith@catchall.com',
        'John',
        'Smith',
        { isCatchAll: true }
      );

      expect(catchAllResult.confidence).toBeLessThan(normalResult.confidence);
      expect(catchAllResult.breakdown.penalties).toBeLessThan(0);
    });

    it('should add industry alignment bonus', async () => {
      const withIndustry = await calculateEmailConfidence(
        'john.smith@lawfirm.com',
        'John',
        'Smith',
        { industry: 'law' }
      );

      expect(withIndustry.breakdown.industryAlignment).toBeGreaterThan(0);
    });

    it('should add size alignment bonus', async () => {
      const withSize = await calculateEmailConfidence(
        'john.smith@enterprise.com',
        'John',
        'Smith',
        { employeeCount: 1000 }
      );

      expect(withSize.breakdown.sizeAlignment).toBeGreaterThan(0);
    });

    it('should add source reliability bonus', async () => {
      const withSource = await calculateEmailConfidence(
        'john.smith@reliable.com',
        'John',
        'Smith',
        { sourceReliability: 0.9 }
      );

      expect(withSource.breakdown.sourceBonus).toBeGreaterThan(0);
    });
  });

  describe('getPatternStats', () => {
    it('should return empty stats initially', () => {
      const stats = getPatternStats();

      expect(stats.totalDomains).toBe(0);
      expect(stats.topPatterns.length).toBe(0);
    });

    it('should track pattern distribution', async () => {
      await recordConfirmedPattern('john.smith@company1.com', 'John', 'Smith');
      await recordConfirmedPattern('jane.doe@company2.com', 'Jane', 'Doe');
      await recordConfirmedPattern('jsmith@company3.com', 'John', 'Smith');

      const stats = getPatternStats();

      expect(stats.totalDomains).toBe(3);
      expect(stats.patternDistribution['first.last']).toBe(2);
      expect(stats.patternDistribution['flast']).toBe(1);
    });

    it('should return top patterns sorted by count', async () => {
      // Add multiple patterns
      for (let i = 0; i < 5; i++) {
        await recordConfirmedPattern(`john.smith@firstlast${i}.com`, 'John', 'Smith');
      }
      for (let i = 0; i < 3; i++) {
        await recordConfirmedPattern(`jsmith@flast${i}.com`, 'John', 'Smith');
      }

      const stats = getPatternStats();

      expect(stats.topPatterns[0].pattern).toBe('first.last');
      expect(stats.topPatterns[0].count).toBe(5);
      expect(stats.topPatterns[1].pattern).toBe('flast');
      expect(stats.topPatterns[1].count).toBe(3);
    });
  });

  describe('clearPatternCache', () => {
    it('should clear all cached patterns', async () => {
      await recordConfirmedPattern('john.smith@cache.com', 'John', 'Smith');

      const beforeClear = await getLearnedPattern('cache.com');
      expect(beforeClear.pattern).not.toBeNull();

      clearPatternCache();

      const afterClear = await getLearnedPattern('cache.com');
      expect(afterClear.pattern).toBeNull();
    });
  });

  describe('INDUSTRY_PATTERN_PREFERENCES', () => {
    it('should have patterns for common industries', () => {
      const industries = [
        'law', 'accounting', 'consulting', 'finance',
        'technology', 'software', 'startup',
        'healthcare', 'medical', 'dental',
        'construction', 'plumbing', 'electrical',
        'restaurant', 'retail', 'hotel',
      ];

      industries.forEach(industry => {
        expect(INDUSTRY_PATTERN_PREFERENCES[industry]).toBeDefined();
        expect(INDUSTRY_PATTERN_PREFERENCES[industry].length).toBeGreaterThan(0);
      });
    });

    it('should have a default fallback', () => {
      expect(INDUSTRY_PATTERN_PREFERENCES['default']).toBeDefined();
    });
  });

  describe('SIZE_PATTERN_PREFERENCES', () => {
    it('should have patterns for all size categories', () => {
      expect(SIZE_PATTERN_PREFERENCES['enterprise']).toBeDefined();
      expect(SIZE_PATTERN_PREFERENCES['medium']).toBeDefined();
      expect(SIZE_PATTERN_PREFERENCES['small']).toBeDefined();
      expect(SIZE_PATTERN_PREFERENCES['micro']).toBeDefined();
    });
  });
});
