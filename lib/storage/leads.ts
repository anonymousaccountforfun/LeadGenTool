import { promises as fs } from "fs";
import path from "path";
import { Lead } from "@/types/lead";

const DATA_DIR = path.join(process.cwd(), "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");

async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function ensureLeadsFile(): Promise<void> {
  await ensureDataDir();
  try {
    await fs.access(LEADS_FILE);
  } catch {
    await fs.writeFile(LEADS_FILE, JSON.stringify([], null, 2));
  }
}

export async function getLeads(): Promise<Lead[]> {
  await ensureLeadsFile();
  const data = await fs.readFile(LEADS_FILE, "utf-8");
  return JSON.parse(data);
}

export async function saveLead(lead: Omit<Lead, "id" | "createdAt">): Promise<Lead> {
  await ensureLeadsFile();
  const leads = await getLeads();

  const newLead: Lead = {
    ...lead,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  leads.push(newLead);
  await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2));

  return newLead;
}

export async function getLeadsByDateRange(
  startDate?: string,
  endDate?: string
): Promise<Lead[]> {
  const leads = await getLeads();

  return leads.filter((lead) => {
    const leadDate = new Date(lead.createdAt);
    if (startDate && new Date(startDate) > leadDate) return false;
    if (endDate && new Date(endDate) < leadDate) return false;
    return true;
  });
}

export function leadsToCSV(leads: Lead[]): string {
  const headers = ["ID", "Name", "Email", "Phone", "Company", "Message", "Source", "Created At"];
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
