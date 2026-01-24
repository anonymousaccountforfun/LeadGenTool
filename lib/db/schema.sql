-- Leads table schema for Neon Postgres
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  company VARCHAR(200),
  message TEXT NOT NULL,
  source VARCHAR(100) NOT NULL DEFAULT 'landing-page',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for date filtering
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
