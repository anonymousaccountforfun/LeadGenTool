/**
 * User Database Functions
 *
 * Handles user accounts, profiles, and saved items
 */

import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { withRetry, isRetryableError } from './errors';

// Cache the database connection
let dbInstance: NeonQueryFunction<false, false> | null = null;

function getDb(): NeonQueryFunction<false, false> {
  if (!dbInstance) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL environment variable is not set');
    dbInstance = neon(databaseUrl);
  }
  return dbInstance;
}

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

// ============ Types ============

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  password_hash: string | null;
  provider: 'credentials' | 'google';
  created_at: string;
  last_login: string | null;
}

export interface SavedLead {
  id: number;
  user_id: string;
  business_id: number;
  notes: string | null;
  tags: string[];
  created_at: string;
}

export interface LeadList {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  is_public: boolean;
  share_token: string | null;
  view_count: number;
  download_count: number;
  created_at: string;
  updated_at: string;
  lead_count?: number;
}

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  query: string;
  location: string | null;
  filters: Record<string, unknown>;
  created_at: string;
  last_run: string | null;
}

// ============ Table Creation ============

export async function initUserTables(): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();

    // Users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        image TEXT,
        password_hash TEXT,
        provider TEXT NOT NULL DEFAULT 'credentials',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_login TIMESTAMP WITH TIME ZONE
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`;

    // Saved leads (favorites)
    await sql`
      CREATE TABLE IF NOT EXISTS saved_leads (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        notes TEXT,
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, business_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_saved_leads_user ON saved_leads(user_id)`;

    // Lead lists (folders) with sharing support
    await sql`
      CREATE TABLE IF NOT EXISTS lead_lists (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#64ffda',
        is_public BOOLEAN DEFAULT false,
        share_token TEXT UNIQUE,
        view_count INTEGER DEFAULT 0,
        download_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_lead_lists_user ON lead_lists(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_lead_lists_share_token ON lead_lists(share_token) WHERE share_token IS NOT NULL`;

    // Lead list items (many-to-many)
    await sql`
      CREATE TABLE IF NOT EXISTS lead_list_items (
        list_id TEXT NOT NULL REFERENCES lead_lists(id) ON DELETE CASCADE,
        saved_lead_id INTEGER NOT NULL REFERENCES saved_leads(id) ON DELETE CASCADE,
        added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (list_id, saved_lead_id)
      )
    `;

    // Saved searches
    await sql`
      CREATE TABLE IF NOT EXISTS saved_searches (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        query TEXT NOT NULL,
        location TEXT,
        filters JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_run TIMESTAMP WITH TIME ZONE
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id)`;

  }, 'initUserTables');
}

// ============ User Functions ============

interface CreateUserParams {
  email: string;
  name?: string;
  image?: string;
  passwordHash?: string;
  provider?: 'credentials' | 'google';
}

export async function createUser(params: CreateUserParams): Promise<User> {
  return withDbRetry(async () => {
    const sql = getDb();
    const id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    await sql`
      INSERT INTO users (id, email, name, image, password_hash, provider)
      VALUES (${id}, ${params.email}, ${params.name || null}, ${params.image || null}, ${params.passwordHash || null}, ${params.provider || 'credentials'})
    `;

    return {
      id,
      email: params.email,
      name: params.name || null,
      image: params.image || null,
      password_hash: params.passwordHash || null,
      provider: params.provider || 'credentials',
      created_at: new Date().toISOString(),
      last_login: null,
    };
  }, 'createUser');
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return withDbRetry(async () => {
    const sql = getDb();
    const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      image: row.image,
      password_hash: row.password_hash,
      provider: row.provider,
      created_at: row.created_at,
      last_login: row.last_login,
    };
  }, 'getUserByEmail');
}

export async function getUserById(id: string): Promise<User | null> {
  return withDbRetry(async () => {
    const sql = getDb();
    const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      image: row.image,
      password_hash: row.password_hash,
      provider: row.provider,
      created_at: row.created_at,
      last_login: row.last_login,
    };
  }, 'getUserById');
}

export async function updateUserLastLogin(userId: string): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`UPDATE users SET last_login = NOW() WHERE id = ${userId}`;
  }, 'updateUserLastLogin');
}

export async function updateUserProfile(userId: string, updates: { name?: string; image?: string }): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    if (updates.name !== undefined && updates.image !== undefined) {
      await sql`UPDATE users SET name = ${updates.name}, image = ${updates.image} WHERE id = ${userId}`;
    } else if (updates.name !== undefined) {
      await sql`UPDATE users SET name = ${updates.name} WHERE id = ${userId}`;
    } else if (updates.image !== undefined) {
      await sql`UPDATE users SET image = ${updates.image} WHERE id = ${userId}`;
    }
  }, 'updateUserProfile');
}

// ============ Saved Leads Functions ============

export async function saveLead(userId: string, businessId: number, notes?: string, tags?: string[]): Promise<SavedLead> {
  return withDbRetry(async () => {
    const sql = getDb();
    const rows = await sql`
      INSERT INTO saved_leads (user_id, business_id, notes, tags)
      VALUES (${userId}, ${businessId}, ${notes || null}, ${tags || []})
      ON CONFLICT (user_id, business_id) DO UPDATE SET
        notes = COALESCE(EXCLUDED.notes, saved_leads.notes),
        tags = COALESCE(EXCLUDED.tags, saved_leads.tags)
      RETURNING *
    `;
    const row = rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      business_id: row.business_id,
      notes: row.notes,
      tags: row.tags || [],
      created_at: row.created_at,
    };
  }, 'saveLead');
}

export async function unsaveLead(userId: string, businessId: number): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`DELETE FROM saved_leads WHERE user_id = ${userId} AND business_id = ${businessId}`;
  }, 'unsaveLead');
}

export async function getSavedLeads(userId: string, limit: number = 100, offset: number = 0): Promise<SavedLead[]> {
  return withDbRetry(async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM saved_leads
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      business_id: row.business_id,
      notes: row.notes,
      tags: row.tags || [],
      created_at: row.created_at,
    }));
  }, 'getSavedLeads');
}

export async function isLeadSaved(userId: string, businessId: number): Promise<boolean> {
  return withDbRetry(async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT 1 FROM saved_leads WHERE user_id = ${userId} AND business_id = ${businessId}
    `;
    return rows.length > 0;
  }, 'isLeadSaved');
}

