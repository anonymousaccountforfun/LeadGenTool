import { getDb } from "@/lib/db";
import { Lead } from "@/types/lead";

export async function getLeads(): Promise<Lead[]> {
  const sql = getDb();

  const rows = await sql`
    SELECT id, name, email, phone, company, message, source, created_at
    FROM leads
    ORDER BY created_at DESC
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || undefined,
    company: row.company || undefined,
    message: row.message,
    source: row.source,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function saveLead(
  lead: Omit<Lead, "id" | "createdAt">
): Promise<Lead> {
  const sql = getDb();

  const rows = await sql`
    INSERT INTO leads (name, email, phone, company, message, source)
    VALUES (${lead.name}, ${lead.email}, ${lead.phone || null}, ${lead.company || null}, ${lead.message}, ${lead.source})
    RETURNING id, name, email, phone, company, message, source, created_at
  `;

  const row = rows[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || undefined,
    company: row.company || undefined,
    message: row.message,
    source: row.source,
    createdAt: row.created_at.toISOString(),
  };
}

export async function getLeadsByDateRange(
  startDate?: string,
  endDate?: string
): Promise<Lead[]> {
  const sql = getDb();

  let rows;

  if (startDate && endDate) {
    rows = await sql`
      SELECT id, name, email, phone, company, message, source, created_at
      FROM leads
      WHERE created_at >= ${startDate}::date
        AND created_at < (${endDate}::date + interval '1 day')
      ORDER BY created_at DESC
    `;
  } else if (startDate) {
    rows = await sql`
      SELECT id, name, email, phone, company, message, source, created_at
      FROM leads
      WHERE created_at >= ${startDate}::date
      ORDER BY created_at DESC
    `;
  } else if (endDate) {
    rows = await sql`
      SELECT id, name, email, phone, company, message, source, created_at
      FROM leads
      WHERE created_at < (${endDate}::date + interval '1 day')
      ORDER BY created_at DESC
    `;
  } else {
    rows = await sql`
      SELECT id, name, email, phone, company, message, source, created_at
      FROM leads
      ORDER BY created_at DESC
    `;
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || undefined,
    company: row.company || undefined,
    message: row.message,
    source: row.source,
    createdAt: row.created_at.toISOString(),
  }));
}

export function leadsToCSV(leads: Lead[]): string {
  const headers = [
    "ID",
    "Name",
    "Email",
    "Phone",
    "Company",
    "Message",
    "Source",
    "Created At",
  ];
  const rows = leads.map((lead) => [
    lead.id,
    `"${lead.name.replace(/"/g, '""')}"`,
    lead.email,
    lead.phone || "",
    `"${(lead.company || "").replace(/"/g, '""')}"`,
    `"${lead.message.replace(/"/g, '""')}"`,
    lead.source,
    lead.createdAt,
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}
