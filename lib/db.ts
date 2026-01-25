import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { withRetry, DatabaseConnectionError, isRetryableError } from './errors';

// Cache the database connection
let dbInstance: NeonQueryFunction<false, false> | null = null;

function getDb(): NeonQueryFunction<false, false> {
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
  status: 'pending' | 'running' | 'completed' | 'failed'; progress: number;
  message: string | null; priority: JobPriority; created_at: string;
  // B2B targeting fields
  industry_category: string | null;
  company_size_min: number | null;
  company_size_max: number | null;
  target_state: string | null;
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

export async function createJob(
  id: string,
  query: string,
  location: string | null,
  targetCount: number,
  priority: JobPriority = 'normal',
  b2bTargeting?: B2BTargeting
): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`INSERT INTO jobs (id, query, location, target_count, status, progress, message, priority, industry_category, company_size_min, company_size_max, target_state) VALUES (${id}, ${query}, ${location}, ${targetCount}, 'pending', 0, 'Queued...', ${priority}, ${b2bTargeting?.industryCategory || null}, ${b2bTargeting?.companySizeMin || null}, ${b2bTargeting?.companySizeMax || null}, ${b2bTargeting?.targetState || null})`;
  }, 'createJob');
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

export async function addBusiness(business: Omit<Business, 'id' | 'created_at'>): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`INSERT INTO businesses (job_id, name, website, email, email_source, email_confidence, phone, address, instagram, rating, review_count, years_in_business, source, employee_count, industry_code, is_b2b) VALUES (${business.job_id}, ${business.name}, ${business.website}, ${business.email}, ${business.email_source}, ${business.email_confidence}, ${business.phone}, ${business.address}, ${business.instagram}, ${business.rating}, ${business.review_count}, ${business.years_in_business}, ${business.source}, ${business.employee_count}, ${business.industry_code}, ${business.is_b2b ?? true})`;
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