// ============ Lead Lists Functions ============

export async function createLeadList(userId: string, name: string, description?: string, color?: string): Promise<LeadList> {
  return withDbRetry(async () => {
    const sql = getDb();
    const id = `list_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    await sql`
      INSERT INTO lead_lists (id, user_id, name, description, color)
      VALUES (${id}, ${userId}, ${name}, ${description || null}, ${color || '#64ffda'})
    `;

    return {
      id,
      user_id: userId,
      name,
      description: description || null,
      color: color || '#64ffda',
      is_public: false,
      share_token: null,
      view_count: 0,
      download_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }, 'createLeadList');
}

export async function getLeadLists(userId: string): Promise<LeadList[]> {
  return withDbRetry(async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT ll.*, COUNT(lli.saved_lead_id) as lead_count
      FROM lead_lists ll
      LEFT JOIN lead_list_items lli ON ll.id = lli.list_id
      WHERE ll.user_id = ${userId}
      GROUP BY ll.id
      ORDER BY ll.updated_at DESC
    `;
    return rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      description: row.description,
      color: row.color,
      is_public: row.is_public ?? false,
      share_token: row.share_token,
      view_count: row.view_count ?? 0,
      download_count: row.download_count ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      lead_count: Number(row.lead_count),
    }));
  }, 'getLeadLists');
}

export async function addLeadToList(listId: string, savedLeadId: number): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`
      INSERT INTO lead_list_items (list_id, saved_lead_id)
      VALUES (${listId}, ${savedLeadId})
      ON CONFLICT DO NOTHING
    `;
    await sql`UPDATE lead_lists SET updated_at = NOW() WHERE id = ${listId}`;
  }, 'addLeadToList');
}

