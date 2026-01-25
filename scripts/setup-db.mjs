import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function setup() {
  console.log('Setting up database tables...');

  // Create jobs table
  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      location TEXT,
      count INTEGER DEFAULT 25,
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      message TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP,
      priority TEXT DEFAULT 'normal',
      industry_category TEXT,
      company_size_min INTEGER,
      company_size_max INTEGER,
      target_state TEXT
    )
  `;
  console.log('✓ Jobs table created');

  // Create businesses table
  await sql`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      job_id TEXT REFERENCES jobs(id),
      name TEXT NOT NULL,
      website TEXT,
      email TEXT,
      email_confidence REAL DEFAULT 0,
      phone TEXT,
      address TEXT,
      rating REAL,
      review_count INTEGER,
      source TEXT,
      instagram TEXT,
      years_in_business INTEGER,
      employee_count INTEGER,
      industry_code TEXT,
      is_b2b BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('✓ Businesses table created');

  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_businesses_job_id ON businesses(job_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`;
  console.log('✓ Indexes created');

  console.log('\nDatabase setup complete!');
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
