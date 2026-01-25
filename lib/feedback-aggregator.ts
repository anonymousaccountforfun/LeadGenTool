/**
 * Feedback Aggregator Module
 *
 * Collects and aggregates user feedback to improve data quality over time.
 * Builds a proprietary accuracy dataset from:
 * - User corrections and reports
 * - Email bounce data
 * - Verification results
 * - Cross-reference confirmations
 */

import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { withRetry, isRetryableError } from './errors';

// Cache database connection
let dbInstance: NeonQueryFunction<false, false> | null = null;

function getDb(): NeonQueryFunction<false, false> {
  if (!dbInstance) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL not set');
    dbInstance = neon(databaseUrl);
  }
  return dbInstance;
}

async function withDbRetry<T>(operation: () => Promise<T>, name: string): Promise<T> {
  return withRetry(operation, {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    shouldRetry: isRetryableError,
    onRetry: (error, attempt) => console.warn(`DB ${name} failed (attempt ${attempt}):`, error.message),
  });
}

// ============ Types ============

export type FeedbackType =
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

export interface UserFeedback {
  id: string;
  business_id: number;
  user_id: string | null;
  feedback_type: FeedbackType;
  field_name: string | null;
  original_value: string | null;
  corrected_value: string | null;
  notes: string | null;
  source: 'user_report' | 'email_bounce' | 'verification' | 'api';
  confidence_impact: number; // -1 to +1
  created_at: string;
  verified: boolean;
}

export interface EmailBounceRecord {
  id: string;
  email: string;
  domain: string;
  bounce_type: 'hard' | 'soft' | 'complaint' | 'unsubscribe';
  bounce_reason: string | null;
  business_id: number | null;
  created_at: string;
}

export interface VerifiedBusiness {
  id: string;
  business_id: number;
  name: string;
  domain: string | null;
  email: string | null;
  email_verified: boolean;
  phone: string | null;
  phone_verified: boolean;
  address_verified: boolean;
  verification_score: number; // 0-100
  total_reports: number;
  positive_reports: number;
  negative_reports: number;
  last_verified: string;
  created_at: string;
  updated_at: string;
}

export interface DomainPattern {
  domain: string;
  email_pattern: string; // e.g., "{first}.{last}", "{first}{last}", "info"
  pattern_confidence: number;
  sample_count: number;
  last_updated: string;
}

export interface AggregatedStats {
  totalFeedback: number;
  feedbackByType: Record<FeedbackType, number>;
  verifiedBusinesses: number;
  knownEmailPatterns: number;
  bounceRate: number;
  avgVerificationScore: number;
}

// ============ Table Initialization ============

