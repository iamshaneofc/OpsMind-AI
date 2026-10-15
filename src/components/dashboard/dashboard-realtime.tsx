"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { Card, CardTitle } from "@/components/ui/card";
import type { AppRole } from "@/types/auth";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Package,
  Sparkles,
  Truck,
} from "lucide-react";
import { cn } from "@/utils/cn";

interface DashboardRealtimeProps {
  role: AppRole;
  companyId: string | null;
  warehouseId: string | null;
  email?: string;
  companyName?: string;
  industryLabel?: string;
  initialMetrics: {
    totalOrders: number;
    inProgress: number;
    ordersInLocalWarehouse: number;
    awaitingFactory: number;
    ordersInCentralWarehouse: number;
    revenue: number;
    profit: number;
    inventoryHealth: number;
    fulfillmentRate: number;
    customerGrowth: number;
    ordersByStatus: Array<{ name: string; value: number }>;
    ordersPipeline: Array<{ name: string; value: number }>;
  };
}

function greetingForHour(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function inr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function DashboardRealtime({
  role,
  email,
  companyName = "OpsMind",
  industryLabel = "Operations",
  initialMetrics,
}: DashboardRealtimeProps) {
  const metrics = initialMetrics;
  const firstName = email
    ? email.split("@")[0].replace(/[^a-zA-Z]/g, " ").split(" ")[0]
    : "Executive";
  const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  const priorityChips = [
    {
      label: "Delayed / factory",
      value: metrics.awaitingFactory,
      href: "/dashboard/orders",
      tone: "text-amber-200 bg-amber-500/10 ring-amber-500/25",
    },
    {
      label: "In progress",
      value: metrics.inProgress,
      href: "/dashboard/orders?view=in-progress",
      tone: "text-sky-200 bg-sky-500/10 ring-sky-500/25",
    },
    {
      label: "Local warehouse",
      value: metrics.ordersInLocalWarehouse,
      href: "/dashboard/orders",
      tone: "text-emerald-200 bg-emerald-500/10 ring-emerald-500/25",
    },
  ].filter((c) => c.value > 0);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.02] to-transparent p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/90">
              {industryLabel} · {companyName}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {greetingForHour()}, {capitalizedName}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Live snapshot of orders, stock, and collections. Ask OpsMind to dig into any number.
            </p>
            {priorityChips.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-2">
                {priorityChips.map((chip) => (
                  <Link
                    key={chip.label}
                    href={chip.href}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 transition hover:brightness-110",
                      chip.tone,
                    )}
                  >
                    <span className="tabular-nums font-semibold">{chip.value}</span>
                    {chip.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/chatbot"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_10px_30px_-12px_rgba(59,130,246,0.8)] transition hover:bg-primary/90"
            >
              <MessageSquare size={16} />
              Ask Assistant
            </Link>
            <Link
              href="/dashboard/insights"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/90 transition hover:bg-white/10"
            >
              <Sparkles size={16} className="text-amber-300" />
              Today&apos;s tips
            </Link>
          </div>
        </div>
      </section>

      <StatsGrid
        role={role}
        totalOrders={metrics.totalOrders}
        inProgress={metrics.inProgress}
        ordersInLocalWarehouse={metrics.ordersInLocalWarehouse}
        awaitingFactory={metrics.awaitingFactory}
        ordersInCentralWarehouse={metrics.ordersInCentralWarehouse}
        revenue={metrics.revenue}
        profit={metrics.profit}
        inventoryHealth={metrics.inventoryHealth}
        fulfillmentRate={metrics.fulfillmentRate}
        customerGrowth={metrics.customerGrowth}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="glass-card border-white/10 p-5 lg:col-span-3">
          <div className="mb-5 flex items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold text-white">Pipeline health</CardTitle>
            <Link
              href="/dashboard/orders"
              className="text-xs font-medium text-primary hover:underline"
            >
              View operations
            </Link>
          </div>
          <div className="space-y-5">
            <HealthRow
              icon={<CheckCircle2 size={14} className="text-emerald-400" />}
              label="Fulfillment rate"
              value={`${metrics.fulfillmentRate.toFixed(1)}%`}
              pct={metrics.fulfillmentRate}
              bar="bg-emerald-400"
            />
            <HealthRow
              icon={<AlertTriangle size={14} className="text-amber-400" />}
              label="Needs attention"
              value={`${metrics.awaitingFactory} delayed / factory`}
              pct={
                metrics.totalOrders > 0
                  ? (metrics.awaitingFactory / metrics.totalOrders) * 100
                  : 0
              }
              bar="bg-amber-400"
            />
            <HealthRow
              icon={<Package size={14} className="text-sky-400" />}
              label="In progress"
              value={`${metrics.inProgress} orders`}
              pct={
                metrics.totalOrders > 0 ? (metrics.inProgress / metrics.totalOrders) * 100 : 0
              }
              bar="bg-sky-400"
            />
            <HealthRow
              icon={<Truck size={14} className="text-primary" />}
              label="Central warehouse"
              value={`${metrics.ordersInCentralWarehouse} orders`}
              pct={
                metrics.totalOrders > 0
                  ? (metrics.ordersInCentralWarehouse / metrics.totalOrders) * 100
                  : 0
              }
              bar="bg-primary"
            />
          </div>
        </Card>

        <Card className="glass-card flex flex-col border-white/10 p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Sparkles size={15} />
            </div>
            <CardTitle className="text-base font-semibold text-white">Ops briefing</CardTitle>
          </div>
          <ul className="flex-1 space-y-4 text-sm leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-white">Book: </span>
              {metrics.totalOrders.toLocaleString("en-IN")} orders · {inr(metrics.revenue)} order
              value · {inr(metrics.profit)} collected.
            </li>
            <li>
              <span className="font-medium text-white">Execution: </span>
              {metrics.fulfillmentRate.toFixed(1)}% delivered. {metrics.inProgress} still moving
              through the pipeline.
            </li>
            <li>
              <span className="font-medium text-white">Risk: </span>
              Inventory health {metrics.inventoryHealth}/100
              {metrics.awaitingFactory > 0
                ? ` · ${metrics.awaitingFactory} lines need chase.`
                : "."}
            </li>
          </ul>
          <Link
            href="/dashboard/chatbot"
            className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white transition hover:border-primary/40 hover:bg-primary/10"
          >
            <span>Ask about delayed orders or low stock</span>
            <ArrowRight size={14} className="text-primary" />
          </Link>
        </Card>
      </div>
    </div>
  );
}

function HealthRow({
  icon,
  label,
  value,
  pct,
  bar,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  pct: number;
  bar: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums text-white">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full", bar)}
          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
        />
      </div>
    </div>
  );
}
