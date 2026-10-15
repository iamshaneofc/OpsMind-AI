import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  CalendarDays,
  BarChart3,
} from "lucide-react";
import { requireAuthenticatedUser } from "@/services/auth";
import { InsightsCharts } from "@/components/dashboard/InsightsCharts";
import { OperationalTips } from "@/components/dashboard/operational-tips";
import { NextActionPlan } from "@/components/dashboard/next-action-plan";
import {
  getOrdersForRole,
  getInventoryForRole,
  getOperationalTips,
} from "@/services/operations";
import { getActiveIndustry } from "@/lib/industry-server";
import { getIndustryMeta, formatIndustryMoney } from "@/lib/industry";

const STATUS_HUES: Record<string, string> = {
  DELIVERED: "bg-success",
  CANCELLED: "bg-rose-500",
  DELAYED: "bg-amber-400",
  PENDING: "bg-muted-foreground",
  IN_PROGRESS: "bg-primary",
  PROCESSING: "bg-sky-400",
  SHIPPED: "bg-violet-400",
};

function hueFor(status: string) {
  return STATUS_HUES[status] ?? "bg-primary/60";
}

function shortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;
}

export default async function InsightsPage() {
  const { profile } = await requireAuthenticatedUser();
  const industry = getActiveIndustry();
  const meta = getIndustryMeta(industry);

  let lowStockCount = 0;
  let totalOrders = 0;
  let deliveredOrders = 0;
  let fulfillmentRate = 0;
  let revenue = 0;
  let avgOrderValue = 0;
  const statusCounts: Record<string, number> = {};
  const daily: Array<{ date: string; count: number }> = [];
  const topCustomers: Array<{ name: string; orders: number; value: number }> = [];
  let performanceData: Array<{ name: string; revenue: number }> = [];
  let inventoryData: Array<{ category: string; stock: number }> = [];
  let revenueSubtitle: string | undefined;
  let inventorySubtitle: string | undefined;
  let scoped = true;
  let tips: Awaited<ReturnType<typeof getOperationalTips>>["tips"] = [];

  try {
    const [orders, inventory, tipResult] = await Promise.all([
      getOrdersForRole(profile, { balanced: false, limit: 5000 }),
      getInventoryForRole(profile),
      getOperationalTips(profile),
    ]);
    tips = tipResult.tips;

    lowStockCount = inventory.filter(
      (i) => i.available_qty > 0 && i.available_qty < i.reorder_level,
    ).length;

    totalOrders = orders.length;
    deliveredOrders = orders.filter((o) => o.status === "DELIVERED").length;
    fulfillmentRate = totalOrders > 0 ? (deliveredOrders / totalOrders) * 100 : 0;

    for (const o of orders) {
      statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
      revenue += Number(o.order_value) || 0;
    }
    avgOrderValue = totalOrders > 0 ? revenue / totalOrders : 0;

    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const o of orders) {
      const key = o.created_at.slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    for (const [date, count] of buckets) daily.push({ date, count });

    const byCustomer = new Map<string, { name: string; orders: number; value: number }>();
    for (const o of orders) {
      const cur = byCustomer.get(o.customer_name) ?? {
        name: o.customer_name,
        orders: 0,
        value: 0,
      };
      cur.orders += 1;
      cur.value += Number(o.order_value) || 0;
      byCustomer.set(o.customer_name, cur);
    }
    topCustomers.push(
      ...[...byCustomer.values()].sort((a, b) => b.value - a.value).slice(0, 5),
    );

    const monthNow = new Date();
    const months: Array<{ key: string; label: string; revenue: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(monthNow.getFullYear(), monthNow.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleString("en-US", { month: "short" }),
        revenue: 0,
      });
    }
    const monthIndex = new Map(months.map((m, i) => [m.key, i]));
    for (const o of orders) {
      const idx = monthIndex.get(o.created_at.slice(0, 7));
      if (idx !== undefined) months[idx].revenue += Number(o.order_value) || 0;
    }

    const byWarehouse = new Map<string, number>();
    for (const i of inventory) {
      const name = i.warehouse_name || "Unassigned";
      byWarehouse.set(name, (byWarehouse.get(name) ?? 0) + i.available_qty);
    }

    scoped = profile.role === "admin" || Boolean(profile.warehouse_id);

    performanceData = months.map((m) => ({ name: m.label, revenue: Math.round(m.revenue) }));
    inventoryData = [...byWarehouse.entries()]
      .map(([category, stock]) => ({ category, stock }))
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 6);
    revenueSubtitle = `Last 7 months · ${formatIndustryMoney(
      months.reduce((s, m) => s + m.revenue, 0),
      industry,
    )} total`;
    inventorySubtitle = `${byWarehouse.size} warehouse(s) · ${meta.unit}`;
  } catch (error) {
    console.error("Error computing insights:", error);
  }

  const maxDaily = Math.max(1, ...daily.map((d) => d.count));
  const maxStatus = Math.max(1, ...Object.values(statusCounts));
  const topValue = Math.max(1, ...topCustomers.map((c) => c.value));

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.02] to-transparent p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-amber-400/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/90">
              Insights & tips · {meta.label}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Operational intelligence
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Priorities, a clear next-action plan, and live metrics for{" "}
              <span className="text-white/85">{meta.companyName}</span> — then dig deeper with OpsMind.
            </p>
          </div>
          <Badge
            className={
              scoped
                ? "border-primary/25 bg-primary/15 text-primary"
                : "border-amber-400/25 bg-amber-400/15 text-amber-300"
            }
          >
            {meta.companyName}
          </Badge>
        </div>
      </section>

      <NextActionPlan
        tips={tips}
        companyName={meta.companyName}
        fulfillmentRate={fulfillmentRate}
        lowStockCount={lowStockCount}
      />

      <OperationalTips
        tips={tips}
        industryLabel={meta.label}
        companyName={meta.companyName}
      />

      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-white">Pulse metrics</h2>
          <p className="text-xs text-muted-foreground">
            Snapshot of fulfillment, stock risk, and order book health
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="glass-card flex flex-col border-white/10 p-5 transition hover:-translate-y-0.5 hover:border-primary/30">
            <div className="mb-3 flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-wide text-white">
                <Sparkles size={16} className="text-primary" />
                Fulfillment rate
              </CardTitle>
              {fulfillmentRate >= 55 ? (
                <TrendingUp size={18} className="text-success" />
              ) : (
                <TrendingDown size={18} className="text-destructive" />
              )}
            </div>
            <p className="mb-1 text-3xl font-semibold tracking-tight text-white tabular-nums">
              {fulfillmentRate.toFixed(1)}%
            </p>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, fulfillmentRate)}%` }}
              />
            </div>
            <CardDescription className="text-sm leading-relaxed text-muted-foreground">
              {deliveredOrders} of {totalOrders} orders delivered successfully.
            </CardDescription>
          </Card>

          <Card className="glass-card flex flex-col border-white/10 p-5 transition hover:-translate-y-0.5 hover:border-destructive/30">
            <div className="mb-3 flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-wide text-white">
                <AlertTriangle size={16} className="text-destructive" />
                Low stock alert
              </CardTitle>
              {lowStockCount > 0 ? (
                <TrendingDown size={18} className="text-destructive" />
              ) : (
                <TrendingUp size={18} className="text-success" />
              )}
            </div>
            <p className="mb-2 text-3xl font-semibold tracking-tight text-white tabular-nums">
              {lowStockCount}{" "}
              <span className="text-base font-medium text-muted-foreground">SKUs</span>
            </p>
            <CardDescription className="text-sm leading-relaxed text-muted-foreground">
              {lowStockCount > 0
                ? `Below reorder on ${lowStockCount} SKU(s) (${meta.unit}).`
                : "All stock levels are healthy."}
            </CardDescription>
          </Card>

          <Card className="glass-card flex flex-col border-white/10 p-5 transition hover:-translate-y-0.5 hover:border-primary/30">
            <div className="mb-3 flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-wide text-white">
                <LineChart size={16} className="text-primary" />
                Order volume
              </CardTitle>
              <TrendingUp
                size={18}
                className={totalOrders > 0 ? "text-success" : "text-muted-foreground"}
              />
            </div>
            <p className="mb-2 text-3xl font-semibold tracking-tight text-white tabular-nums">
              {totalOrders.toLocaleString("en-IN")}
            </p>
            <CardDescription className="text-sm leading-relaxed text-muted-foreground">
              Avg order{" "}
              <span className="text-white">{formatIndustryMoney(avgOrderValue, industry)}</span> ·
              book <span className="text-white">{formatIndustryMoney(revenue, industry)}</span>.
            </CardDescription>
          </Card>
        </div>
      </div>

      <InsightsCharts
        performanceData={performanceData}
        inventoryData={inventoryData}
        revenueSubtitle={revenueSubtitle}
        inventorySubtitle={inventorySubtitle}
        currencySymbol={meta.currencySymbol}
      />

      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-white">Deeper context</h2>
          <p className="text-xs text-muted-foreground">
            Status mix, recent intake, and top accounts driving the book
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="glass-card border-white/10 p-5">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-primary" />
              <CardTitle className="text-sm font-medium tracking-wide text-white">
                Order status mix
              </CardTitle>
            </div>
            {Object.keys(statusCounts).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No orders in scope.</p>
            ) : (
              <ul className="space-y-3">
                {Object.entries(statusCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <li key={status}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-white/80">{status}</span>
                        <span className="text-muted-foreground">
                          {count} · {((count / totalOrders) * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${hueFor(status)}`}
                          style={{ width: `${(count / maxStatus) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </Card>

          <Card className="glass-card border-white/10 p-5">
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays size={16} className="text-primary" />
              <CardTitle className="text-sm font-medium tracking-wide text-white">
                Order intake · last 14 days
              </CardTitle>
            </div>
            {daily.every((d) => d.count === 0) ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No orders created in this window.
              </p>
            ) : (
              <div className="flex h-36 items-end gap-1">
                {daily.map((d) => (
                  <div key={d.date} className="group flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      {d.count}
                    </span>
                    <div
                      className="w-full rounded-t bg-primary/70 transition-all group-hover:bg-primary"
                      style={{ height: `${Math.max(3, (d.count / maxDaily) * 100)}%` }}
                      title={`${d.date}: ${d.count} order(s)`}
                    />
                    <span className="text-[9px] text-muted-foreground">{shortDate(d.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="glass-card border-white/10 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Users size={16} className="text-primary" />
              <CardTitle className="text-sm font-medium tracking-wide text-white">
                Top customers
              </CardTitle>
            </div>
            {topCustomers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No customers in scope.</p>
            ) : (
              <ul className="space-y-3">
                {topCustomers.map((c, idx) => (
                  <li key={c.name} className="flex items-center gap-3">
                    <span className="w-4 shrink-0 text-right text-xs text-muted-foreground">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm text-white/90">{c.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatIndustryMoney(c.value, industry)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(c.value / topValue) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{c.orders}×</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
