/**
 * Machine Learning Confidence Scoring Module
 *
 * Provides intelligent confidence scoring using:
 * - Historical feedback data
 * - Email pattern recognition
 * - Domain reputation
 * - Business verification status
 * - Cross-reference signals
 */

import {
  getVerifiedBusiness,
  getDomainPattern,
  getEmailBounceRate,
  isEmailBounced,
  learnEmailPattern,
} from './feedback-aggregator';

// ============ Types ============

export interface ScoringFactors {
  // Base signals (0-1)
  emailPatternMatch: number;
  domainReputation: number;
  sourceReliability: number;
  crossReferenceCount: number;

  // Verification signals (0-1)
  mxRecordValid: boolean;
  smtpVerified: boolean;
  userVerified: boolean;

  // Negative signals
  bounceHistory: boolean;
  disposableEmail: boolean;
  recentNegativeFeedback: boolean;

  // Business signals
  yearsInBusiness: number | null;
  reviewCount: number | null;
  rating: number | null;
}

export interface ConfidenceScore {
  overall: number; // 0-100
  breakdown: {
    base: number;
    pattern: number;
    reputation: number;
    verification: number;
    business: number;
    penalties: number;
  };
  confidence_level: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
  factors: ScoringFactors;
  recommendations: string[];
}

export interface EmailScoreInput {
  email: string;
  businessId?: number;
  businessName?: string;
  website?: string;
  phone?: string;
  address?: string;
  source: string;
  crossReferenceCount?: number;
  yearsInBusiness?: number;
  reviewCount?: number;
  rating?: number;
  mxValid?: boolean;
  smtpVerified?: boolean;
}

// ============ Scoring Weights ============

const WEIGHTS = {
  // Base components
  base: 20,
  pattern: 15,
  reputation: 20,
  verification: 25,
  business: 10,
  penalties: 10,

  // Sub-factors
  factors: {
    emailPatternMatch: 0.8,
    domainReputation: 0.9,
    sourceReliability: 0.7,
    crossReference: 0.6,
    mxRecord: 0.5,
    smtpVerified: 1.0,
    userVerified: 1.2,
    yearsInBusiness: 0.3,
    reviewCount: 0.2,
    rating: 0.4,
    bounceHistory: -1.0,
    disposableEmail: -0.8,
    negativeFeedback: -0.5,
  },
};

// ============ Source Reliability Scores ============

const SOURCE_RELIABILITY: Record<string, number> = {
  // APIs (most reliable)
  google_places_api: 0.95,
  yelp_fusion_api: 0.90,
  foursquare_api: 0.85,
  here_api: 0.80,
  tomtom_api: 0.75,

  // Verified sources
  bbb: 0.90,
  healthgrades: 0.85,
  zocdoc: 0.85,

  // Scraped sources
  google_maps: 0.75,
  yelp: 0.70,
  yellow_pages: 0.65,
  tripadvisor: 0.70,
  angi: 0.70,
  homeadvisor: 0.70,
  thumbtack: 0.65,
  manta: 0.60,
  instagram: 0.55,

  // Email discovery
  hunter: 0.80,
  whoisxml: 0.75,
  website_scrape: 0.60,
  pattern_guess: 0.40,
};

// ============ Main Scoring Function ============

export async function calculateConfidenceScore(
  input: EmailScoreInput
): Promise<ConfidenceScore> {
  const factors = await gatherScoringFactors(input);
  const breakdown = calculateBreakdown(factors);

  // Calculate overall score
  const overall = Math.max(0, Math.min(100,
    breakdown.base +
    breakdown.pattern +
    breakdown.reputation +
    breakdown.verification +
    breakdown.business +
    breakdown.penalties
  ));

  // Determine confidence level
  const confidence_level = getConfidenceLevel(overall);

  // Generate recommendations
  const recommendations = generateRecommendations(factors, overall);

  return {
    overall: Math.round(overall),
    breakdown,
    confidence_level,
    factors,
    recommendations,
  };
}

// ============ Factor Gathering ============

