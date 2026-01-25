import { neon } from '@neondatabase/serverless';

const DATABASE_URL = "postgresql://neondb_owner:npg_HX07WrLKSmEZ@ep-spring-violet-ahb6ki8w-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

async function fixSchema() {
  try {
    // Drop and recreate businesses table with proper schema
    console.log('Backing up any existing data...');
    const existingData = await sql`SELECT * FROM businesses LIMIT 100`;
    console.log(`Found ${existingData.length} existing rows`);

    console.log('Dropping old table...');
    await sql`DROP TABLE IF EXISTS businesses`;

    console.log('Creating new table with proper schema...');
    await sql`
      CREATE TABLE businesses (
        id SERIAL PRIMARY KEY,
        job_id TEXT NOT NULL,
        name TEXT NOT NULL,
        website TEXT,
        email TEXT,
        email_source TEXT,
        email_confidence NUMERIC DEFAULT 0,
        phone TEXT,
        address TEXT,
        instagram TEXT,
        rating NUMERIC,
        review_count INTEGER,
        years_in_business INTEGER,
        source TEXT NOT NULL,
        employee_count INTEGER,
        industry_code TEXT,
        is_b2b BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    console.log('Creating index on job_id...');
    await sql`CREATE INDEX idx_businesses_job_id ON businesses(job_id)`;

    console.log('Table recreated successfully!');

    // Test insert
    console.log('Testing insert...');
    await sql`INSERT INTO businesses (job_id, name, source) VALUES ('test', 'Test Business', 'test')`;

    const test = await sql`SELECT id, name FROM businesses WHERE job_id = 'test'`;
    console.log('Insert successful! Row:', test[0]);

    // Clean up
    await sql`DELETE FROM businesses WHERE job_id = 'test'`;
    console.log('Schema fixed and ready!');

  } catch (e) {
    console.error('Error:', e.message);
    throw e;
  }
}

fixSchema();
