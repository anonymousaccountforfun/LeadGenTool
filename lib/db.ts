import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { withRetry, DatabaseConnectionError, isRetryableError } from './errors';

// Cache the database connection
let dbInstance: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> {
  if (!dbInstance) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new DatabaseConnectionError(new Error('DATABASE_URL environment variable is not set'));
    dbInstance = neon(databaseUrl);
  }
  return dbInstance;
}

/**
 * Execute a database query with automatic retry on transient failures
 */
async function withDbRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  return withRetry(operation, {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    shouldRetry: (error) => isRetryableError(error),
    onRetry: (error, attempt) => {
      console.warn(`Database ${operationName} failed (attempt ${attempt}):`, error.message);
    },
  });
}

/**
 * Check database health
 */
export async function checkDbHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const sql = getDb();
    await sql`SELECT 1`;
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export type JobPriority = 'high' | 'normal' | 'low';

export type CompanySizeRange = '1-10' | '11-50' | '51-200' | '201-500' | '500+' | null;

export interface Job {
  id: string; query: string; location: string | null; target_count: number;
  status: 'pending' | 'processing' | 'running' | 'completed' | 'failed'; progress: number;
  message: string | null; priority: JobPriority; created_at: string;
  // B2B targeting fields
  industry_category: string | null;
  company_size_min: number | null;
  company_size_max: number | null;
  target_state: string | null;
  // Optional result count (populated in queries)
  result_count?: number;
}

export interface Business {
  id: number; job_id: string; name: string; website: string | null;
  email: string | null; email_source: string | null; email_confidence: number;
  phone: string | null; address: string | null; instagram: string | null;
  rating: number | null; review_count: number | null; years_in_business: number | null;
  source: string; created_at: string;
  // B2B fields
  employee_count: number | null;
  industry_code: string | null;
  is_b2b: boolean;
}

export async function initDb() {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        location TEXT,
        target_count INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        message TEXT,
        priority TEXT DEFAULT 'normal',
        industry_category TEXT,
        company_size_min INTEGER,
        company_size_max INTEGER,
        target_state TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    // Add priority column if it doesn't exist (migration for existing tables)
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='priority') THEN
          ALTER TABLE jobs ADD COLUMN priority TEXT DEFAULT 'normal';
        END IF;
      END $$;
    `;
    // Add B2B targeting columns (migration for existing tables)
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='industry_category') THEN
          ALTER TABLE jobs ADD COLUMN industry_category TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='company_size_min') THEN
          ALTER TABLE jobs ADD COLUMN company_size_min INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='company_size_max') THEN
          ALTER TABLE jobs ADD COLUMN company_size_max INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='target_state') THEN
          ALTER TABLE jobs ADD COLUMN target_state TEXT;
        END IF;
      END $$;
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS businesses (
        id SERIAL PRIMARY KEY,
        job_id TEXT NOT NULL,
        name TEXT NOT NULL,
        website TEXT,
        email TEXT,
        email_source TEXT,
        email_confidence REAL DEFAULT 0,
        phone TEXT,
        address TEXT,
        instagram TEXT,
        rating REAL,
        review_count INTEGER,
        years_in_business INTEGER,
        source TEXT NOT NULL,
        employee_count INTEGER,
        industry_code TEXT,
        is_b2b BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    // Add B2B columns to businesses (migration for existing tables)
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='employee_count') THEN
          ALTER TABLE businesses ADD COLUMN employee_count INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='industry_code') THEN
          ALTER TABLE businesses ADD COLUMN industry_code TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='is_b2b') THEN
          ALTER TABLE businesses ADD COLUMN is_b2b BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_businesses_job_id ON businesses(job_id)`;
  }, 'initDb');
}

export interface B2BTargeting {
  industryCategory?: string | null;
  companySizeMin?: number | null;
  companySizeMax?: number | null;
  targetState?: string | null;
}