export async function initFeedbackTables(): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();

    // User feedback table
    await sql`
      CREATE TABLE IF NOT EXISTS user_feedback (
        id TEXT PRIMARY KEY,
        business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        feedback_type TEXT NOT NULL,
        field_name TEXT,
        original_value TEXT,
        corrected_value TEXT,
        notes TEXT,
        source TEXT NOT NULL DEFAULT 'user_report',
        confidence_impact REAL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        verified BOOLEAN DEFAULT false
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_feedback_business ON user_feedback(business_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_feedback_type ON user_feedback(feedback_type)`;

    // Email bounce records
    await sql`
      CREATE TABLE IF NOT EXISTS email_bounces (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        domain TEXT NOT NULL,
        bounce_type TEXT NOT NULL,
        bounce_reason TEXT,
        business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_bounces_email ON email_bounces(email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_bounces_domain ON email_bounces(domain)`;

    // Verified businesses (crowdsourced accuracy)
    await sql`
      CREATE TABLE IF NOT EXISTS verified_businesses (
        id TEXT PRIMARY KEY,
        business_id INTEGER UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        domain TEXT,
        email TEXT,
        email_verified BOOLEAN DEFAULT false,
        phone TEXT,
        phone_verified BOOLEAN DEFAULT false,
        address_verified BOOLEAN DEFAULT false,
        verification_score INTEGER DEFAULT 0,
        total_reports INTEGER DEFAULT 0,
        positive_reports INTEGER DEFAULT 0,
        negative_reports INTEGER DEFAULT 0,
        last_verified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_verified_domain ON verified_businesses(domain)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_verified_score ON verified_businesses(verification_score DESC)`;

    // Domain email patterns
    await sql`
      CREATE TABLE IF NOT EXISTS domain_patterns (
        domain TEXT PRIMARY KEY,
        email_pattern TEXT NOT NULL,
        pattern_confidence REAL DEFAULT 0.5,
        sample_count INTEGER DEFAULT 1,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

  }, 'initFeedbackTables');
}

// ============ Feedback Recording ============

export async function recordFeedback(feedback: {
  businessId: number;
  userId?: string;
  feedbackType: FeedbackType;
  fieldName?: string;
  originalValue?: string;
  correctedValue?: string;
  notes?: string;
  source?: 'user_report' | 'email_bounce' | 'verification' | 'api';
}): Promise<UserFeedback> {
  return withDbRetry(async () => {
    const sql = getDb();
    const id = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Calculate confidence impact based on feedback type
    const confidenceImpact = calculateConfidenceImpact(feedback.feedbackType);

    await sql`
      INSERT INTO user_feedback (
        id, business_id, user_id, feedback_type, field_name,
        original_value, corrected_value, notes, source, confidence_impact
      ) VALUES (
        ${id}, ${feedback.businessId}, ${feedback.userId || null},
        ${feedback.feedbackType}, ${feedback.fieldName || null},
        ${feedback.originalValue || null}, ${feedback.correctedValue || null},
        ${feedback.notes || null}, ${feedback.source || 'user_report'},
        ${confidenceImpact}
      )
    `;

    // Update verified business record
    await updateVerifiedBusiness(feedback.businessId, feedback.feedbackType, confidenceImpact);

    return {
      id,
      business_id: feedback.businessId,
      user_id: feedback.userId || null,
      feedback_type: feedback.feedbackType,
      field_name: feedback.fieldName || null,
      original_value: feedback.originalValue || null,
      corrected_value: feedback.correctedValue || null,
      notes: feedback.notes || null,
      source: feedback.source || 'user_report',
      confidence_impact: confidenceImpact,
      created_at: new Date().toISOString(),
      verified: false,
    };
  }, 'recordFeedback');
}

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

// ============ Email Bounce Tracking ============

export async function recordBounce(bounce: {
  email: string;
  bounceType: 'hard' | 'soft' | 'complaint' | 'unsubscribe';
  bounceReason?: string;
  businessId?: number;
}): Promise<EmailBounceRecord> {
  return withDbRetry(async () => {
    const sql = getDb();
    const id = `bnc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const domain = bounce.email.split('@')[1]?.toLowerCase() || '';

    await sql`
      INSERT INTO email_bounces (id, email, domain, bounce_type, bounce_reason, business_id)
      VALUES (${id}, ${bounce.email.toLowerCase()}, ${domain}, ${bounce.bounceType}, ${bounce.bounceReason || null}, ${bounce.businessId || null})
    `;

    // If hard bounce, also record as feedback
    if (bounce.bounceType === 'hard' && bounce.businessId) {
      await recordFeedback({
        businessId: bounce.businessId,
        feedbackType: 'email_bounced',
        fieldName: 'email',
        originalValue: bounce.email,
        notes: bounce.bounceReason,
        source: 'email_bounce',
      });
    }

    return {
      id,
      email: bounce.email.toLowerCase(),
      domain,
      bounce_type: bounce.bounceType,
      bounce_reason: bounce.bounceReason || null,
      business_id: bounce.businessId || null,
      created_at: new Date().toISOString(),
    };
  }, 'recordBounce');
}

export async function getEmailBounceRate(domain: string): Promise<number> {
  return withDbRetry(async () => {
    const sql = getDb();

    const result = await sql`
      SELECT
        COUNT(*) FILTER (WHERE bounce_type = 'hard') as hard_bounces,
        COUNT(*) as total_bounces
      FROM email_bounces
      WHERE domain = ${domain.toLowerCase()}
      AND created_at > NOW() - INTERVAL '90 days'
    `;

    if (!result[0] || result[0].total_bounces === 0) return 0;
    return Number(result[0].hard_bounces) / Number(result[0].total_bounces);
  }, 'getEmailBounceRate');
}

export async function isEmailBounced(email: string): Promise<boolean> {
  return withDbRetry(async () => {
    const sql = getDb();
    const result = await sql`
      SELECT 1 FROM email_bounces
      WHERE email = ${email.toLowerCase()}
      AND bounce_type = 'hard'
      LIMIT 1
    `;
    return result.length > 0;
  }, 'isEmailBounced');
}

// ============ Verified Business Management ============

