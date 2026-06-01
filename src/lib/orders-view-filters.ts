/**
 * Pure filters for dashboard ↔ orders tab consistency.
 * Keep in sync with KPI definitions in `getDashboardMetrics`.
 */
export type DashboardOrdersView =
  | "all"
  | "today"
  | "in-progress"
  | "dispatch-ready"
  | "awaiting-factory"
  | "local-warehouse"
  | "central-warehouse";

function isSameLocalDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isOrdersInProgressStatus(status: string): boolean {
  const s = (status ?? "").toUpperCase();
  return (
    s.includes("IN_PROGRESS") ||
    s === "IN_PREPARATION" ||
    s === "AWAITING_FACTORY" ||
    s === "ALLOCATED_LOCAL_WAREHOUSE" ||
    s === "ALLOCATED_CENTRAL_WAREHOUSE" ||
    s === "ORDER_RECEIVED"
  );
}

export function isOrdersLocalWarehouseStatus(status: string): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "ORDER_RECEIVED" || s === "ALLOCATED_LOCAL_WAREHOUSE" || s === "IN_PREPARATION";
}

export function isOrdersCentralWarehouseStatus(status: string): boolean {
  return (status ?? "").toUpperCase() === "ALLOCATED_CENTRAL_WAREHOUSE";
}

export function isOrdersAwaitingFactoryStatus(status: string): boolean {
  return (status ?? "").toUpperCase() === "AWAITING_FACTORY";
}

export function matchesOrdersView(
  row: { status: string; created_at: string },
  view: DashboardOrdersView,
): boolean {
  if (view === "all") return true;

  const status = (row.status ?? "").toUpperCase();
  if (view === "dispatch-ready") {
    return status === "DISPATCH_READY" || status.includes("DISPATCH");
  }

  if (view === "in-progress") {
    return isOrdersInProgressStatus(row.status ?? "");
  }

  if (view === "awaiting-factory") {
    return isOrdersAwaitingFactoryStatus(row.status ?? "");
  }

  if (view === "local-warehouse") {
    return isOrdersLocalWarehouseStatus(row.status ?? "");
  }

  if (view === "central-warehouse") {
    return isOrdersCentralWarehouseStatus(row.status ?? "");
  }

  if (view === "today") {
    const created = new Date(row.created_at);
    if (Number.isNaN(created.getTime())) return false;
    return isSameLocalDate(created, new Date());
  }

  return true;
}
