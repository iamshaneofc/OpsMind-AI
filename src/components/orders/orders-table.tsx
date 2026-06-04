import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppRole } from "@/types/auth";
import { matchesOrdersView, type DashboardOrdersView } from "@/lib/orders-view-filters";

const statusColor: Record<string, "default" | "warning" | "danger" | "success" | "secondary"> = {
  PENDING: "secondary",
  PROCESSING: "warning",
  SHIPPED: "default",
  DELIVERED: "success",
  DELAYED: "warning",
  CANCELLED: "danger",
};

interface OrdersTableProps {
  role: AppRole;
  rows: Array<{
    id: string | number;
    order_number: string;
    status: string;
    customer_name?: string | null;
    expected_delivery_date: string | null;
    created_at: string;
  }>;
}

const VISIBLE_LIMIT = 100;

function presetLabel(view: DashboardOrdersView): string {
  switch (view) {
    case "today": return "Today";
    case "in-progress": return "In progress";
    case "dispatch-ready": return "Dispatch queue";
    case "awaiting-factory": return "Awaiting factory";
    case "local-warehouse": return "Local warehouse";
    case "central-warehouse": return "Central warehouse";
    default: return "All";
  }
}

export function OrdersTable({ rows, role }: OrdersTableProps) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [extraExpanded, setExtraExpanded] = useState(false);
  const showCustomerColumn = role === "admin" || role === "manager";
  const view = (searchParams?.get("view") ?? "all") as DashboardOrdersView;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesOrdersView({ status: r.status, created_at: r.created_at }, view)) return false;
      const okQuery = !q
        ? true
        : (r.order_number ?? "").toLowerCase().includes(q) ||
          (r.status ?? "").toLowerCase().includes(q) ||
          (r.customer_name ?? "").toLowerCase().includes(q);
      return okQuery;
    });
  }, [rows, query, view]);

  const visibleRows =
    showCustomerColumn && !extraExpanded
      ? filtered.slice(0, VISIBLE_LIMIT)
      : filtered;

  const hiddenCount = Math.max(0, filtered.length - VISIBLE_LIMIT);
  const hasHidden = showCustomerColumn && hiddenCount > 0;

  const renderRow = (row: (typeof filtered)[0]) => (
    <TableRow key={row.id}>
      <TableCell className="font-mono text-xs">{row.id}</TableCell>
      <TableCell className="font-medium">{row.order_number}</TableCell>
      {showCustomerColumn ? (
        <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground" title={row.customer_name ?? ""}>
          {row.customer_name ?? "—"}
        </TableCell>
      ) : null}
      <TableCell>
        <Badge variant={statusColor[row.status] ?? "secondary"}>{row.status}</Badge>
      </TableCell>
      <TableCell>{row.expected_delivery_date ?? "-"}</TableCell>
    </TableRow>
  );

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Orders</CardTitle>
          {view !== "all" ? (
            <p className="mt-1 text-xs text-cyan-300">Preset: {presetLabel(view)}</p>
          ) : null}
          <p className="mt-1 text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{filtered.length}</span> of{" "}
            <span className="font-medium text-foreground">{rows.length}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              showCustomerColumn
                ? "Search order / status / customer…"
                : "Search order number / status…"
            }
            className="h-9 w-[260px]"
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>System ID</TableHead>
            <TableHead>Order Number</TableHead>
            {showCustomerColumn ? <TableHead>Customer Name</TableHead> : null}
            <TableHead>Status</TableHead>
            <TableHead>Expected Delivery</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map(renderRow)}
        </TableBody>
      </Table>

      {hasHidden && (
        <div className="mt-0 border-t border-border/40">
          {!extraExpanded ? (
            <button
              onClick={() => setExtraExpanded(true)}
              className="flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors hover:bg-slate-900/30"
              aria-expanded={false}
            >
              {hiddenCount} more order{hiddenCount !== 1 ? "s" : ""} — click to expand
            </button>
          ) : (
            <>
              <Table>
                <TableBody>
                  {filtered.slice(VISIBLE_LIMIT).map(renderRow)}
                </TableBody>
              </Table>
              <button
                onClick={() => setExtraExpanded(false)}
                className="flex w-full items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors hover:bg-slate-900/30"
                aria-expanded={true}
              >
                Collapse
              </button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
