"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function DateFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  const handleFilter = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const start = formData.get("startDate") as string;
    const end = formData.get("endDate") as string;

    const params = new URLSearchParams();
    if (start) params.set("startDate", start);
    if (end) params.set("endDate", end);

    router.push(`/admin?${params.toString()}`);
  };

  const handleClear = () => {
    router.push("/admin");
  };

  return (
    <form onSubmit={handleFilter} className="flex flex-wrap gap-4 items-end">
      <div>
        <Input
          name="startDate"
          type="date"
          label="Start Date"
          defaultValue={startDate}
        />
      </div>
      <div>
        <Input
          name="endDate"
          type="date"
          label="End Date"
          defaultValue={endDate}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary">
          Filter
        </Button>
        <Button type="button" variant="outline" onClick={handleClear}>
          Clear
        </Button>
      </div>
    </form>
  );
}
