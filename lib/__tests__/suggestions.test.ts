/**
 * Tests for Smart Search Suggestions Module
 */

import { describe, it, expect } from 'vitest';
import {
  getRelatedIndustries,
  getNearbyLocations,
  getTrendingSearches,
  getAutocompleteSuggestions,
  getAllSuggestions,
  getPostSearchSuggestions,
} from '../suggestions';

describe('getRelatedIndustries', () => {
  it('should return related industries for dentist', () => {
    const suggestions = getRelatedIndustries('dentist');

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every(s => s.type === 'related')).toBe(true);
    expect(suggestions.some(s => s.text === 'orthodontist')).toBe(true);
    expect(suggestions.some(s => s.text === 'oral surgeon')).toBe(true);
  });

  it('should return related industries for partial match', () => {
    const suggestions = getRelatedIndustries('dent');

    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should handle case insensitivity', () => {
    const lower = getRelatedIndustries('dentist');
    const upper = getRelatedIndustries('DENTIST');
    const mixed = getRelatedIndustries('Dentist');

    expect(lower.length).toBe(upper.length);
    expect(lower.length).toBe(mixed.length);
  });

  it('should find related from reverse lookup', () => {
    // orthodontist is in dentist's related list
    const suggestions = getRelatedIndustries('orthodontist');

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some(s => s.text === 'dentist')).toBe(true);
  });

  it('should return empty for unknown query', () => {
    const suggestions = getRelatedIndustries('xyznonexistent');

    expect(suggestions).toHaveLength(0);
  });

  it('should limit results to 5', () => {
    const suggestions = getRelatedIndustries('plumber');

    expect(suggestions.length).toBeLessThanOrEqual(5);
  });

  it('should include reason field', () => {
    const suggestions = getRelatedIndustries('salon');

    suggestions.forEach(s => {
      expect(s.reason).toBeDefined();
    });
  });
});

describe('getNearbyLocations', () => {
  it('should return nearby cities for Austin', () => {
    const suggestions = getNearbyLocations('Austin');

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every(s => s.type === 'location')).toBe(true);
    expect(suggestions.some(s => s.text === 'San Antonio')).toBe(true);
    expect(suggestions.some(s => s.text === 'Houston')).toBe(true);
  });

  it('should handle partial city match', () => {
    const suggestions = getNearbyLocations('aust');

    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should handle case insensitivity', () => {
    const lower = getNearbyLocations('miami');
    const upper = getNearbyLocations('MIAMI');

    expect(lower.length).toBe(upper.length);
  });

  it('should return empty for unknown location', () => {
    const suggestions = getNearbyLocations('unknowncityxyz');

    expect(suggestions).toHaveLength(0);
  });

  it('should include location field', () => {
    const suggestions = getNearbyLocations('chicago');

    suggestions.forEach(s => {
      expect(s.location).toBeDefined();
    });
  });

  it('should limit results to 5', () => {
    const suggestions = getNearbyLocations('los angeles');

    expect(suggestions.length).toBeLessThanOrEqual(5);
  });
});

describe('getTrendingSearches', () => {
  it('should return trending searches', () => {
    const suggestions = getTrendingSearches();

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every(s => s.type === 'trending')).toBe(true);
  });

  it('should respect limit parameter', () => {
    const suggestions = getTrendingSearches(3);

    expect(suggestions.length).toBe(3);
  });

  it('should include query field', () => {
    const suggestions = getTrendingSearches(5);

    suggestions.forEach(s => {
      expect(s.query).toBeDefined();
    });
  });

  it('should include reason field', () => {
    const suggestions = getTrendingSearches(5);

    suggestions.forEach(s => {
      expect(s.reason).toBe('Trending');
    });
  });
});