async function updateVerifiedBusiness(
  businessId: number,
  feedbackType: FeedbackType,
  confidenceImpact: number
): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();

    // Get business name
    const business = await sql`SELECT name, website FROM businesses WHERE id = ${businessId}`;
    if (!business[0]) return;

    const domain = business[0].website
      ? new URL(business[0].website).hostname.replace('www.', '')
      : null;

    const isPositive = confidenceImpact > 0;

    // Upsert verified business record
    await sql`
      INSERT INTO verified_businesses (
        id, business_id, name, domain, total_reports, positive_reports, negative_reports
      ) VALUES (
        ${'vb_' + businessId},
        ${businessId},
        ${business[0].name},
        ${domain},
        1,
        ${isPositive ? 1 : 0},
        ${isPositive ? 0 : 1}
      )
      ON CONFLICT (business_id) DO UPDATE SET
        total_reports = verified_businesses.total_reports + 1,
        positive_reports = verified_businesses.positive_reports + ${isPositive ? 1 : 0},
        negative_reports = verified_businesses.negative_reports + ${isPositive ? 0 : 1},
        verification_score = GREATEST(0, LEAST(100,
          verified_businesses.verification_score + ${Math.round(confidenceImpact * 100)}
        )),
        updated_at = NOW()
    `;

    // Update specific verification flags
    if (feedbackType === 'email_correct') {
      await sql`
        UPDATE verified_businesses SET email_verified = true, last_verified = NOW()
        WHERE business_id = ${businessId}
      `;
    } else if (feedbackType === 'phone_correct') {
      await sql`
        UPDATE verified_businesses SET phone_verified = true, last_verified = NOW()
        WHERE business_id = ${businessId}
      `;
    }
  }, 'updateVerifiedBusiness');
}

export async function getVerifiedBusiness(businessId: number): Promise<VerifiedBusiness | null> {
  return withDbRetry(async () => {
    const sql = getDb();
    const result = await sql`
      SELECT * FROM verified_businesses WHERE business_id = ${businessId}
    `;
    if (!result[0]) return null;

    return {
      id: result[0].id,
      business_id: result[0].business_id,
      name: result[0].name,
      domain: result[0].domain,
      email: result[0].email,
      email_verified: result[0].email_verified,
      phone: result[0].phone,
      phone_verified: result[0].phone_verified,
      address_verified: result[0].address_verified,
      verification_score: result[0].verification_score,
      total_reports: result[0].total_reports,
      positive_reports: result[0].positive_reports,
      negative_reports: result[0].negative_reports,
      last_verified: result[0].last_verified,
      created_at: result[0].created_at,
      updated_at: result[0].updated_at,
    };
  }, 'getVerifiedBusiness');
}

export async function getVerificationScore(businessId: number): Promise<number> {
  const verified = await getVerifiedBusiness(businessId);
  return verified?.verification_score || 50; // Default to neutral
}

// ============ Domain Pattern Learning ============

export async function learnEmailPattern(domain: string, email: string): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();

    // Extract pattern from email
    const localPart = email.split('@')[0].toLowerCase();
    const pattern = detectEmailPattern(localPart);

    // Upsert pattern with increased confidence
    await sql`
      INSERT INTO domain_patterns (domain, email_pattern, pattern_confidence, sample_count)
      VALUES (${domain.toLowerCase()}, ${pattern}, 0.6, 1)
      ON CONFLICT (domain) DO UPDATE SET
        email_pattern = CASE
          WHEN domain_patterns.email_pattern = ${pattern} THEN ${pattern}
          WHEN domain_patterns.sample_count < 3 THEN ${pattern}
          ELSE domain_patterns.email_pattern
        END,
        pattern_confidence = LEAST(0.95, domain_patterns.pattern_confidence + 0.05),
        sample_count = domain_patterns.sample_count + 1,
        last_updated = NOW()
    `;
  }, 'learnEmailPattern');
}

function detectEmailPattern(localPart: string): string {
  // Common patterns
  if (['info', 'contact', 'hello', 'office', 'mail', 'support'].includes(localPart)) {
    return localPart;
  }

  // Check for first.last pattern
  if (localPart.includes('.')) {
    const parts = localPart.split('.');
    if (parts.length === 2 && parts[0].length > 1 && parts[1].length > 1) {
      return '{first}.{last}';
    }
  }

  // Check for firstlast pattern (no separator)
  if (/^[a-z]{2,}[a-z]{2,}$/.test(localPart) && localPart.length > 6) {
    return '{first}{last}';
  }

  // Check for first_last pattern
  if (localPart.includes('_')) {
    const parts = localPart.split('_');
    if (parts.length === 2) {
      return '{first}_{last}';
    }
  }

  // Check for initial patterns (jsmith, jdoe)
  if (/^[a-z][a-z]{2,}$/.test(localPart) && localPart.length >= 4) {
    return '{f}{last}';
  }

  return 'custom';
}