export async function removeLeadFromList(listId: string, savedLeadId: number): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`DELETE FROM lead_list_items WHERE list_id = ${listId} AND saved_lead_id = ${savedLeadId}`;
  }, 'removeLeadFromList');
}

export async function deleteLeadList(listId: string, userId: string): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`DELETE FROM lead_lists WHERE id = ${listId} AND user_id = ${userId}`;
  }, 'deleteLeadList');
}

// ============ Lead List Sharing Functions ============

function generateShareToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export async function setListVisibility(listId: string, userId: string, isPublic: boolean): Promise<{ shareToken: string | null }> {
  return withDbRetry(async () => {
    const sql = getDb();

    if (isPublic) {
      // Generate a share token if making public
      const shareToken = generateShareToken();
      await sql`
        UPDATE lead_lists
        SET is_public = true, share_token = ${shareToken}, updated_at = NOW()
        WHERE id = ${listId} AND user_id = ${userId}
      `;
      return { shareToken };
    } else {
      // Remove share token when making private
      await sql`
        UPDATE lead_lists
        SET is_public = false, share_token = NULL, updated_at = NOW()
        WHERE id = ${listId} AND user_id = ${userId}
      `;
      return { shareToken: null };
    }
  }, 'setListVisibility');
}

export async function regenerateShareToken(listId: string, userId: string): Promise<string | null> {
  return withDbRetry(async () => {
    const sql = getDb();
    const shareToken = generateShareToken();

    const result = await sql`
      UPDATE lead_lists
      SET share_token = ${shareToken}, updated_at = NOW()
      WHERE id = ${listId} AND user_id = ${userId} AND is_public = true
      RETURNING share_token
    `;

    return result.length > 0 ? result[0].share_token : null;
  }, 'regenerateShareToken');
}

export async function getListByShareToken(shareToken: string): Promise<LeadList | null> {
  return withDbRetry(async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT ll.*, COUNT(lli.saved_lead_id) as lead_count
      FROM lead_lists ll
      LEFT JOIN lead_list_items lli ON ll.id = lli.list_id
      WHERE ll.share_token = ${shareToken} AND ll.is_public = true
      GROUP BY ll.id
    `;

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      description: row.description,
      color: row.color,
      is_public: row.is_public ?? false,
      share_token: row.share_token,
      view_count: row.view_count ?? 0,
      download_count: row.download_count ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      lead_count: Number(row.lead_count),
    };
  }, 'getListByShareToken');
}

export async function getListById(listId: string): Promise<LeadList | null> {
  return withDbRetry(async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT ll.*, COUNT(lli.saved_lead_id) as lead_count
      FROM lead_lists ll
      LEFT JOIN lead_list_items lli ON ll.id = lli.list_id
      WHERE ll.id = ${listId}
      GROUP BY ll.id
    `;

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      description: row.description,
      color: row.color,
      is_public: row.is_public ?? false,
      share_token: row.share_token,
      view_count: row.view_count ?? 0,
      download_count: row.download_count ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      lead_count: Number(row.lead_count),
    };
  }, 'getListById');
}

export async function incrementListViewCount(listId: string): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`UPDATE lead_lists SET view_count = view_count + 1 WHERE id = ${listId}`;
  }, 'incrementListViewCount');
}

export async function incrementListDownloadCount(listId: string): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`UPDATE lead_lists SET download_count = download_count + 1 WHERE id = ${listId}`;
  }, 'incrementListDownloadCount');
}

export interface ListBusiness {
  id: number;
  name: string;
  website: string | null;
  email: string | null;
  email_confidence: number;
  phone: string | null;
  address: string | null;
  rating: number | null;
  review_count: number | null;
  source: string;
}