export async function getJob(id: string): Promise<Job | undefined> {
  return withDbRetry(async () => {
    const sql = getDb();
    const rows = await sql`SELECT * FROM jobs WHERE id = ${id}`;
    if (rows.length === 0) return undefined;
    const row = rows[0];
    return {
      id: row.id, query: row.query, location: row.location, target_count: row.target_count,
      status: row.status, progress: row.progress, message: row.message,
      priority: row.priority || 'normal', created_at: row.created_at,
      industry_category: row.industry_category || null,
      company_size_min: row.company_size_min || null,
      company_size_max: row.company_size_max || null,
      target_state: row.target_state || null,
    };
  }, 'getJob');
}

export async function updateJobStatus(id: string, status: string, progress: number, message: string): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`UPDATE jobs SET status = ${status}, progress = ${progress}, message = ${message} WHERE id = ${id}`;
  }, 'updateJobStatus');
}

export async function addBusiness(business: Omit<Business, 'id' | 'created_at'>): Promise<boolean> {
  return withDbRetry(async () => {
    const sql = getDb();
    // Use ON CONFLICT to handle duplicates - update if better data available
    const result = await sql`
      INSERT INTO businesses (job_id, name, website, email, email_source, email_confidence, phone, address, instagram, rating, review_count, years_in_business, source, employee_count, industry_code, is_b2b)
      VALUES (${business.job_id}, ${business.name}, ${business.website}, ${business.email}, ${business.email_source}, ${business.email_confidence}, ${business.phone}, ${business.address}, ${business.instagram}, ${business.rating}, ${business.review_count}, ${business.years_in_business}, ${business.source}, ${business.employee_count}, ${business.industry_code}, ${business.is_b2b ?? true})
      ON CONFLICT (job_id, LOWER(name)) DO UPDATE SET
        website = COALESCE(NULLIF(businesses.website, ''), EXCLUDED.website),
        email = COALESCE(businesses.email, EXCLUDED.email),
        email_source = COALESCE(businesses.email_source, EXCLUDED.email_source),
        email_confidence = GREATEST(businesses.email_confidence, EXCLUDED.email_confidence),
        phone = COALESCE(NULLIF(businesses.phone, ''), EXCLUDED.phone),
        address = COALESCE(NULLIF(businesses.address, ''), EXCLUDED.address),
        rating = COALESCE(businesses.rating, EXCLUDED.rating),
        review_count = GREATEST(COALESCE(businesses.review_count, 0), COALESCE(EXCLUDED.review_count, 0))
      RETURNING id
    `;
    return result.length > 0;
  }, 'addBusiness');
}

export async function getBusinessesByJobId(jobId: string): Promise<Business[]> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM businesses WHERE job_id = ${jobId} ORDER BY email_confidence DESC`;
  return rows.map(row => ({
    id: row.id, job_id: row.job_id, name: row.name, website: row.website,
    email: row.email, email_source: row.email_source, email_confidence: row.email_confidence || 0,
    phone: row.phone, address: row.address, instagram: row.instagram,
    rating: row.rating, review_count: row.review_count, years_in_business: row.years_in_business,
    source: row.source, created_at: row.created_at,
    employee_count: row.employee_count || null,
    industry_code: row.industry_code || null,
    is_b2b: row.is_b2b ?? true,
  }));
}

export async function updateBusinessEmail(
  id: number,
  email: string,
  emailSource: string,
  emailConfidence: number
): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`
      UPDATE businesses
      SET email = ${email},
          email_source = ${emailSource},
          email_confidence = ${emailConfidence}
      WHERE id = ${id} AND (email IS NULL OR email_confidence < ${emailConfidence})
    `;
  }, 'updateBusinessEmail');
}

export async function updateBusinessWebsite(
  id: number,
  website: string
): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`
      UPDATE businesses
      SET website = ${website}
      WHERE id = ${id} AND website IS NULL
    `;
  }, 'updateBusinessWebsite');
}

export async function getBusinessesWithoutEmail(jobId: string, limit: number = 50): Promise<Business[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM businesses
    WHERE job_id = ${jobId} AND email IS NULL AND website IS NOT NULL
    ORDER BY rating DESC NULLS LAST
    LIMIT ${limit}
  `;
  return rows.map(row => ({
    id: row.id, job_id: row.job_id, name: row.name, website: row.website,
    email: row.email, email_source: row.email_source, email_confidence: row.email_confidence || 0,
    phone: row.phone, address: row.address, instagram: row.instagram,
    rating: row.rating, review_count: row.review_count, years_in_business: row.years_in_business,
    source: row.source, created_at: row.created_at,
    employee_count: row.employee_count || null,
    industry_code: row.industry_code || null,
    is_b2b: row.is_b2b ?? true,
  }));
}