async function gatherScoringFactors(input: EmailScoreInput): Promise<ScoringFactors> {
  const domain = input.email?.split('@')[1]?.toLowerCase();

  // Get domain pattern if available
  const domainPattern = domain ? await getDomainPattern(domain) : null;

  // Check if email matches known pattern
  const emailPatternMatch = domainPattern
    ? matchesPattern(input.email, domainPattern.email_pattern)
      ? domainPattern.pattern_confidence
      : 0.3
    : 0.5;

  // Get domain reputation (based on bounce rate)
  const bounceRate = domain ? await getEmailBounceRate(domain) : 0;
  const domainReputation = Math.max(0, 1 - (bounceRate * 2));

  // Get source reliability
  const sourceReliability = SOURCE_RELIABILITY[input.source] || 0.5;

  // Check bounce history for this specific email
  const bounceHistory = input.email ? await isEmailBounced(input.email) : false;

  // Check for disposable email
  const disposableEmail = isDisposableDomain(domain || '');

  // Get verified business status
  let userVerified = false;
  let recentNegativeFeedback = false;

  if (input.businessId) {
    const verified = await getVerifiedBusiness(input.businessId);
    if (verified) {
      userVerified = verified.email_verified;
      recentNegativeFeedback = verified.negative_reports > verified.positive_reports;
    }
  }

  return {
    emailPatternMatch,
    domainReputation,
    sourceReliability,
    crossReferenceCount: input.crossReferenceCount || 1,
    mxRecordValid: input.mxValid ?? true,
    smtpVerified: input.smtpVerified ?? false,
    userVerified,
    bounceHistory,
    disposableEmail,
    recentNegativeFeedback,
    yearsInBusiness: input.yearsInBusiness ?? null,
    reviewCount: input.reviewCount ?? null,
    rating: input.rating ?? null,
  };
}

function matchesPattern(email: string, pattern: string): boolean {
  const localPart = email.split('@')[0].toLowerCase();

  switch (pattern) {
    case 'info':
    case 'contact':
    case 'hello':
    case 'office':
    case 'mail':
    case 'support':
      return localPart === pattern;

    case '{first}.{last}':
      return /^[a-z]+\.[a-z]+$/.test(localPart);

    case '{first}{last}':
      return /^[a-z]{4,}$/.test(localPart) && !localPart.includes('.');

    case '{first}_{last}':
      return /^[a-z]+_[a-z]+$/.test(localPart);

    case '{f}{last}':
      return /^[a-z][a-z]{2,}$/.test(localPart);

    default:
      return true; // Custom patterns always match
  }
}

// ============ Score Calculation ============

function calculateBreakdown(factors: ScoringFactors): ConfidenceScore['breakdown'] {
  // Base score (everyone starts here)
  const base = WEIGHTS.base;

  // Pattern score
  const pattern = WEIGHTS.pattern * factors.emailPatternMatch;

  // Reputation score
  const reputation = WEIGHTS.reputation * (
    factors.domainReputation * 0.5 +
    factors.sourceReliability * 0.5
  );

  // Verification score
  let verification = 0;
  if (factors.smtpVerified) verification += WEIGHTS.verification * 0.6;
  if (factors.mxRecordValid) verification += WEIGHTS.verification * 0.2;
  if (factors.userVerified) verification += WEIGHTS.verification * 0.3;

  // Cross-reference bonus
  verification += Math.min(
    WEIGHTS.verification * 0.2,
    (factors.crossReferenceCount - 1) * 3
  );

  // Business score
  let business = 0;
  if (factors.yearsInBusiness !== null) {
    business += Math.min(WEIGHTS.business * 0.4, factors.yearsInBusiness * 0.5);
  }
  if (factors.reviewCount !== null) {
    business += Math.min(WEIGHTS.business * 0.3, Math.log10(factors.reviewCount + 1) * 2);
  }
  if (factors.rating !== null && factors.rating >= 4.0) {
    business += WEIGHTS.business * 0.3;
  }

  // Penalties
  let penalties = 0;
  if (factors.bounceHistory) penalties -= 25;
  if (factors.disposableEmail) penalties -= 20;
  if (factors.recentNegativeFeedback) penalties -= 15;

  return {
    base: Math.round(base),
    pattern: Math.round(pattern),
    reputation: Math.round(reputation),
    verification: Math.round(verification),
    business: Math.round(business),
    penalties: Math.round(penalties),
  };
}

function getConfidenceLevel(score: number): ConfidenceScore['confidence_level'] {
  if (score >= 85) return 'very_high';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  if (score >= 30) return 'low';
  return 'very_low';
}

// ============ Recommendations ============

function generateRecommendations(
  factors: ScoringFactors,
  score: number
): string[] {
  const recommendations: string[] = [];

  if (score >= 85) {
    recommendations.push('Email is highly likely to be valid and deliverable');
  } else if (score >= 70) {
    recommendations.push('Good confidence - suitable for outreach');
  }

  if (!factors.smtpVerified && score < 80) {
    recommendations.push('Consider verifying via SMTP for higher confidence');
  }

  if (factors.bounceHistory) {
    recommendations.push('Warning: This email has bounced previously');
  }

  if (factors.disposableEmail) {
    recommendations.push('Warning: Disposable email domain detected');
  }

  if (factors.recentNegativeFeedback) {
    recommendations.push('Note: Recent negative feedback on this business');
  }

  if (factors.crossReferenceCount > 2) {
    recommendations.push(`Verified by ${factors.crossReferenceCount} independent sources`);
  }

  if (factors.userVerified) {
    recommendations.push('Email confirmed by user feedback');
  }

  if (score < 50) {
    recommendations.push('Low confidence - verify before sending important emails');
  }

  return recommendations;
}

