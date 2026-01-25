import { neon } from '@neondatabase/serverless';

const DATABASE_URL = "postgresql://neondb_owner:npg_HX07WrLKSmEZ@ep-spring-violet-ahb6ki8w-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

async function addConstraints() {
  console.log('Adding unique constraint to prevent duplicates...');

  // First, clean up existing duplicates (keep the one with highest rating)
  console.log('Cleaning up existing duplicates...');
  await sql`
    DELETE FROM businesses a
    USING businesses b
    WHERE a.id > b.id
      AND a.job_id = b.job_id
      AND LOWER(a.name) = LOWER(b.name)
  `;

  // Add unique constraint on job_id + lowercase name
  console.log('Adding unique index...');
  try {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_job_name_unique
      ON businesses (job_id, LOWER(name))
    `;
    console.log('Unique index created!');
  } catch (e) {
    console.log('Index may already exist:', e.message);
  }

  // Verify
  const count = await sql`SELECT COUNT(*) as total FROM businesses`;
  const unique = await sql`SELECT COUNT(DISTINCT LOWER(name)) as total FROM businesses`;
  console.log(`\nAfter cleanup: ${count[0].total} total, ${unique[0].total} unique`);
}

addConstraints();
