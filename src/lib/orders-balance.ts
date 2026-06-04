/**
 * Shapes the ERP order list for the dashboard: caps count by role and mixes statuses
 * when enough rows exist (round-robin), then fills the rest by newest date.
 */
export function balanceOrdersForRole<
  T extends { id: number; status: string; created_at: string },
>(orders: T[], role: string): T[] {
  const quota = role === "admin" ? 100 : 20;
  if (orders.length === 0) return [];

  const statusPriority: string[] = [
    "AWAITING_FACTORY",
    "ALLOCATED_CENTRAL_WAREHOUSE",
    "ALLOCATED_LOCAL_WAREHOUSE",
    "IN_PREPARATION",
    "DISPATCH_READY",
    "ORDER_RECEIVED",
    "DELIVERED",
  ];

  const byStatus = new Map<string, T[]>();
  for (const o of orders) {
    const s = o.status || "UNKNOWN";
    if (!byStatus.has(s)) byStatus.set(s, []);
    byStatus.get(s)!.push(o);
  }
  for (const arr of byStatus.values()) {
    arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const prioritySet = new Set(statusPriority);
  const orderedStatuses = [
    ...statusPriority.filter((s) => byStatus.has(s)),
    ...[...byStatus.keys()]
      .filter((s) => !prioritySet.has(s))
      .sort((a, b) => a.localeCompare(b)),
  ];

  const pickedIds = new Set<number>();
  const result: T[] = [];

  let round = 0;
  while (result.length < quota) {
    let addedRound = false;
    for (const st of orderedStatuses) {
      if (result.length >= quota) break;
      const bucket = byStatus.get(st);
      const pick = bucket?.[round];
      if (pick && !pickedIds.has(pick.id)) {
        result.push(pick);
        pickedIds.add(pick.id);
        addedRound = true;
      }
    }
    if (!addedRound) break;
    round++;
  }

  if (result.length < quota) {
    const rest = orders
      .filter((o) => !pickedIds.has(o.id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    for (const o of rest) {
      if (result.length >= quota) break;
      result.push(o);
    }
  }

  return result
    .slice(0, quota)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