export async function getEmailCountByJobId(jobId: string): Promise<{ total: number; withEmail: number; verified: number }> {
  const sql = getDb();
  const totalResult = await sql`SELECT COUNT(*) as count FROM businesses WHERE job_id = ${jobId}`;
  const withEmailResult = await sql`SELECT COUNT(*) as count FROM businesses WHERE job_id = ${jobId} AND email IS NOT NULL`;
  const verifiedResult = await sql`SELECT COUNT(*) as count FROM businesses WHERE job_id = ${jobId} AND email_confidence >= 0.8`;
  return {
    total: Number(totalResult[0].count),
    withEmail: Number(withEmailResult[0].count),
    verified: Number(verifiedResult[0].count)
  };
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  location: string | null;
  target_count: number;
  status: string;
  created_at: string;
  total_leads: number;
  emails_found: number;
  verified_emails: number;
}

export async function getBusinessesSince(jobId: string, lastId: number = 0): Promise<Business[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM businesses
    WHERE job_id = ${jobId} AND id > ${lastId}
    ORDER BY id ASC
  `;
  return rows.map(row => ({
    id: row.id, job_id: row.job_id, name: row.name, website: row.website,
    email: row.email, email_source: row.email_source, email_confidence: row.email_confidence || 0,
    phone: row.phone, address: row.address, instagram: row.instagram,
    rating: row.rating, review_count: row.review_count, years_in_business: row.years_in_business,
    source: row.source, created_at: row.created_at,
    employee_count: row.employee_count || null,
    industry_code: row.industry_code || null,
    is_b2b: row.is_b2b ?? true,
  }));
}

export async function getBusinessCount(jobId: string): Promise<number> {
  const sql = getDb();
  const result = await sql`SELECT COUNT(*) as count FROM businesses WHERE job_id = ${jobId}`;
  return Number(result[0].count);
}

// ============ Data Quality Reports ============

export type ReportType = 'wrong_email' | 'disconnected_phone' | 'wrong_address' | 'closed_business' | 'duplicate' | 'other';

export interface DataReport {
  id: number;
  business_id: number;
  report_type: ReportType;
  details: string | null;
  created_at: string;
}

export async function createDataReportsTable(): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`
      CREATE TABLE IF NOT EXISTS data_reports (
        id SERIAL PRIMARY KEY,
        business_id INTEGER NOT NULL REFERENCES businesses(id),
        report_type TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_data_reports_business_id ON data_reports(business_id)`;
  }, 'createDataReportsTable');
}

export async function submitDataReport(
  businessId: number,
  reportType: ReportType,
  details?: string
): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    // Insert the report
    await sql`
      INSERT INTO data_reports (business_id, report_type, details)
      VALUES (${businessId}, ${reportType}, ${details || null})
    `;

    // If email is reported wrong, reduce confidence
    if (reportType === 'wrong_email') {
      await sql`
        UPDATE businesses
        SET email_confidence = GREATEST(email_confidence - 0.3, 0)
        WHERE id = ${businessId}
      `;
    }
  }, 'submitDataReport');
}

export async function getReportsForBusiness(businessId: number): Promise<DataReport[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM data_reports
    WHERE business_id = ${businessId}
    ORDER BY created_at DESC
  `;
  return rows.map(row => ({
    id: row.id,
    business_id: row.business_id,
    report_type: row.report_type as ReportType,
    details: row.details,
    created_at: row.created_at,
  }));
}

export async function getReportCount(businessId: number): Promise<number> {
  const sql = getDb();
  const result = await sql`SELECT COUNT(*) as count FROM data_reports WHERE business_id = ${businessId}`;
  return Number(result[0].count);
}

export async function getSearchHistory(limit: number = 10): Promise<SearchHistoryItem[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT
      j.id,
      j.query,
      j.location,
      j.target_count,
      j.status,
      j.created_at,
      COUNT(b.id) as total_leads,
      COUNT(b.email) as emails_found,
      COUNT(CASE WHEN b.email_confidence >= 0.8 THEN 1 END) as verified_emails
    FROM jobs j
    LEFT JOIN businesses b ON j.id = b.job_id
    WHERE j.status = 'completed'
    GROUP BY j.id, j.query, j.location, j.target_count, j.status, j.created_at
    ORDER BY j.created_at DESC
    LIMIT ${limit}
  `;

  return rows.map(row => ({
    id: row.id,
    query: row.query,
    location: row.location,
    target_count: row.target_count,
    status: row.status,
    created_at: row.created_at,
    total_leads: Number(row.total_leads),
    emails_found: Number(row.emails_found),
    verified_emails: Number(row.verified_emails)
  }));
}

// ============ Bulk Job Groups ============

export interface BulkJobGroup {
  id: string;
  query: string;
  total_locations: number;
  industry_category: string | null;
  b2c_only: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
}

export async function createBulkJobGroupsTable(): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`
      CREATE TABLE IF NOT EXISTS bulk_job_groups (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        total_locations INTEGER NOT NULL,
        industry_category TEXT,
        b2c_only BOOLEAN DEFAULT true,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    // Add bulk_group_id to jobs table if not exists
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='bulk_group_id') THEN
          ALTER TABLE jobs ADD COLUMN bulk_group_id TEXT REFERENCES bulk_job_groups(id);
        END IF;
      END $$;
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_jobs_bulk_group_id ON jobs(bulk_group_id)`;
  }, 'createBulkJobGroupsTable');
}

interface CreateBulkJobGroupParams {
  query: string;
  totalLocations: number;
  industryCategory?: string;
  b2cOnly?: boolean;
}

export async function createBulkJobGroup(params: CreateBulkJobGroupParams): Promise<BulkJobGroup> {
  return withDbRetry(async () => {
    const sql = getDb();
    const id = `bulk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    await sql`
      INSERT INTO bulk_job_groups (id, query, total_locations, industry_category, b2c_only, status)
      VALUES (${id}, ${params.query}, ${params.totalLocations}, ${params.industryCategory || null}, ${params.b2cOnly ?? true}, 'pending')
    `;

    return {
      id,
      query: params.query,
      total_locations: params.totalLocations,
      industry_category: params.industryCategory || null,
      b2c_only: params.b2cOnly ?? true,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
  }, 'createBulkJobGroup');
}

