/**
 * Tests for Email Templates Library
 */

import { describe, it, expect } from 'vitest';
import {
  EMAIL_TEMPLATES,
  getTemplatesForIndustry,
  getAvailableIndustries,
  personalizeTemplate,
  detectIndustryFromQuery,
  PERSONALIZATION_TOKENS,
} from '../templates';

describe('EMAIL_TEMPLATES', () => {
  it('should have templates defined', () => {
    expect(EMAIL_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('should have required fields on all templates', () => {
    EMAIL_TEMPLATES.forEach(template => {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.industry).toBeTruthy();
      expect(template.subject).toBeTruthy();
      expect(template.body).toBeTruthy();
      expect(template.tips).toBeInstanceOf(Array);
      expect(template.tips.length).toBeGreaterThan(0);
      expect(template.bestFor).toBeTruthy();
    });
  });

  it('should have unique IDs', () => {
    const ids = EMAIL_TEMPLATES.map(t => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('getTemplatesForIndustry', () => {
  it('should return templates for restaurant industry', () => {
    const templates = getTemplatesForIndustry('restaurant');
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some(t => t.industry === 'restaurant_food')).toBe(true);
  });

  it('should always include general templates', () => {
    const templates = getTemplatesForIndustry('restaurant');
    expect(templates.some(t => t.industry === 'general')).toBe(true);
  });

  it('should return general templates for unknown industry', () => {
    const templates = getTemplatesForIndustry('unknownindustry');
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every(t => t.industry === 'general')).toBe(true);
  });

  it('should handle different industry keywords', () => {
    expect(getTemplatesForIndustry('salon').some(t => t.industry === 'beauty_wellness')).toBe(true);
    expect(getTemplatesForIndustry('dentist').some(t => t.industry === 'medical')).toBe(true);
    expect(getTemplatesForIndustry('plumber').some(t => t.industry === 'home_services')).toBe(true);
    expect(getTemplatesForIndustry('lawyer').some(t => t.industry === 'professional_services')).toBe(true);
  });
});

describe('getAvailableIndustries', () => {
  it('should return industry options', () => {
    const industries = getAvailableIndustries();
    expect(industries.length).toBeGreaterThan(0);
  });

  it('should have value and label for each industry', () => {
    const industries = getAvailableIndustries();
    industries.forEach(ind => {
      expect(ind.value).toBeTruthy();
      expect(ind.label).toBeTruthy();
    });
  });

  it('should include common industries', () => {
    const industries = getAvailableIndustries();
    const values = industries.map(i => i.value);
    expect(values).toContain('restaurant_food');
    expect(values).toContain('beauty_wellness');
    expect(values).toContain('general');
  });
});

describe('personalizeTemplate', () => {
  it('should replace single token', () => {
    const result = personalizeTemplate('Hello {business_name}!', {
      '{business_name}': 'Acme Corp',
    });
    expect(result).toBe('Hello Acme Corp!');
  });

  it('should replace multiple tokens', () => {
    const result = personalizeTemplate(
      'Hello {first_name} from {business_name}!',
      {
        '{first_name}': 'John',
        '{business_name}': 'Acme Corp',
      }
    );
    expect(result).toBe('Hello John from Acme Corp!');
  });

  it('should replace multiple occurrences of same token', () => {
    const result = personalizeTemplate(
      '{business_name} is great. I love {business_name}!',
      { '{business_name}': 'Acme' }
    );
    expect(result).toBe('Acme is great. I love Acme!');
  });

  it('should keep unmatched tokens as is', () => {
    const result = personalizeTemplate('Hello {unknown_token}!', {
      '{business_name}': 'Acme',
    });
    expect(result).toBe('Hello {unknown_token}!');
  });

  it('should handle empty values', () => {
    const result = personalizeTemplate('Hello {first_name}!', {
      '{first_name}': '',
    });
    expect(result).toBe('Hello {first_name}!');
  });
});

describe('detectIndustryFromQuery', () => {
  it('should detect restaurant industry', () => {
    expect(detectIndustryFromQuery('restaurant')).toBe('restaurant_food');
    expect(detectIndustryFromQuery('Italian restaurant')).toBe('restaurant_food');
    expect(detectIndustryFromQuery('cafe')).toBe('restaurant_food');
  });

  it('should detect beauty wellness industry', () => {
    expect(detectIndustryFromQuery('hair salon')).toBe('beauty_wellness');
    expect(detectIndustryFromQuery('spa')).toBe('beauty_wellness');
    expect(detectIndustryFromQuery('gym')).toBe('beauty_wellness');
  });

  it('should detect medical industry', () => {
    expect(detectIndustryFromQuery('dentist')).toBe('medical');
    expect(detectIndustryFromQuery('family doctor')).toBe('medical');
  });

  it('should detect home services industry', () => {
    expect(detectIndustryFromQuery('plumber')).toBe('home_services');
    expect(detectIndustryFromQuery('electrician')).toBe('home_services');
  });

  it('should return general for unknown queries', () => {
    expect(detectIndustryFromQuery('xyz unknown business')).toBe('general');
  });

  it('should be case insensitive', () => {
    expect(detectIndustryFromQuery('RESTAURANT')).toBe('restaurant_food');
    expect(detectIndustryFromQuery('Dentist')).toBe('medical');
  });
});

describe('PERSONALIZATION_TOKENS', () => {
  it('should have common tokens defined', () => {
    expect(PERSONALIZATION_TOKENS['{business_name}']).toBeDefined();
    expect(PERSONALIZATION_TOKENS['{first_name}']).toBeDefined();
    expect(PERSONALIZATION_TOKENS['{city}']).toBeDefined();
    expect(PERSONALIZATION_TOKENS['{your_name}']).toBeDefined();
  });

  it('should have descriptions for all tokens', () => {
    Object.values(PERSONALIZATION_TOKENS).forEach(desc => {
      expect(desc).toBeTruthy();
      expect(typeof desc).toBe('string');
    });
  });
});
