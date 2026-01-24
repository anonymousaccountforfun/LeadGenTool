"use client";

import { Lead } from "@/types/lead";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface LeadsTableProps {
  leads: Lead[];
}

export function LeadsTable({ leads }: LeadsTableProps) {
  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-gray-500">No leads found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Leads ({leads.length})</h2>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left py-3 px-6 font-medium text-gray-700">
                Name
              </th>
              <th className="text-left py-3 px-6 font-medium text-gray-700">
                Email
              </th>
              <th className="text-left py-3 px-6 font-medium text-gray-700">
                Phone
              </th>
              <th className="text-left py-3 px-6 font-medium text-gray-700">
                Company
              </th>
              <th className="text-left py-3 px-6 font-medium text-gray-700">
                Message
              </th>
              <th className="text-left py-3 px-6 font-medium text-gray-700">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b hover:bg-gray-50">
                <td className="py-4 px-6">{lead.name}</td>
                <td className="py-4 px-6">
                  <a
                    href={`mailto:${lead.email}`}
                    className="text-blue-600 hover:underline"
                  >
                    {lead.email}
                  </a>
                </td>
                <td className="py-4 px-6">{lead.phone || "-"}</td>
                <td className="py-4 px-6">{lead.company || "-"}</td>
                <td className="py-4 px-6 max-w-xs truncate" title={lead.message}>
                  {lead.message}
                </td>
                <td className="py-4 px-6 whitespace-nowrap">
                  {new Date(lead.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
