import { getDb } from "./index";

export async function migrate() {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      company VARCHAR(200),
      message TEXT NOT NULL,
      source VARCHAR(100) NOT NULL DEFAULT 'landing-page',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email)
  `;

  console.log("Migration completed successfully");
}
