import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppRole } from "@/types/auth";
import { matchesOrdersView, type DashboardOrdersView } from "@/lib/orders-view-filters";

const statusColor: Record<string, "default" | "warning" | "danger" | "success" | "secondary"> = {
  // 7 canonical lifecycle states
  ORDER_RECEIVED: "secondary",
  ALLOCATED_LOCAL_WAREHOUSE: "default",
  ALLOCATED_CENTRAL_WAREHOUSE: "default",
  IN_PREPARATION: "warning",
  AWAITING_FACTORY: "warning",
  DISPATCH_READY: "default",
  DELIVERED: "success",
  // Legacy / fallback keys
  PENDING: "secondary",
  IN_TRANSIT: "default",
  CANCELLED: "danger",
  OPEN: "secondary",
};

type DistributorFilter = "all" | "viraj" | "krisshna";

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

function matchesDistributorFilter(customerName: string | null | undefined, filter: DistributorFilter): boolean {
  if (filter === "all") return true;
  const n = (customerName ?? "").toLowerCase();
  if (filter === "viraj") return n.includes("viraj life science");
  if (filter === "krisshna") return n.includes("krisshna enterprise");
  return true;
}

/** Must match API cap in `balanceOrdersForRole` (super_admin: 100). */
const SUPER_ADMIN_VISIBLE_LIMIT = 100;

function presetLabel(view: DashboardOrdersView): string {
  switch (view) {
    case "today":
      return "Today";
    case "in-progress":
      return "In progress";
    case "dispatch-ready":
      return "Dispatch queue";
    case "awaiting-factory":
      return "Awaiting factory";
    case "local-warehouse":
      return "Local warehouse";
    case "central-warehouse":
      return "Central warehouse";
    default:
      return "All";
  }
}

export function OrdersTable({ rows, role }: OrdersTableProps) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [distributorFilter, setDistributorFilter] = useState<DistributorFilter>("all");
  const [extraExpanded, setExtraExpanded] = useState(false);
  const showDistributorControls = role === "super_admin";
  const view = (searchParams?.get("view") ?? "all") as DashboardOrdersView;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesOrdersView({ status: r.status, created_at: r.created_at }, view)) return false;
      if (showDistributorControls && !matchesDistributorFilter(r.customer_name, distributorFilter)) {
        return false;
      }
      const okQuery = !q
        ? true
        : (r.order_number ?? "").toLowerCase().includes(q) ||
          (r.status ?? "").toLowerCase().includes(q) ||
          (r.customer_name ?? "").toLowerCase().includes(q);
      return okQuery;
    });
  }, [rows, query, distributorFilter, showDistributorControls, view]);

  // For super_admin: show first 100, rest collapsed. Distributors / warehouse: show full list from API (up to 50).
  const visibleRows =
    showDistributorControls && !extraExpanded
      ? filtered.slice(0, SUPER_ADMIN_VISIBLE_LIMIT)
      : filtered;

  const hiddenCount = Math.max(0, filtered.length - SUPER_ADMIN_VISIBLE_LIMIT);
  const hasHidden = showDistributorControls && hiddenCount > 0;

  const renderRow = (row: (typeof filtered)[0]) => (
    <TableRow key={row.id}>
      <TableCell className="font-mono text-xs">{row.id}</TableCell>
      <TableCell className="font-medium">{row.order_number}</TableCell>
      {showDistributorControls ? (
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
          {showDistributorControls ? (
            <select
              value={distributorFilter}
              onChange={(e) => setDistributorFilter(e.target.value as DistributorFilter)}
              className="h-9 min-w-[200px] rounded-md border border-border/70 bg-slate-950/60 px-2 text-sm"
              aria-label="Filter by distributor"
            >
              <option value="all">All distributors</option>
              <option value="viraj">Viraj Life Science</option>
              <option value="krisshna">Krisshna Enterprise</option>
            </select>
          ) : null}
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              showDistributorControls
                ? "Search order / status / distributor…"
                : "Search order number / status…"
            }
            className="h-9 w-[260px]"
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sales Order ID</TableHead>
            <TableHead>Order Number</TableHead>
            {showDistributorControls ? <TableHead>Distributor Name</TableHead> : null}
            <TableHead>Status</TableHead>
            <TableHead>Expected Delivery (Est.)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map(renderRow)}
        </TableBody>
      </Table>

      {/* Collapsible extra-orders section — super_admin only */}
      {hasHidden && (
        <div className="mt-0 border-t border-border/40">
          {!extraExpanded ? (
            <button
              onClick={() => setExtraExpanded(true)}
              className="flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors hover:bg-slate-900/30"
              aria-expanded={false}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
              {hiddenCount} more order{hiddenCount !== 1 ? "s" : ""} — click to expand
            </button>
          ) : (
            <>
              <Table>
                <TableBody>
                  {filtered.slice(SUPER_ADMIN_VISIBLE_LIMIT).map(renderRow)}
                </TableBody>
              </Table>
              <button
                onClick={() => setExtraExpanded(false)}
                className="flex w-full items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors hover:bg-slate-900/30"
                aria-expanded={true}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m18 15-6-6-6 6" />
                </svg>
                Collapse
              </button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
