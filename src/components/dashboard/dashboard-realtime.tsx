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
          <h1 className="bg-gradient-to-br from-white to-white/50 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            Operations Command Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Scope:{" "}
            <span className="font-medium text-foreground">
              {role === "admin"
                ? "All warehouses"
                : role === "analyst"
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

        <Card className="glass-card h-[400px] flex flex-col p-6">
          <CardTitle className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/20 text-primary">
              <ArrowRight size={14} />
            </span>
            Recommended Actions
          </CardTitle>
          <CardDescription className="mt-2 text-sm">
            Next steps aligned with your order pipeline (same data as the Orders tab).
          </CardDescription>

          <div className="mt-5 space-y-4">
            <div className="group relative rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent p-4 transition-all hover:bg-white/[0.05] hover:border-white/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Review in-progress orders</p>
                  <p className="text-xs text-muted-foreground mt-1">Open the preset that matches the KPI definition.</p>
                </div>
                <a
                  href="/dashboard/orders?view=in-progress"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/20 group-hover:text-primary-foreground"
                >
                  <ArrowRight size={16} />
                </a>
              </div>
            </div>

            <div className="group relative rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent p-4 transition-all hover:bg-white/[0.05] hover:border-white/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Check factory requests</p>
                  <p className="text-xs text-muted-foreground mt-1">Orders waiting on factory processing.</p>
                </div>
                <a
                  href="/dashboard/orders?view=awaiting-factory"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/20 group-hover:text-primary-foreground"
                >
                  <ArrowRight size={16} />
                </a>
              </div>
            </div>

            <div className="group relative rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent p-4 transition-all hover:bg-white/[0.05] hover:border-white/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Ask the AI Copilot</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    “Show delayed orders” · “Order status for SO…”
                  </p>
                </div>
                <a
                  href="/dashboard/chatbot"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/20 group-hover:text-primary-foreground"
                >
                  <ArrowRight size={16} />
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