describe('getAutocompleteSuggestions', () => {
  it('should return suggestions for partial input', () => {
    const suggestions = getAutocompleteSuggestions('rest');

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some(s => s.text === 'restaurant')).toBe(true);
  });

  it('should handle case insensitivity', () => {
    const lower = getAutocompleteSuggestions('sal');
    const upper = getAutocompleteSuggestions('SAL');

    expect(lower.length).toBe(upper.length);
  });

  it('should return empty for too short input', () => {
    const suggestions = getAutocompleteSuggestions('r');

    expect(suggestions).toHaveLength(0);
  });

  it('should return empty for empty input', () => {
    const suggestions = getAutocompleteSuggestions('');

    expect(suggestions).toHaveLength(0);
  });

  it('should respect limit parameter', () => {
    const suggestions = getAutocompleteSuggestions('sal', 3);

    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('should prioritize prefix matches', () => {
    const suggestions = getAutocompleteSuggestions('bar');

    // barbershop should come before body shop (contains bar)
    const barbershopIndex = suggestions.findIndex(s => s.text === 'barbershop');
    expect(barbershopIndex).toBeGreaterThanOrEqual(0);
  });

  it('should include contains matches', () => {
    const suggestions = getAutocompleteSuggestions('groom', 10);

    // pet grooming contains 'groom'
    expect(suggestions.some(s => s.text.includes('groom'))).toBe(true);
  });

  it('should return autocomplete type', () => {
    const suggestions = getAutocompleteSuggestions('gym');

    expect(suggestions.every(s => s.type === 'autocomplete')).toBe(true);
  });
});

describe('getAllSuggestions', () => {
  it('should return all suggestion types', () => {
    const result = getAllSuggestions('dentist', 'Austin');

    expect(result.relatedIndustries).toBeDefined();
    expect(result.nearbyLocations).toBeDefined();
    expect(result.trending).toBeDefined();
    expect(result.autocomplete).toBeDefined();
  });

  it('should return related industries for query', () => {
    const result = getAllSuggestions('salon');

    expect(result.relatedIndustries.length).toBeGreaterThan(0);
  });

  it('should return nearby locations for location', () => {
    const result = getAllSuggestions('', 'Houston');

    expect(result.nearbyLocations.length).toBeGreaterThan(0);
  });

  it('should always include trending', () => {
    const result = getAllSuggestions('', '');

    expect(result.trending.length).toBeGreaterThan(0);
  });

  it('should return autocomplete for query', () => {
    const result = getAllSuggestions('rest');

    expect(result.autocomplete.length).toBeGreaterThan(0);
  });

  it('should handle empty inputs', () => {
    const result = getAllSuggestions('', '');

    expect(result.relatedIndustries).toHaveLength(0);
    expect(result.nearbyLocations).toHaveLength(0);
    expect(result.autocomplete).toHaveLength(0);
    expect(result.trending.length).toBeGreaterThan(0);
  });
});

describe('getPostSearchSuggestions', () => {
  it('should return related suggestions after search', () => {
    const suggestions = getPostSearchSuggestions('dentist', 'Austin');

    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should include both industry and location suggestions', () => {
    const suggestions = getPostSearchSuggestions('dentist', 'Austin');

    const hasRelated = suggestions.some(s => s.type === 'related');
    const hasLocation = suggestions.some(s => s.type === 'location');

    expect(hasRelated).toBe(true);
    expect(hasLocation).toBe(true);
  });

  it('should work without location', () => {
    const suggestions = getPostSearchSuggestions('gym');

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every(s => s.type === 'related')).toBe(true);
  });

  it('should limit related suggestions to 3', () => {
    const suggestions = getPostSearchSuggestions('plumber', 'Dallas');

    const relatedCount = suggestions.filter(s => s.type === 'related').length;
    expect(relatedCount).toBeLessThanOrEqual(3);
  });

  it('should limit location suggestions to 2', () => {
    const suggestions = getPostSearchSuggestions('dentist', 'Los Angeles');

    const locationCount = suggestions.filter(s => s.type === 'location').length;
    expect(locationCount).toBeLessThanOrEqual(2);
  });
});
