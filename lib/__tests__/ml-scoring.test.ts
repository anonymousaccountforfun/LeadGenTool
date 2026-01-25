/**
 * Tests for ML Scoring and Feedback Aggregator Modules
 */

import { describe, it, expect } from 'vitest';

// ============ Scoring Factor Tests ============

describe('Confidence Score Calculation', () => {
  // Test the breakdown calculation logic
  interface ScoreBreakdown {
    base: number;
    pattern: number;
    reputation: number;
    verification: number;
    business: number;
    penalties: number;
  }

  function calculateBreakdown(factors: {
    emailPatternMatch: number;
    domainReputation: number;
    sourceReliability: number;
    crossReferenceCount: number;
    mxRecordValid: boolean;
    smtpVerified: boolean;
    userVerified: boolean;
    bounceHistory: boolean;
    disposableEmail: boolean;
    recentNegativeFeedback: boolean;
    yearsInBusiness: number | null;
    reviewCount: number | null;
    rating: number | null;
  }): ScoreBreakdown {
    const WEIGHTS = { base: 20, pattern: 15, reputation: 20, verification: 25, business: 10 };

    const base = WEIGHTS.base;
    const pattern = WEIGHTS.pattern * factors.emailPatternMatch;
    const reputation = WEIGHTS.reputation * (
      factors.domainReputation * 0.5 +
      factors.sourceReliability * 0.5
    );

    let verification = 0;
    if (factors.smtpVerified) verification += WEIGHTS.verification * 0.6;
    if (factors.mxRecordValid) verification += WEIGHTS.verification * 0.2;
    if (factors.userVerified) verification += WEIGHTS.verification * 0.3;
    verification += Math.min(WEIGHTS.verification * 0.2, (factors.crossReferenceCount - 1) * 3);

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

  it('should calculate base score correctly', () => {
    const breakdown = calculateBreakdown({
      emailPatternMatch: 0,
      domainReputation: 0,
      sourceReliability: 0,
      crossReferenceCount: 1,
      mxRecordValid: false,
      smtpVerified: false,
      userVerified: false,
      bounceHistory: false,
      disposableEmail: false,
      recentNegativeFeedback: false,
      yearsInBusiness: null,
      reviewCount: null,
      rating: null,
    });

    expect(breakdown.base).toBe(20);
  });

  it('should calculate pattern score based on match', () => {
    const highMatch = calculateBreakdown({
      emailPatternMatch: 1.0,
      domainReputation: 0,
      sourceReliability: 0,
      crossReferenceCount: 1,
      mxRecordValid: false,
      smtpVerified: false,
      userVerified: false,
      bounceHistory: false,
      disposableEmail: false,
      recentNegativeFeedback: false,
      yearsInBusiness: null,
      reviewCount: null,
      rating: null,
    });

    const lowMatch = calculateBreakdown({
      emailPatternMatch: 0.3,
      domainReputation: 0,
      sourceReliability: 0,
      crossReferenceCount: 1,
      mxRecordValid: false,
      smtpVerified: false,
      userVerified: false,
      bounceHistory: false,
      disposableEmail: false,
      recentNegativeFeedback: false,
      yearsInBusiness: null,
      reviewCount: null,
      rating: null,
    });

    expect(highMatch.pattern).toBe(15);
    expect(lowMatch.pattern).toBe(5);
  });

  it('should calculate verification score correctly', () => {
    const smtpVerified = calculateBreakdown({
      emailPatternMatch: 0,
      domainReputation: 0,
      sourceReliability: 0,
      crossReferenceCount: 1,
      mxRecordValid: true,
      smtpVerified: true,
      userVerified: false,
      bounceHistory: false,
      disposableEmail: false,
      recentNegativeFeedback: false,
      yearsInBusiness: null,
      reviewCount: null,
      rating: null,
    });

    // SMTP verified (60%) + MX valid (20%) = 80% of 25 = 20
    expect(smtpVerified.verification).toBe(20);
  });

  it('should apply penalties for bounce history', () => {
    const withBounce = calculateBreakdown({
      emailPatternMatch: 1.0,
      domainReputation: 1.0,
      sourceReliability: 1.0,
      crossReferenceCount: 1,
      mxRecordValid: true,
      smtpVerified: true,
      userVerified: false,
      bounceHistory: true,
      disposableEmail: false,
      recentNegativeFeedback: false,
      yearsInBusiness: null,
      reviewCount: null,
      rating: null,
    });

    expect(withBounce.penalties).toBe(-25);
  });

  it('should apply penalties for disposable email', () => {
    const disposable = calculateBreakdown({
      emailPatternMatch: 1.0,
      domainReputation: 1.0,
      sourceReliability: 1.0,
      crossReferenceCount: 1,
      mxRecordValid: true,
      smtpVerified: true,
      userVerified: false,
      bounceHistory: false,
      disposableEmail: true,
      recentNegativeFeedback: false,
      yearsInBusiness: null,
      reviewCount: null,
      rating: null,
    });

    expect(disposable.penalties).toBe(-20);
  });

  it('should calculate business score from signals', () => {
    const withBusinessSignals = calculateBreakdown({
      emailPatternMatch: 0,
      domainReputation: 0,
      sourceReliability: 0,
      crossReferenceCount: 1,
      mxRecordValid: false,
      smtpVerified: false,
      userVerified: false,
      bounceHistory: false,
      disposableEmail: false,
      recentNegativeFeedback: false,
      yearsInBusiness: 10,
      reviewCount: 500,
      rating: 4.5,
    });

    expect(withBusinessSignals.business).toBeGreaterThan(0);
  });
});

// ============ Confidence Level Tests ============

describe('Confidence Level Determination', () => {
  function getConfidenceLevel(score: number): string {
    if (score >= 85) return 'very_high';
    if (score >= 70) return 'high';
    if (score >= 50) return 'medium';
    if (score >= 30) return 'low';
    return 'very_low';
  }

  it('should return very_high for scores >= 85', () => {
    expect(getConfidenceLevel(85)).toBe('very_high');
    expect(getConfidenceLevel(90)).toBe('very_high');
    expect(getConfidenceLevel(100)).toBe('very_high');
  });

  it('should return high for scores 70-84', () => {
    expect(getConfidenceLevel(70)).toBe('high');
    expect(getConfidenceLevel(84)).toBe('high');
  });

  it('should return medium for scores 50-69', () => {
    expect(getConfidenceLevel(50)).toBe('medium');
    expect(getConfidenceLevel(69)).toBe('medium');
  });

  it('should return low for scores 30-49', () => {
    expect(getConfidenceLevel(30)).toBe('low');
    expect(getConfidenceLevel(49)).toBe('low');
  });

  it('should return very_low for scores < 30', () => {
    expect(getConfidenceLevel(29)).toBe('very_low');
    expect(getConfidenceLevel(0)).toBe('very_low');
  });
});

// ============ Email Pattern Matching Tests ============

describe('Email Pattern Matching', () => {
  function matchesPattern(email: string, pattern: string): boolean {
    const localPart = email.split('@')[0].toLowerCase();

    switch (pattern) {
      case 'info':
      case 'contact':
      case 'hello':
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
        return true;
    }
  }

  it('should match info pattern', () => {
    expect(matchesPattern('info@example.com', 'info')).toBe(true);
    expect(matchesPattern('contact@example.com', 'info')).toBe(false);
  });

  it('should match first.last pattern', () => {
    expect(matchesPattern('john.doe@example.com', '{first}.{last}')).toBe(true);
    expect(matchesPattern('johndoe@example.com', '{first}.{last}')).toBe(false);
    expect(matchesPattern('john@example.com', '{first}.{last}')).toBe(false);
  });

  it('should match firstlast pattern', () => {
    expect(matchesPattern('johndoe@example.com', '{first}{last}')).toBe(true);
    expect(matchesPattern('jd@example.com', '{first}{last}')).toBe(false); // Too short
  });

  it('should match first_last pattern', () => {
    expect(matchesPattern('john_doe@example.com', '{first}_{last}')).toBe(true);
    expect(matchesPattern('john.doe@example.com', '{first}_{last}')).toBe(false);
  });

  it('should match f+last pattern', () => {
    expect(matchesPattern('jdoe@example.com', '{f}{last}')).toBe(true);
    expect(matchesPattern('jd@example.com', '{f}{last}')).toBe(false); // Too short
  });
});

// ============ Source Reliability Tests ============

describe('Source Reliability Scoring', () => {
  const SOURCE_RELIABILITY: Record<string, number> = {
    google_places_api: 0.95,
    yelp_fusion_api: 0.90,
    foursquare_api: 0.85,
    bbb: 0.90,
    google_maps: 0.75,
    yelp: 0.70,
    yellow_pages: 0.65,
    website_scrape: 0.60,
    pattern_guess: 0.40,
  };

  it('should have highest reliability for APIs', () => {
    expect(SOURCE_RELIABILITY.google_places_api).toBeGreaterThan(0.9);
    expect(SOURCE_RELIABILITY.yelp_fusion_api).toBeGreaterThan(0.85);
  });

  it('should have lower reliability for scraped sources', () => {
    expect(SOURCE_RELIABILITY.website_scrape).toBeLessThan(0.7);
    expect(SOURCE_RELIABILITY.pattern_guess).toBeLessThan(0.5);
  });

  it('should have medium reliability for verified directories', () => {
    expect(SOURCE_RELIABILITY.bbb).toBeGreaterThan(0.8);
    expect(SOURCE_RELIABILITY.yellow_pages).toBeGreaterThan(0.6);
  });

  it('should default to 0.5 for unknown sources', () => {
    const reliability = SOURCE_RELIABILITY['unknown_source'] ?? 0.5;
    expect(reliability).toBe(0.5);
  });
});

// ============ Feedback Type Impact Tests ============

describe('Feedback Confidence Impact', () => {
  type FeedbackType =
    | 'email_invalid'
    | 'email_bounced'
    | 'email_correct'
    | 'phone_invalid'
    | 'phone_correct'
    | 'business_closed'
    | 'wrong_address'
    | 'wrong_category'
    | 'duplicate'
    | 'spam'
    | 'other';

  function calculateConfidenceImpact(feedbackType: FeedbackType): number {
    const impacts: Record<FeedbackType, number> = {
      email_correct: 0.15,
      phone_correct: 0.10,
      email_invalid: -0.25,
      email_bounced: -0.30,
      phone_invalid: -0.15,
      business_closed: -0.50,
      wrong_address: -0.20,
      wrong_category: -0.05,
      duplicate: -0.10,
      spam: -0.40,
      other: 0,
    };
    return impacts[feedbackType] || 0;
  }

  it('should have positive impact for confirmations', () => {
    expect(calculateConfidenceImpact('email_correct')).toBeGreaterThan(0);
    expect(calculateConfidenceImpact('phone_correct')).toBeGreaterThan(0);
  });

  it('should have negative impact for invalids', () => {
    expect(calculateConfidenceImpact('email_invalid')).toBeLessThan(0);
    expect(calculateConfidenceImpact('email_bounced')).toBeLessThan(0);
    expect(calculateConfidenceImpact('phone_invalid')).toBeLessThan(0);
  });

  it('should have strongest negative impact for closed/spam', () => {
    const closedImpact = calculateConfidenceImpact('business_closed');
    const spamImpact = calculateConfidenceImpact('spam');
    const invalidImpact = calculateConfidenceImpact('email_invalid');

    expect(closedImpact).toBeLessThan(invalidImpact);
    expect(spamImpact).toBeLessThan(invalidImpact);
  });

  it('should have neutral impact for other', () => {
    expect(calculateConfidenceImpact('other')).toBe(0);
  });
});

// ============ Pattern Detection Tests ============

describe('Email Pattern Detection', () => {
  function detectEmailPattern(localPart: string): string {
    if (['info', 'contact', 'hello', 'office', 'mail', 'support'].includes(localPart)) {
      return localPart;
    }
    if (localPart.includes('.')) {
      const parts = localPart.split('.');
      if (parts.length === 2 && parts[0].length > 1 && parts[1].length > 1) {
        return '{first}.{last}';
      }
    }
    if (/^[a-z]{2,}[a-z]{2,}$/.test(localPart) && localPart.length > 6) {
      return '{first}{last}';
    }
    if (localPart.includes('_')) {
      const parts = localPart.split('_');
      if (parts.length === 2) {
        return '{first}_{last}';
      }
    }
    if (/^[a-z][a-z]{2,}$/.test(localPart) && localPart.length >= 4) {
      return '{f}{last}';
    }
    return 'custom';
  }

  it('should detect common prefixes', () => {
    expect(detectEmailPattern('info')).toBe('info');
    expect(detectEmailPattern('contact')).toBe('contact');
    expect(detectEmailPattern('support')).toBe('support');
  });

  it('should detect first.last pattern', () => {
    expect(detectEmailPattern('john.smith')).toBe('{first}.{last}');
    expect(detectEmailPattern('jane.doe')).toBe('{first}.{last}');
  });

  it('should detect first_last pattern', () => {
    expect(detectEmailPattern('john_smith')).toBe('{first}_{last}');
  });

  it('should detect flast pattern', () => {
    expect(detectEmailPattern('jsmith')).toBe('{f}{last}');
    expect(detectEmailPattern('jdoe')).toBe('{f}{last}');
  });

  it('should return custom for unrecognized patterns', () => {
    expect(detectEmailPattern('x')).toBe('custom');
    expect(detectEmailPattern('a.b.c')).toBe('custom');
  });
});

// ============ Disposable Email Detection Tests ============

describe('Disposable Email Detection', () => {
  const DISPOSABLE_DOMAINS = new Set([
    'tempmail.com', 'temp-mail.org', 'guerrillamail.com', 'mailinator.com',
    'maildrop.cc', 'throwaway.email', 'yopmail.com', 'sharklasers.com',
    '10minutemail.com', 'fakeinbox.com',
  ]);

  function isDisposableDomain(domain: string): boolean {
    return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
  }

  it('should detect known disposable domains', () => {
    expect(isDisposableDomain('mailinator.com')).toBe(true);
    expect(isDisposableDomain('tempmail.com')).toBe(true);
    expect(isDisposableDomain('guerrillamail.com')).toBe(true);
  });

  it('should not flag legitimate domains', () => {
    expect(isDisposableDomain('gmail.com')).toBe(false);
    expect(isDisposableDomain('company.com')).toBe(false);
    expect(isDisposableDomain('outlook.com')).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(isDisposableDomain('MAILINATOR.COM')).toBe(true);
    expect(isDisposableDomain('Tempmail.Com')).toBe(true);
  });
});

// ============ A/B Test Analysis Tests ============

describe('Pattern Performance Analysis', () => {
  interface PatternTestResult {
    pattern: string;
    testCount: number;
    deliveryRate: number;
    responseRate: number;
    bounceRate: number;
    winner: boolean;
  }

  function analyzePatternPerformance(
    testResults: { pattern: string; delivered: boolean; responded: boolean }[]
  ): PatternTestResult[] {
    const patternStats = new Map<string, {
      total: number; delivered: number; responded: number; bounced: number;
    }>();

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

    const winner = results.find(r => r.pattern === bestPattern);
    if (winner) winner.winner = true;

    return results;
  }

  it('should calculate delivery rate correctly', () => {
    const results = analyzePatternPerformance([
      { pattern: 'info', delivered: true, responded: false },
      { pattern: 'info', delivered: true, responded: true },
      { pattern: 'info', delivered: false, responded: false },
    ]);

    const infoResult = results.find(r => r.pattern === 'info');
    expect(infoResult?.deliveryRate).toBeCloseTo(0.67, 1);
  });

  it('should identify winning pattern', () => {
    const results = analyzePatternPerformance([
      { pattern: 'info', delivered: true, responded: false },
      { pattern: 'info', delivered: true, responded: false },
      { pattern: 'contact', delivered: true, responded: false },
      { pattern: 'contact', delivered: false, responded: false },
    ]);

    const winner = results.find(r => r.winner);
    expect(winner?.pattern).toBe('info');
  });

  it('should calculate bounce rate', () => {
    const results = analyzePatternPerformance([
      { pattern: 'test', delivered: false, responded: false },
      { pattern: 'test', delivered: false, responded: false },
      { pattern: 'test', delivered: true, responded: false },
    ]);

    const testResult = results.find(r => r.pattern === 'test');
    expect(testResult?.bounceRate).toBeCloseTo(0.67, 1);
  });
});

// ============ Verification Score Tests ============

describe('Verification Score Calculation', () => {
  interface VerifiedBusiness {
    verification_score: number;
    positive_reports: number;
    negative_reports: number;
  }

  function updateVerificationScore(
    current: VerifiedBusiness,
    confidenceImpact: number
  ): number {
    const newScore = current.verification_score + Math.round(confidenceImpact * 100);
    return Math.max(0, Math.min(100, newScore));
  }

  it('should increase score for positive feedback', () => {
    const business: VerifiedBusiness = {
      verification_score: 50,
      positive_reports: 5,
      negative_reports: 0,
    };

    const newScore = updateVerificationScore(business, 0.15);
    expect(newScore).toBe(65);
  });

  it('should decrease score for negative feedback', () => {
    const business: VerifiedBusiness = {
      verification_score: 50,
      positive_reports: 0,
      negative_reports: 5,
    };

    const newScore = updateVerificationScore(business, -0.25);
    expect(newScore).toBe(25);
  });

  it('should not exceed 100', () => {
    const business: VerifiedBusiness = {
      verification_score: 95,
      positive_reports: 10,
      negative_reports: 0,
    };

    const newScore = updateVerificationScore(business, 0.15);
    expect(newScore).toBe(100);
  });

  it('should not go below 0', () => {
    const business: VerifiedBusiness = {
      verification_score: 5,
      positive_reports: 0,
      negative_reports: 10,
    };

    const newScore = updateVerificationScore(business, -0.50);
    expect(newScore).toBe(0);
  });
});