export async function getBulkJobGroup(id: string): Promise<BulkJobGroup | undefined> {
  return withDbRetry(async () => {
    const sql = getDb();
    const rows = await sql`SELECT * FROM bulk_job_groups WHERE id = ${id}`;
    if (rows.length === 0) return undefined;
    const row = rows[0];
    return {
      id: row.id,
      query: row.query,
      total_locations: row.total_locations,
      industry_category: row.industry_category,
      b2c_only: row.b2c_only,
      status: row.status,
      created_at: row.created_at,
    };
  }, 'getBulkJobGroup');
}

export async function getJobsByBulkGroupId(bulkGroupId: string): Promise<Job[]> {
  return withDbRetry(async () => {
    const sql = getDb();
    const rows = await sql`SELECT * FROM jobs WHERE bulk_group_id = ${bulkGroupId} ORDER BY created_at ASC`;
    return rows.map(row => ({
      id: row.id,
      query: row.query,
      location: row.location,
      target_count: row.target_count,
      status: row.status,
      progress: row.progress,
      message: row.message,
      priority: row.priority || 'normal',
      created_at: row.created_at,
      industry_category: row.industry_category || null,
      company_size_min: row.company_size_min || null,
      company_size_max: row.company_size_max || null,
      target_state: row.target_state || null,
      result_count: row.result_count || 0,
    }));
  }, 'getJobsByBulkGroupId');
}

