import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateFreshness,
  formatRelativeTime,
  calculateFreshnessDistribution,
  getFreshnessScore,
  shouldReverify,
  getFreshnessBadgeProps,
} from '../data-freshness';

describe('calculateFreshness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns fresh for data less than 24 hours old', () => {
    const timestamp = new Date('2024-01-15T00:00:00Z').toISOString(); // 12 hours ago
    const result = calculateFreshness(timestamp);
    expect(result.level).toBe('fresh');
    expect(result.label).toBe('Fresh');
  });

  it('returns recent for data 1-7 days old', () => {
    const timestamp = new Date('2024-01-12T12:00:00Z').toISOString(); // 3 days ago
    const result = calculateFreshness(timestamp);
    expect(result.level).toBe('recent');
    expect(result.ageDays).toBe(3);
  });

  it('returns aging for data 7-30 days old', () => {
    const timestamp = new Date('2024-01-01T12:00:00Z').toISOString(); // 14 days ago
    const result = calculateFreshness(timestamp);
    expect(result.level).toBe('aging');
    expect(result.ageDays).toBe(14);
  });

  it('returns stale for data over 30 days old', () => {
    const timestamp = new Date('2023-12-01T12:00:00Z').toISOString(); // 45 days ago
    const result = calculateFreshness(timestamp);
    expect(result.level).toBe('stale');
    expect(result.ageDays).toBe(45);
  });

  it('handles Date objects', () => {
    const date = new Date('2024-01-15T00:00:00Z');
    const result = calculateFreshness(date);
    expect(result.level).toBe('fresh');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Just now" for very recent data', () => {
    const timestamp = new Date('2024-01-15T11:59:30Z').toISOString(); // 30 seconds ago
    expect(formatRelativeTime(timestamp)).toBe('Just now');
  });

  it('returns minutes for data less than an hour old', () => {
    const timestamp = new Date('2024-01-15T11:30:00Z').toISOString(); // 30 minutes ago
    expect(formatRelativeTime(timestamp)).toBe('30m ago');
  });

  it('returns hours for data less than a day old', () => {
    const timestamp = new Date('2024-01-15T06:00:00Z').toISOString(); // 6 hours ago
    expect(formatRelativeTime(timestamp)).toBe('6h ago');
  });

  it('returns days for data less than a week old', () => {
    const timestamp = new Date('2024-01-12T12:00:00Z').toISOString(); // 3 days ago
    expect(formatRelativeTime(timestamp)).toBe('3d ago');
  });

  it('returns weeks for data less than a month old', () => {
    const timestamp = new Date('2024-01-01T12:00:00Z').toISOString(); // 2 weeks ago
    expect(formatRelativeTime(timestamp)).toBe('2w ago');
  });
});

describe('calculateFreshnessDistribution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates distribution correctly', () => {
    const timestamps = [
      new Date('2024-01-15T10:00:00Z').toISOString(), // fresh
      new Date('2024-01-13T12:00:00Z').toISOString(), // recent
      new Date('2024-01-05T12:00:00Z').toISOString(), // aging
      new Date('2023-12-01T12:00:00Z').toISOString(), // stale
    ];

    const distribution = calculateFreshnessDistribution(timestamps);

    expect(distribution.fresh).toBe(1);
    expect(distribution.recent).toBe(1);
    expect(distribution.aging).toBe(1);
    expect(distribution.stale).toBe(1);
    expect(distribution.total).toBe(4);
  });

  it('handles empty array', () => {
    const distribution = calculateFreshnessDistribution([]);
    expect(distribution.total).toBe(0);
    expect(distribution.fresh).toBe(0);
  });
});

describe('getFreshnessScore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 1.0 for fresh data', () => {
    const timestamp = new Date('2024-01-15T00:00:00Z').toISOString();
    expect(getFreshnessScore(timestamp)).toBe(1.0);
  });

  it('returns 0.9 for recent data', () => {
    const timestamp = new Date('2024-01-12T12:00:00Z').toISOString();
    expect(getFreshnessScore(timestamp)).toBe(0.9);
  });

  it('returns 0.7 for aging data', () => {
    const timestamp = new Date('2024-01-01T12:00:00Z').toISOString();
    expect(getFreshnessScore(timestamp)).toBe(0.7);
  });

  it('returns 0.5 for stale data', () => {
    const timestamp = new Date('2023-12-01T12:00:00Z').toISOString();
    expect(getFreshnessScore(timestamp)).toBe(0.5);
  });
});

describe('shouldReverify', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false for fresh data', () => {
    const timestamp = new Date('2024-01-15T00:00:00Z').toISOString();
    expect(shouldReverify(timestamp)).toBe(false);
  });

  it('returns false for recent data', () => {
    const timestamp = new Date('2024-01-12T12:00:00Z').toISOString();
    expect(shouldReverify(timestamp)).toBe(false);
  });

  it('returns true for aging data', () => {
    const timestamp = new Date('2024-01-01T12:00:00Z').toISOString();
    expect(shouldReverify(timestamp)).toBe(true);
  });

  it('returns true for stale data', () => {
    const timestamp = new Date('2023-12-01T12:00:00Z').toISOString();
    expect(shouldReverify(timestamp)).toBe(true);
  });
});

describe('getFreshnessBadgeProps', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns correct props for fresh data', () => {
    const timestamp = new Date('2024-01-15T00:00:00Z').toISOString();
    const props = getFreshnessBadgeProps(timestamp);

    expect(props.label).toBe('Fresh');
    expect(props.className).toContain('bg-green');
    expect(props.tooltip).toContain('Scraped within 24 hours');
  });

  it('returns correct props for stale data', () => {
    const timestamp = new Date('2023-12-01T12:00:00Z').toISOString();
    const props = getFreshnessBadgeProps(timestamp);

    expect(props.label).toBe('Stale');
    expect(props.className).toContain('bg-orange');
  });
});
