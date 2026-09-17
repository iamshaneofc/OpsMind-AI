"use client";

import { useState } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText } from "lucide-react";

const reports = [
  { name: "Executive Summary", date: "June 2026", type: "PDF" },
  { name: "Inventory Valuation", date: "Q2 2026", type: "CSV" },
  { name: "Fulfillment SLA Breaches", date: "Trailing 30 Days", type: "CSV" },
  { name: "Customer Acquisition Cost", date: "May 2026", type: "PDF" },
  { name: "Customer Churn Analysis", date: "Last 6 Months", type: "CSV" },
  { name: "Warehouse Throughput", date: "June 2026", type: "PDF" },
  { name: "Delayed Shipments Report", date: "Trailing 7 Days", type: "CSV" },
];

interface ReportsListProps {
  filterType?: string;
}

export function ReportsList({ filterType = "all" }: ReportsListProps) {
  const filtered = filterType === "all" 
    ? reports 
    : reports.filter(r => r.type === filterType);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {filtered.map((report) => (
        <Card key={report.name} className="glass-card flex flex-col p-5 hover:border-primary/30 group">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                <FileText size={20} />
              </div>
              <div>
                <CardTitle className="text-base font-medium text-white">{report.name}</CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">{report.date} · {report.type}</CardDescription>
              </div>
            </div>
          </div>
        </Card>
      ))}
      {filtered.length === 0 && (
        <div className="col-span-2 text-center py-12 text-muted-foreground">
          No reports found for this filter.
        </div>
      )}
    </div>
  );
}