export async function updateBulkJobGroupStatus(id: string, status: BulkJobGroup['status']): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`UPDATE bulk_job_groups SET status = ${status} WHERE id = ${id}`;
  }, 'updateBulkJobGroupStatus');
}

// Extended createJob to support bulk group
interface CreateJobParams {
  query: string;
  location: string | null;
  count: number;
  priority?: JobPriority;
  industryCategory?: string | null;
  targetState?: string | null;
  companySizeMin?: number | null;
  companySizeMax?: number | null;
  b2cOnly?: boolean;
  bulkGroupId?: string | null;
}

export async function createJob(params: CreateJobParams | string, query?: string, location?: string | null, targetCount?: number, priority?: JobPriority, b2bTargeting?: B2BTargeting): Promise<Job> {
  return withDbRetry(async () => {
    const sql = getDb();

    // Support both old signature and new object signature
    let jobParams: CreateJobParams;
    if (typeof params === 'string') {
      // Old signature: createJob(id, query, location, count, priority, b2bTargeting)
      jobParams = {
        query: query!,
        location: location ?? null,
        count: targetCount!,
        priority: priority || 'normal',
        industryCategory: b2bTargeting?.industryCategory ?? null,
        targetState: b2bTargeting?.targetState ?? null,
        companySizeMin: b2bTargeting?.companySizeMin ?? null,
        companySizeMax: b2bTargeting?.companySizeMax ?? null,
        bulkGroupId: null,
      };
      // Use the provided ID for backward compatibility
      const id = params;
      await sql`INSERT INTO jobs (id, query, location, target_count, status, progress, message, priority, industry_category, company_size_min, company_size_max, target_state, bulk_group_id)
        VALUES (${id}, ${jobParams.query}, ${jobParams.location}, ${jobParams.count}, 'pending', 0, 'Queued...', ${jobParams.priority || 'normal'}, ${jobParams.industryCategory}, ${jobParams.companySizeMin}, ${jobParams.companySizeMax}, ${jobParams.targetState}, ${null})`;

      return {
        id,
        query: jobParams.query,
        location: jobParams.location,
        target_count: jobParams.count,
        status: 'pending',
        progress: 0,
        message: 'Queued...',
        priority: jobParams.priority || 'normal',
        created_at: new Date().toISOString(),
        industry_category: jobParams.industryCategory ?? null,
        company_size_min: jobParams.companySizeMin ?? null,
        company_size_max: jobParams.companySizeMax ?? null,
        target_state: jobParams.targetState ?? null,
      };
    } else {
      // New object signature
      jobParams = params;
      const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      await sql`INSERT INTO jobs (id, query, location, target_count, status, progress, message, priority, industry_category, company_size_min, company_size_max, target_state, bulk_group_id)
        VALUES (${id}, ${jobParams.query}, ${jobParams.location}, ${jobParams.count}, 'pending', 0, 'Queued...', ${jobParams.priority || 'normal'}, ${jobParams.industryCategory ?? null}, ${jobParams.companySizeMin ?? null}, ${jobParams.companySizeMax ?? null}, ${jobParams.targetState ?? null}, ${jobParams.bulkGroupId ?? null})`;

      return {
        id,
        query: jobParams.query,
        location: jobParams.location,
        target_count: jobParams.count,
        status: 'pending',
        progress: 0,
        message: 'Queued...',
        priority: jobParams.priority || 'normal',
        created_at: new Date().toISOString(),
        industry_category: jobParams.industryCategory ?? null,
        company_size_min: jobParams.companySizeMin ?? null,
        company_size_max: jobParams.companySizeMax ?? null,
        target_state: jobParams.targetState ?? null,
      };
    }
  }, 'createJob');
}
