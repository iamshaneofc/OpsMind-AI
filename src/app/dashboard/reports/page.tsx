"use client";

import { useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportsList } from "@/components/dashboard/ReportsList";

export default function ReportsPage() {
  const [filterType, setFilterType] = useState("all");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="bg-gradient-to-br from-white to-white/50 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            Executive Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Downloadable operational summaries and financial breakdowns.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-9 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white focus:ring-1 focus:ring-primary/50 outline-none"
          >
            <option value="all">All Types</option>
            <option value="PDF">PDF Only</option>
            <option value="CSV">CSV Only</option>
          </select>
        </div>
      </div>

      <ReportsList filterType={filterType} />
    </div>
  );
}