// ============ Helper Functions ============

const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'temp-mail.org', 'guerrillamail.com', 'mailinator.com',
  'maildrop.cc', 'throwaway.email', 'yopmail.com', 'sharklasers.com',
  '10minutemail.com', 'fakeinbox.com', 'tempinbox.com', 'trashmail.com',
  'getnada.com', 'mohmal.com', 'emailfake.com', 'burnermail.io',
]);

function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

// ============ Batch Scoring ============

export async function batchCalculateScores(
  inputs: EmailScoreInput[]
): Promise<Map<string, ConfidenceScore>> {
  const results = new Map<string, ConfidenceScore>();

  // Process in parallel batches
  const batchSize = 10;
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    const scores = await Promise.all(
      batch.map(input => calculateConfidenceScore(input))
    );

    batch.forEach((input, index) => {
      results.set(input.email, scores[index]);
    });
  }

  return results;
}

// ============ Learning Integration ============

export async function recordConfirmedEmail(
  email: string,
  businessId: number,
  isValid: boolean
): Promise<void> {
  const domain = email.split('@')[1]?.toLowerCase();

  if (isValid && domain) {
    // Learn the email pattern for this domain
    await learnEmailPattern(domain, email);
  }

  // The feedback recording is handled by the feedback-aggregator module
}

// ============ Score Explanation ============

export function explainScore(score: ConfidenceScore): string {
  const parts: string[] = [];

  parts.push(`Overall Confidence: ${score.overall}/100 (${score.confidence_level.replace('_', ' ')})`);
  parts.push('');
  parts.push('Score Breakdown:');
  parts.push(`  Base Score: +${score.breakdown.base}`);
  parts.push(`  Pattern Match: +${score.breakdown.pattern}`);
  parts.push(`  Reputation: +${score.breakdown.reputation}`);
  parts.push(`  Verification: +${score.breakdown.verification}`);
  parts.push(`  Business Signals: +${score.breakdown.business}`);
  if (score.breakdown.penalties !== 0) {
    parts.push(`  Penalties: ${score.breakdown.penalties}`);
  }

  if (score.recommendations.length > 0) {
    parts.push('');
    parts.push('Recommendations:');
    score.recommendations.forEach(rec => {
      parts.push(`  - ${rec}`);
    });
  }

  return parts.join('\n');
}

// ============ Model Training Simulation ============

/**
 * Simulate A/B test results for email patterns
 * In production, this would be based on actual delivery/response data
 */
export interface PatternTestResult {
  pattern: string;
  testCount: number;
  deliveryRate: number;
  responseRate: number;
  bounceRate: number;
  winner: boolean;
}

export function analyzePatternPerformance(
  domain: string,
  testResults: { pattern: string; delivered: boolean; responded: boolean }[]
): PatternTestResult[] {
  const patternStats = new Map<string, {
    total: number;
    delivered: number;
    responded: number;
    bounced: number;
  }>();

  // Aggregate results by pattern
  for (const result of testResults) {
    const stats = patternStats.get(result.pattern) || {
      total: 0, delivered: 0, responded: 0, bounced: 0
    };
    stats.total++;
    if (result.delivered) stats.delivered++;
    if (result.responded) stats.responded++;
    if (!result.delivered) stats.bounced++;
    patternStats.set(result.pattern, stats);
  }

  // Calculate metrics
  const results: PatternTestResult[] = [];
  let bestDeliveryRate = 0;
  let bestPattern = '';

  for (const [pattern, stats] of patternStats) {
    const deliveryRate = stats.total > 0 ? stats.delivered / stats.total : 0;
    const responseRate = stats.delivered > 0 ? stats.responded / stats.delivered : 0;
    const bounceRate = stats.total > 0 ? stats.bounced / stats.total : 0;

    if (deliveryRate > bestDeliveryRate) {
      bestDeliveryRate = deliveryRate;
      bestPattern = pattern;
    }

    results.push({
      pattern,
      testCount: stats.total,
      deliveryRate,
      responseRate,
      bounceRate,
      winner: false,
    });
  }

  // Mark winner
  const winner = results.find(r => r.pattern === bestPattern);
  if (winner) winner.winner = true;

  return results;
}
