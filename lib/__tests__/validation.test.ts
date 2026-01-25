import { describe, it, expect } from 'vitest';
import {
  validateQuery,
  validateLocation,
  validateCount,
  validatePriority,
  validateJobRequest,
  generateJobId,
} from '../validation';
import { InvalidQueryError, InvalidLocationError, InvalidCountError } from '../errors';

// ============ validateQuery Tests ============

describe('validateQuery', () => {
  it('accepts valid queries', () => {
    expect(validateQuery('dentists')).toBe('dentists');
    expect(validateQuery('pizza restaurants')).toBe('pizza restaurants');
    expect(validateQuery("Joe's Coffee Shop")).toBe("Joe's Coffee Shop");
    expect(validateQuery('Plumbers & Electricians')).toBe('Plumbers & Electricians');
  });

  it('trims whitespace', () => {
    expect(validateQuery('  dentists  ')).toBe('dentists');
  });

  it('removes angle brackets', () => {
    expect(validateQuery('dentists<script>')).toBe('dentistsscript');
  });

  it('throws on empty query', () => {
    expect(() => validateQuery('')).toThrow(InvalidQueryError);
    expect(() => validateQuery('  ')).toThrow(InvalidQueryError);
  });

  it('throws on too short query', () => {
    expect(() => validateQuery('a')).toThrow(InvalidQueryError);
  });

  it('throws on non-string input', () => {
    expect(() => validateQuery(123)).toThrow(InvalidQueryError);
    expect(() => validateQuery(null)).toThrow(InvalidQueryError);
    expect(() => validateQuery(undefined)).toThrow(InvalidQueryError);
    expect(() => validateQuery({})).toThrow(InvalidQueryError);
  });

  it('throws on dangerous content', () => {
    expect(() => validateQuery('test<script>alert(1)</script>')).toThrow(InvalidQueryError);
    expect(() => validateQuery('javascript:void(0)')).toThrow(InvalidQueryError);
    expect(() => validateQuery('onclick=alert(1)')).toThrow(InvalidQueryError);
  });

  it('throws on too long query', () => {
    const longQuery = 'a'.repeat(300);
    // After sanitization to 500 chars, it's still > 200
    expect(() => validateQuery(longQuery)).toThrow(InvalidQueryError);
  });

  it('accepts unicode characters', () => {
    expect(validateQuery('кафе')).toBe('кафе'); // Russian
    expect(validateQuery('咖啡店')).toBe('咖啡店'); // Chinese
    expect(validateQuery('café')).toBe('café'); // French
  });
});

// ============ validateLocation Tests ============

describe('validateLocation', () => {
  it('accepts valid locations', () => {
    expect(validateLocation('Austin, TX')).toBe('Austin, TX');
    expect(validateLocation('New York City')).toBe('New York City');
    expect(validateLocation('78701')).toBe('78701');
    expect(validateLocation("O'Fallon, IL")).toBe("O'Fallon, IL");
  });

  it('returns null for empty/null/undefined', () => {
    expect(validateLocation('')).toBeNull();
    expect(validateLocation(null)).toBeNull();
    expect(validateLocation(undefined)).toBeNull();
  });

  it('trims whitespace and returns null if empty', () => {
    expect(validateLocation('   ')).toBeNull();
  });

  it('throws on too short location', () => {
    expect(() => validateLocation('a')).toThrow(InvalidLocationError);
  });

  it('throws on non-string input (except null/undefined/empty)', () => {
    expect(() => validateLocation(123)).toThrow(InvalidLocationError);
    expect(() => validateLocation({})).toThrow(InvalidLocationError);
  });

  it('throws on dangerous content', () => {
    expect(() => validateLocation('Austin<script>alert(1)</script>')).toThrow(InvalidLocationError);
  });

  it('limits length', () => {
    const longLocation = 'a'.repeat(150);
    expect(() => validateLocation(longLocation)).toThrow(InvalidLocationError);
  });
});

// ============ validateCount Tests ============

