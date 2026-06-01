"use client";

import { useMemo } from "react";
import { OrdersPipelineChart } from "@/components/dashboard/orders-pipeline-chart";
import { OrdersStatusChart } from "@/components/dashboard/orders-status-chart";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { AppRole } from "@/types/auth";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

interface DashboardRealtimeProps {
  role: AppRole;
  companyId: number | null;
  warehouseId: number | null;
  initialMetrics: {
    totalOrders: number;
    inProgress: number;
    ordersInLocalWarehouse: number;
    awaitingFactory: number;
    ordersInCentralWarehouse: number;
    ordersByStatus: Array<{ name: string; value: number }>;
    ordersPipeline: Array<{ name: string; value: number }>;
  };
}

export function DashboardRealtime({
  role,
  companyId,
  warehouseId,
  initialMetrics,
}: DashboardRealtimeProps) {
  const metrics = initialMetrics;

  const topSignals = useMemo(() => {
    const signals: Array<{ label: string; value: number; variant: "secondary" | "warning" | "danger" | "success" }> =
      [];
    if (metrics.awaitingFactory > 0)
      signals.push({ label: "Awaiting factory", value: metrics.awaitingFactory, variant: "warning" });
    if (metrics.ordersInCentralWarehouse > 0)
      signals.push({
        label: "Central warehouse",
        value: metrics.ordersInCentralWarehouse,
        variant: "secondary",
      });
    if (metrics.inProgress > 0) signals.push({ label: "In progress", value: metrics.inProgress, variant: "secondary" });
    if (metrics.ordersInLocalWarehouse > 0)
      signals.push({ label: "Local warehouse", value: metrics.ordersInLocalWarehouse, variant: "success" });
    return signals.slice(0, 4);
  }, [
    metrics.awaitingFactory,
    metrics.inProgress,
    metrics.ordersInCentralWarehouse,
    metrics.ordersInLocalWarehouse,
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Operations Command Center</h1>
          <p className="text-sm text-muted-foreground">
            Scope:{" "}
            <span className="font-medium text-foreground">
              {role === "super_admin"
                ? "All warehouses"
                : role === "warehouse"
                  ? `Warehouse ${warehouseId ?? "—"}`
                  : `Company ${companyId ?? "—"}`}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {topSignals.map((s) => (
            <Badge key={s.label} variant={s.variant} className="text-sm">
              {s.label}: {s.value}
            </Badge>
          ))}
        </div>
      </div>

      <StatsGrid
        totalOrders={metrics.totalOrders}
        inProgress={metrics.inProgress}
        ordersInLocalWarehouse={metrics.ordersInLocalWarehouse}
        awaitingFactory={metrics.awaitingFactory}
        ordersInCentralWarehouse={metrics.ordersInCentralWarehouse}
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <OrdersStatusChart
          data={metrics.ordersByStatus.length ? metrics.ordersByStatus : [{ name: "No Data", value: 1 }]}
        />

        <OrdersPipelineChart data={metrics.ordersPipeline} />

        <Card className="h-[360px] flex flex-col">
          <CardTitle>Recommended actions</CardTitle>
          <CardDescription className="mt-2">
            Next steps aligned with your order pipeline (same data as the Orders tab).
          </CardDescription>

          <div className="mt-5 space-y-3">
            <div className="rounded-lg border border-border/70 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Review in-progress orders</p>
                  <p className="text-xs text-muted-foreground">Open the preset that matches the KPI definition.</p>
                </div>
                <a
                  href="/dashboard/orders?view=in-progress"
                  className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"
                >
                  Open <ArrowRight size={16} />
                </a>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Check factory requests</p>
                  <p className="text-xs text-muted-foreground">Orders waiting on factory processing.</p>
                </div>
                <a
                  href="/dashboard/orders?view=awaiting-factory"
                  className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"
                >
                  Open <ArrowRight size={16} />
                </a>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Ask the bot about orders</p>
                  <p className="text-xs text-muted-foreground">
                    “Show delayed orders” · “Order status for SO…” · “Orders by warehouse”
                  </p>
                </div>
                <a
                  href="/dashboard/chatbot"
                  className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200"
                >
                  Open <ArrowRight size={16} />
                </a>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-4 text-xs text-muted-foreground">
            Product availability lives under Products (stock view).
          </div>
        </Card>
      </div>
    </div>
  );
}
