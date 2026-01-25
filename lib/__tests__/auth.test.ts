/**
 * Tests for Authentication Utilities
 */

import { describe, it, expect } from 'vitest';
import { validatePassword, validateEmail } from '../auth-utils';

describe('validatePassword', () => {
  it('should reject passwords shorter than 8 characters', () => {
    const result = validatePassword('Abc123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('8 characters');
  });

  it('should reject passwords without uppercase', () => {
    const result = validatePassword('abcdefgh1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('uppercase');
  });

  it('should reject passwords without lowercase', () => {
    const result = validatePassword('ABCDEFGH1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('lowercase');
  });

  it('should reject passwords without numbers', () => {
    const result = validatePassword('Abcdefghi');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('number');
  });

  it('should accept valid passwords', () => {
    const result = validatePassword('Password123');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should accept complex passwords', () => {
    const result = validatePassword('MyStr0ng!Pass#2024');
    expect(result.valid).toBe(true);
  });

  it('should accept minimum valid password', () => {
    const result = validatePassword('Abcdefg1');
    expect(result.valid).toBe(true);
  });
});

describe('validateEmail', () => {
  it('should accept valid emails', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user.name@domain.org')).toBe(true);
    expect(validateEmail('user+tag@company.co.uk')).toBe(true);
  });

  it('should reject invalid emails', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('notanemail')).toBe(false);
    expect(validateEmail('missing@domain')).toBe(false);
    expect(validateEmail('@nodomain.com')).toBe(false);
    expect(validateEmail('no spaces@domain.com')).toBe(false);
  });

  it('should reject emails without @', () => {
    expect(validateEmail('testexample.com')).toBe(false);
  });

  it('should reject emails without domain extension', () => {
    expect(validateEmail('test@domain')).toBe(false);
  });
});
