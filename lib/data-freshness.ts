/**
 * Data Freshness Module
 * Tracks and displays how fresh/stale lead data is
 */

// Freshness thresholds in milliseconds
const FRESHNESS_THRESHOLDS = {
  FRESH: 24 * 60 * 60 * 1000, // 24 hours
  RECENT: 7 * 24 * 60 * 60 * 1000, // 7 days
  AGING: 30 * 24 * 60 * 60 * 1000, // 30 days
  // Anything older than 30 days is considered stale
};

export type FreshnessLevel = 'fresh' | 'recent' | 'aging' | 'stale';

export interface FreshnessInfo {
  level: FreshnessLevel;
  label: string;
  description: string;
  ageMs: number;
  ageDays: number;
  color: string;
  bgColor: string;
  borderColor: string;
}

/**
 * Calculate freshness level based on timestamp
 */
export function calculateFreshness(timestamp: string | Date): FreshnessInfo {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const ageMs = now.getTime() - date.getTime();
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

  if (ageMs < FRESHNESS_THRESHOLDS.FRESH) {
    return {
      level: 'fresh',
      label: 'Fresh',
      description: 'Scraped within 24 hours',
      ageMs,
      ageDays,
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
      borderColor: 'border-green-500/30',
    };
  }

  if (ageMs < FRESHNESS_THRESHOLDS.RECENT) {
    return {
      level: 'recent',
      label: 'Recent',
      description: `Scraped ${ageDays} day${ageDays === 1 ? '' : 's'} ago`,
      ageMs,
      ageDays,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
      borderColor: 'border-blue-500/30',
    };
  }

  if (ageMs < FRESHNESS_THRESHOLDS.AGING) {
    return {
      level: 'aging',
      label: 'Aging',
      description: `Scraped ${ageDays} days ago`,
      ageMs,
      ageDays,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/20',
      borderColor: 'border-yellow-500/30',
    };
  }

  return {
    level: 'stale',
    label: 'Stale',
    description: `Scraped ${ageDays} days ago`,
    ageMs,
    ageDays,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    borderColor: 'border-orange-500/30',
  };
}

/**
 * Format relative time for display
 */
export function formatRelativeTime(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;

  return date.toLocaleDateString();
}

/**
 * Calculate freshness distribution for a set of businesses
 */
export function calculateFreshnessDistribution(
  timestamps: (string | Date)[]
): { fresh: number; recent: number; aging: number; stale: number; total: number } {
  const distribution = { fresh: 0, recent: 0, aging: 0, stale: 0, total: timestamps.length };

  for (const timestamp of timestamps) {
    const freshness = calculateFreshness(timestamp);
    distribution[freshness.level]++;
  }

  return distribution;
}

/**
 * Get freshness score (0-1) for weighting in confidence calculations
 * Fresh data gets full weight, stale data gets reduced weight
 */
export function getFreshnessScore(timestamp: string | Date): number {
  const freshness = calculateFreshness(timestamp);

  switch (freshness.level) {
    case 'fresh':
      return 1.0;
    case 'recent':
      return 0.9;
    case 'aging':
      return 0.7;
    case 'stale':
      return 0.5;
    default:
      return 0.5;
  }
}

/**
 * Determine if data should be re-verified based on age
 */
export function shouldReverify(timestamp: string | Date): boolean {
  const freshness = calculateFreshness(timestamp);
  return freshness.level === 'aging' || freshness.level === 'stale';
}

/**
 * Get freshness badge props for UI
 */
export function getFreshnessBadgeProps(timestamp: string | Date): {
  label: string;
  tooltip: string;
  className: string;
} {
  const freshness = calculateFreshness(timestamp);
  const relativeTime = formatRelativeTime(timestamp);

  return {
    label: freshness.label,
    tooltip: `${freshness.description} (${relativeTime})`,
    className: `${freshness.bgColor} ${freshness.color} ${freshness.borderColor}`,
  };
}
