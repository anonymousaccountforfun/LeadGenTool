"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ExportButton() {
  const searchParams = useSearchParams();

  const handleExport = () => {
    const params = new URLSearchParams(searchParams.toString());
    window.location.href = `/api/leads/export?${params.toString()}`;
  };

  return (
    <Button variant="secondary" onClick={handleExport}>
      <svg
        className="w-4 h-4 mr-2"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        />
      </svg>
      Export CSV
    </Button>
  );
}