export async function getListBusinesses(listId: string): Promise<ListBusiness[]> {
  return withDbRetry(async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT b.id, b.name, b.website, b.email, b.email_confidence, b.phone, b.address, b.rating, b.review_count, b.source
      FROM businesses b
      INNER JOIN saved_leads sl ON b.id = sl.business_id
      INNER JOIN lead_list_items lli ON sl.id = lli.saved_lead_id
      WHERE lli.list_id = ${listId}
      ORDER BY lli.added_at DESC
    `;

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      website: row.website,
      email: row.email,
      email_confidence: row.email_confidence ?? 0,
      phone: row.phone,
      address: row.address,
      rating: row.rating,
      review_count: row.review_count,
      source: row.source,
    }));
  }, 'getListBusinesses');
}

export async function updateLeadList(listId: string, userId: string, updates: { name?: string; description?: string; color?: string }): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    const setClauses: string[] = ['updated_at = NOW()'];

    if (updates.name !== undefined) {
      await sql`UPDATE lead_lists SET name = ${updates.name}, updated_at = NOW() WHERE id = ${listId} AND user_id = ${userId}`;
      return;
    }
    if (updates.description !== undefined) {
      await sql`UPDATE lead_lists SET description = ${updates.description}, updated_at = NOW() WHERE id = ${listId} AND user_id = ${userId}`;
      return;
    }
    if (updates.color !== undefined) {
      await sql`UPDATE lead_lists SET color = ${updates.color}, updated_at = NOW() WHERE id = ${listId} AND user_id = ${userId}`;
      return;
    }
  }, 'updateLeadList');
}

// ============ Saved Searches Functions ============

export async function saveSearch(userId: string, name: string, query: string, location: string | null, filters: Record<string, unknown>): Promise<SavedSearch> {
  return withDbRetry(async () => {
    const sql = getDb();
    const id = `search_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    await sql`
      INSERT INTO saved_searches (id, user_id, name, query, location, filters)
      VALUES (${id}, ${userId}, ${name}, ${query}, ${location}, ${JSON.stringify(filters)})
    `;

    return {
      id,
      user_id: userId,
      name,
      query,
      location,
      filters,
      created_at: new Date().toISOString(),
      last_run: null,
    };
  }, 'saveSearch');
}

export async function getSavedSearches(userId: string): Promise<SavedSearch[]> {
  return withDbRetry(async () => {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM saved_searches
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
    return rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      query: row.query,
      location: row.location,
      filters: row.filters || {},
      created_at: row.created_at,
      last_run: row.last_run,
    }));
  }, 'getSavedSearches');
}

export async function updateSavedSearchLastRun(searchId: string): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`UPDATE saved_searches SET last_run = NOW() WHERE id = ${searchId}`;
  }, 'updateSavedSearchLastRun');
}

export async function deleteSavedSearch(searchId: string, userId: string): Promise<void> {
  return withDbRetry(async () => {
    const sql = getDb();
    await sql`DELETE FROM saved_searches WHERE id = ${searchId} AND user_id = ${userId}`;
  }, 'deleteSavedSearch');
}

// ============ User Stats ============

export interface UserStats {
  savedLeadsCount: number;
  leadListsCount: number;
  savedSearchesCount: number;
  totalSearchesRun: number;
}

export async function getUserStats(userId: string): Promise<UserStats> {
  return withDbRetry(async () => {
    const sql = getDb();

    const savedLeads = await sql`SELECT COUNT(*) as count FROM saved_leads WHERE user_id = ${userId}`;
    const leadLists = await sql`SELECT COUNT(*) as count FROM lead_lists WHERE user_id = ${userId}`;
    const savedSearches = await sql`SELECT COUNT(*) as count FROM saved_searches WHERE user_id = ${userId}`;
    const totalRuns = await sql`SELECT COUNT(*) as count FROM saved_searches WHERE user_id = ${userId} AND last_run IS NOT NULL`;

    return {
      savedLeadsCount: Number(savedLeads[0].count),
      leadListsCount: Number(leadLists[0].count),
      savedSearchesCount: Number(savedSearches[0].count),
      totalSearchesRun: Number(totalRuns[0].count),
    };
  }, 'getUserStats');
}
