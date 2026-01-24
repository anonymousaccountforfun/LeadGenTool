import { isAuthenticated } from "@/lib/auth/simple-auth";
import { getLeadsByDateRange } from "@/lib/storage/leads";
import { LoginForm } from "@/components/admin/login-form";
import { LeadsTable } from "@/components/admin/leads-table";
import { DateFilter } from "@/components/admin/date-filter";
import { ExportButton } from "@/components/admin/export-button";
import { LogoutButton } from "@/components/admin/logout-button";

interface AdminPageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
  }>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return <LoginForm />;
  }

  const params = await searchParams;
  const leads = await getLeadsByDateRange(params.startDate, params.endDate);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <div className="flex gap-4">
            <ExportButton />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <DateFilter />
        </div>
        <LeadsTable leads={leads} />
      </main>
    </div>
  );
}