describe('validateCount', () => {
  it('accepts valid numbers', () => {
    expect(validateCount(10)).toBe(10);
    expect(validateCount(100)).toBe(100);
    expect(validateCount(500)).toBe(500);
  });

  it('accepts string numbers', () => {
    expect(validateCount('10')).toBe(10);
    expect(validateCount('100')).toBe(100);
  });

  it('returns default for null/undefined', () => {
    expect(validateCount(null)).toBe(25);
    expect(validateCount(undefined)).toBe(25);
  });

  it('floors decimal numbers', () => {
    expect(validateCount(10.5)).toBe(10);
    expect(validateCount(99.9)).toBe(99);
  });

  it('throws on out of range', () => {
    expect(() => validateCount(0)).toThrow(InvalidCountError);
    expect(() => validateCount(-1)).toThrow(InvalidCountError);
    expect(() => validateCount(501)).toThrow(InvalidCountError);
  });

  it('throws on invalid input', () => {
    expect(() => validateCount('abc')).toThrow(InvalidCountError);
    expect(() => validateCount(NaN)).toThrow(InvalidCountError);
    expect(() => validateCount(Infinity)).toThrow(InvalidCountError);
    expect(() => validateCount({})).toThrow(InvalidCountError);
  });

  it('respects custom min/max', () => {
    expect(validateCount(50, 10, 100)).toBe(50);
    expect(() => validateCount(5, 10, 100)).toThrow(InvalidCountError);
    expect(() => validateCount(150, 10, 100)).toThrow(InvalidCountError);
  });
});

// ============ validatePriority Tests ============

describe('validatePriority', () => {
  it('accepts valid priorities', () => {
    expect(validatePriority('high')).toBe('high');
    expect(validatePriority('normal')).toBe('normal');
    expect(validatePriority('low')).toBe('low');
  });

  it('is case insensitive', () => {
    expect(validatePriority('HIGH')).toBe('high');
    expect(validatePriority('Normal')).toBe('normal');
    expect(validatePriority('LOW')).toBe('low');
  });

  it('returns default for null/undefined/empty', () => {
    expect(validatePriority(null)).toBe('normal');
    expect(validatePriority(undefined)).toBe('normal');
    expect(validatePriority('')).toBe('normal');
  });

  it('returns default for invalid values', () => {
    expect(validatePriority('urgent')).toBe('normal');
    expect(validatePriority('medium')).toBe('normal');
    expect(validatePriority(123)).toBe('normal');
  });
});

// ============ validateJobRequest Tests ============

describe('validateJobRequest', () => {
  it('validates complete request', () => {
    const result = validateJobRequest({
      query: 'dentists',
      location: 'Austin, TX',
      count: 50,
      priority: 'high',
    });

    expect(result).toEqual({
      query: 'dentists',
      location: 'Austin, TX',
      count: 50,
      priority: 'high',
      b2bTargeting: {
        industryCategory: null,
        companySizeMin: null,
        companySizeMax: null,
        targetState: null,
        b2cOnly: true,
      },
    });
  });

  it('uses defaults for optional fields', () => {
    const result = validateJobRequest({
      query: 'dentists',
    });

    expect(result).toEqual({
      query: 'dentists',
      location: null,
      count: 25,
      priority: 'normal',
      b2bTargeting: {
        industryCategory: null,
        companySizeMin: null,
        companySizeMax: null,
        targetState: null,
        b2cOnly: true,
      },
    });
  });

  it('throws on invalid query', () => {
    expect(() => validateJobRequest({ query: '' })).toThrow(InvalidQueryError);
  });

  it('throws on non-object body', () => {
    expect(() => validateJobRequest(null)).toThrow(InvalidQueryError);
    expect(() => validateJobRequest('string')).toThrow(InvalidQueryError);
  });
});

// ============ generateJobId Tests ============

describe('generateJobId', () => {
  it('generates unique IDs', () => {
    const id1 = generateJobId();
    const id2 = generateJobId();
    expect(id1).not.toBe(id2);
  });

  it('starts with job_ prefix', () => {
    const id = generateJobId();
    expect(id.startsWith('job_')).toBe(true);
  });

  it('contains timestamp', () => {
    const before = Date.now();
    const id = generateJobId();
    const after = Date.now();

    const parts = id.split('_');
    const timestamp = parseInt(parts[1], 10);

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('has consistent format', () => {
    const id = generateJobId();
    expect(id).toMatch(/^job_\d+_[a-z0-9]+$/);
  });
});
