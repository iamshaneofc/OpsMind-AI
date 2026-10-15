"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

type ReportDef = {
  id: string;
  name: string;
  description: string;
  type: "CSV" | "PDF";
  endpoint: string;
};

const REPORTS: ReportDef[] = [
  {
    id: "orders",
    name: "Orders snapshot",
    description: "All orders in the active industry dataset (CSV).",
    type: "CSV",
    endpoint: "/api/dashboard/orders",
  },
  {
    id: "inventory",
    name: "Inventory valuation",
    description: "On-hand quantities by warehouse and SKU (CSV).",
    type: "CSV",
    endpoint: "/api/dashboard/inventory",
  },
  {
    id: "customers",
    name: "Customer directory",
    description: "Distributors / dealers / accounts for this industry (CSV).",
    type: "CSV",
    endpoint: "/api/dashboard/customers",
  },
  {
    id: "metrics",
    name: "Executive KPI summary",
    description: "Dashboard metrics for the active industry (CSV).",
    type: "CSV",
    endpoint: "/api/dashboard/metrics",
  },
];

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "message\nNo rows\n";
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => escape(r[k])).join(","))].join("\n");
}

function flattenMetrics(metrics: Record<string, unknown>): Record<string, unknown>[] {
  const { ordersByStatus, ordersPipeline, ...rest } = metrics as {
    ordersByStatus?: unknown;
    ordersPipeline?: unknown;
    [k: string]: unknown;
  };
  return [
    {
      ...rest,
      ordersByStatus: JSON.stringify(ordersByStatus ?? []),
      ordersPipeline: JSON.stringify(ordersPipeline ?? []),
    },
  ];
}

function downloadBlob(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsList({ filterType = "all" }: { filterType?: string }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(
    () => REPORTS.filter((r) => filterType === "all" || r.type === filterType),
    [filterType],
  );

  const exportReport = async (report: ReportDef) => {
    setBusyId(report.id);
    try {
      const res = await fetch(report.endpoint, { cache: "no-store" });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      let rows: Record<string, unknown>[] = [];
      if (Array.isArray(data)) {
        rows = data.map((row) => {
          if (row && typeof row === "object" && "products" in row) {
            const { products, ...rest } = row as Record<string, unknown> & {
              products?: { name?: string; sku?: string; cost?: number } | null;
            };
            return {
              ...rest,
              product_name: products?.name ?? "",
              product_sku: products?.sku ?? "",
              product_cost: products?.cost ?? "",
            };
          }
          return row as Record<string, unknown>;
        });
      } else if (data && typeof data === "object") {
        rows = flattenMetrics(data as Record<string, unknown>);
      }
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(`opsmind-${report.id}-${stamp}.csv`, toCsv(rows));
    } catch (e) {
      console.error(e);
      alert("Could not export report. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  if (!visible.length) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No reports match this filter. Choose CSV or All Types.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {visible.map((report) => (
        <Card key={report.id} className="glass-card flex flex-col gap-3 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {report.type === "CSV" ? <FileSpreadsheet size={18} /> : <FileText size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base text-white">{report.name}</CardTitle>
              <CardDescription className="mt-1 text-sm">{report.description}</CardDescription>
              <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                {report.type} · live industry data
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="mt-auto w-fit"
            disabled={busyId === report.id}
            onClick={() => exportReport(report)}
          >
            {busyId === report.id ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download CSV
          </Button>
        </Card>
      ))}
    </div>
  );
}
