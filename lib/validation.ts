/**
 * Input Validation Module
 * Sanitizes and validates user inputs
 */

import { InvalidQueryError, InvalidLocationError, InvalidCountError } from './errors';

// Patterns for validation
const QUERY_PATTERN = /^[\p{L}\p{N}\s\-'&.,()]+$/u;
const LOCATION_PATTERN = /^[\p{L}\p{N}\s\-'&.,()]+$/u;
const DANGEROUS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+=/i,
  /data:/i,
  /vbscript:/i,
];

/**
 * Sanitize a string by removing dangerous characters
 */
function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .slice(0, 500); // Limit length
}

/**
 * Check for potentially dangerous patterns
 */
function hasDangerousContent(input: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Validate and sanitize search query
 */
export function validateQuery(query: unknown): string {
  if (typeof query !== 'string') {
    throw new InvalidQueryError(String(query));
  }

  const sanitized = sanitizeString(query);

  if (sanitized.length < 2 || sanitized.length > 200) {
    throw new InvalidQueryError(query);
  }

  if (hasDangerousContent(sanitized)) {
    throw new InvalidQueryError(query);
  }

  if (!QUERY_PATTERN.test(sanitized)) {
    throw new InvalidQueryError(query);
  }

  return sanitized;
}

/**
 * Validate and sanitize location
 */
export function validateLocation(location: unknown): string | null {
  if (location === null || location === undefined || location === '') {
    return null;
  }

  if (typeof location !== 'string') {
    throw new InvalidLocationError(String(location));
  }

  const sanitized = sanitizeString(location);

  if (sanitized.length === 0) {
    return null;
  }

  if (sanitized.length < 2 || sanitized.length > 100) {
    throw new InvalidLocationError(location);
  }

  if (hasDangerousContent(sanitized)) {
    throw new InvalidLocationError(location);
  }

  if (!LOCATION_PATTERN.test(sanitized)) {
    throw new InvalidLocationError(location);
  }

  return sanitized;
}

/**
 * Validate count parameter
 */
export function validateCount(count: unknown, min: number = 1, max: number = 500): number {
  let value: number;

  if (typeof count === 'number') {
    value = count;
  } else if (typeof count === 'string') {
    value = parseInt(count, 10);
  } else if (count === null || count === undefined) {
    return 25; // Default value
  } else {
    throw new InvalidCountError(NaN, min, max);
  }

  if (isNaN(value) || !isFinite(value)) {
    throw new InvalidCountError(value, min, max);
  }

  if (value < min || value > max) {
    throw new InvalidCountError(value, min, max);
  }

  return Math.floor(value);
}

/**
 * Validate priority parameter
 */
export function validatePriority(priority: unknown): 'high' | 'normal' | 'low' {
  if (priority === null || priority === undefined || priority === '') {
    return 'normal'; // Default priority
  }

  if (typeof priority !== 'string') {
    return 'normal';
  }

  const validPriorities = ['high', 'normal', 'low'];
  if (validPriorities.includes(priority.toLowerCase())) {
    return priority.toLowerCase() as 'high' | 'normal' | 'low';
  }

  return 'normal';
}

/**
 * Validate industry category
 */
export function validateIndustryCategory(category: unknown): string | null {
  if (category === null || category === undefined || category === '') {
    return null;
  }

  if (typeof category !== 'string') {
    return null;
  }

  const validCategories = [
    'restaurant_food', 'beauty_wellness', 'retail', 'home_services',
    'medical', 'automotive', 'professional_services', 'entertainment',
    'education', 'pet_services'
  ];

  const sanitized = sanitizeString(category);
  return validCategories.includes(sanitized) ? sanitized : null;
}

/**
 * Validate US state code
 */
export function validateTargetState(state: unknown): string | null {
  if (state === null || state === undefined || state === '') {
    return null;
  }

  if (typeof state !== 'string') {
    return null;
  }

  const validStates = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
    'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
    'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
    'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
    'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ];

  const sanitized = sanitizeString(state).toUpperCase();
  return validStates.includes(sanitized) ? sanitized : null;
}

/**
 * Validate company size bounds
 */
export function validateCompanySize(size: unknown): number | null {
  if (size === null || size === undefined) {
    return null;
  }

  let value: number;
  if (typeof size === 'number') {
    value = size;
  } else if (typeof size === 'string') {
    value = parseInt(size, 10);
  } else {
    return null;
  }

  if (isNaN(value) || !isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

/**
 * Validate B2C only flag
 */
export function validateB2cOnly(b2cOnly: unknown): boolean {
  if (b2cOnly === null || b2cOnly === undefined) {
    return true; // Default to B2C only
  }

  return Boolean(b2cOnly);
}

export interface B2BTargetingInput {
  industryCategory: string | null;
  companySizeMin: number | null;
  companySizeMax: number | null;
  targetState: string | null;
  b2cOnly: boolean;
}

/**
 * Validate entire job request body
 */
export function validateJobRequest(body: unknown): {
  query: string;
  location: string | null;
  count: number;
  priority: 'high' | 'normal' | 'low';
  b2bTargeting: B2BTargetingInput;
} {
  if (typeof body !== 'object' || body === null) {
    throw new InvalidQueryError('');
  }

  const {
    query,
    location,
    count,
    priority,
    industryCategory,
    companySizeMin,
    companySizeMax,
    targetState,
    b2cOnly,
  } = body as Record<string, unknown>;

  return {
    query: validateQuery(query),
    location: validateLocation(location),
    count: validateCount(count),
    priority: validatePriority(priority),
    b2bTargeting: {
      industryCategory: validateIndustryCategory(industryCategory),
      companySizeMin: validateCompanySize(companySizeMin),
      companySizeMax: validateCompanySize(companySizeMax),
      targetState: validateTargetState(targetState),
      b2cOnly: validateB2cOnly(b2cOnly),
    },
  };
}

/**
 * Generate a safe job ID
 */
export function generateJobId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `job_${timestamp}_${random}`;
}