export async function getDomainPattern(domain: string): Promise<DomainPattern | null> {
  return withDbRetry(async () => {
    const sql = getDb();
    const result = await sql`
      SELECT * FROM domain_patterns WHERE domain = ${domain.toLowerCase()}
    `;
    if (!result[0]) return null;

    return {
      domain: result[0].domain,
      email_pattern: result[0].email_pattern,
      pattern_confidence: result[0].pattern_confidence,
      sample_count: result[0].sample_count,
      last_updated: result[0].last_updated,
    };
  }, 'getDomainPattern');
}

// ============ Aggregated Statistics ============

export async function getAggregatedStats(): Promise<AggregatedStats> {
  return withDbRetry(async () => {
    const sql = getDb();

    // Get feedback counts by type
    const feedbackStats = await sql`
      SELECT feedback_type, COUNT(*) as count
      FROM user_feedback
      WHERE created_at > NOW() - INTERVAL '90 days'
      GROUP BY feedback_type
    `;

    const feedbackByType: Record<FeedbackType, number> = {} as Record<FeedbackType, number>;
    let totalFeedback = 0;
    for (const row of feedbackStats) {
      feedbackByType[row.feedback_type as FeedbackType] = Number(row.count);
      totalFeedback += Number(row.count);
    }

    // Get verified business count
    const verifiedCount = await sql`
      SELECT COUNT(*) as count FROM verified_businesses WHERE verification_score >= 70
    `;

    // Get pattern count
    const patternCount = await sql`
      SELECT COUNT(*) as count FROM domain_patterns WHERE pattern_confidence >= 0.7
    `;

    // Calculate bounce rate
    const bounceStats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE bounce_type = 'hard') as hard,
        COUNT(*) as total
      FROM email_bounces
      WHERE created_at > NOW() - INTERVAL '90 days'
    `;
    const bounceRate = bounceStats[0]?.total > 0
      ? Number(bounceStats[0].hard) / Number(bounceStats[0].total)
      : 0;

    // Calculate average verification score
    const avgScore = await sql`
      SELECT AVG(verification_score) as avg FROM verified_businesses
    `;

    return {
      totalFeedback,
      feedbackByType,
      verifiedBusinesses: Number(verifiedCount[0]?.count || 0),
      knownEmailPatterns: Number(patternCount[0]?.count || 0),
      bounceRate,
      avgVerificationScore: Number(avgScore[0]?.avg || 50),
    };
  }, 'getAggregatedStats');
}

// ============ Feedback Retrieval ============

export async function getFeedbackForBusiness(businessId: number): Promise<UserFeedback[]> {
  return withDbRetry(async () => {
    const sql = getDb();
    const result = await sql`
      SELECT * FROM user_feedback
      WHERE business_id = ${businessId}
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return result.map(row => ({
      id: row.id,
      business_id: row.business_id,
      user_id: row.user_id,
      feedback_type: row.feedback_type as FeedbackType,
      field_name: row.field_name,
      original_value: row.original_value,
      corrected_value: row.corrected_value,
      notes: row.notes,
      source: row.source as 'user_report' | 'email_bounce' | 'verification' | 'api',
      confidence_impact: row.confidence_impact,
      created_at: row.created_at,
      verified: row.verified,
    }));
  }, 'getFeedbackForBusiness');
}

export async function getRecentFeedback(limit: number = 100): Promise<UserFeedback[]> {
  return withDbRetry(async () => {
    const sql = getDb();
    const result = await sql`
      SELECT * FROM user_feedback
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    return result.map(row => ({
      id: row.id,
      business_id: row.business_id,
      user_id: row.user_id,
      feedback_type: row.feedback_type as FeedbackType,
      field_name: row.field_name,
      original_value: row.original_value,
      corrected_value: row.corrected_value,
      notes: row.notes,
      source: row.source as 'user_report' | 'email_bounce' | 'verification' | 'api',
      confidence_impact: row.confidence_impact,
      created_at: row.created_at,
      verified: row.verified,
    }));
  }, 'getRecentFeedback');
}
