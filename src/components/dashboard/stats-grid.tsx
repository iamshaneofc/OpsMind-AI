"use client";

import type { ReactNode } from "react";
import { Clock4, Factory, Package, TrendingUp, Wallet, Users } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils/cn";

interface StatsGridProps {
  role?: string;
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
}

function inr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function toneForHealth(score: number) {
  if (score >= 70) return { bar: "bg-emerald-400", text: "text-emerald-300", label: "Healthy" };
  if (score >= 45) return { bar: "bg-amber-400", text: "text-amber-300", label: "Watch" };
  return { bar: "bg-rose-400", text: "text-rose-300", label: "At risk" };
}

function toneForFulfillment(rate: number) {
  if (rate >= 70) return { bar: "bg-emerald-400", text: "text-emerald-300" };
  if (rate >= 45) return { bar: "bg-amber-400", text: "text-amber-300" };
  return { bar: "bg-rose-400", text: "text-rose-300" };
}

export function StatsGrid(metrics: StatsGridProps) {
  const inv = toneForHealth(metrics.inventoryHealth);
  const ful = toneForFulfillment(metrics.fulfillmentRate);

  const allItems = [
    {
      key: "revenue" as const,
      title: "Order value",
      hint: "Open + closed order total",
      icon: TrendingUp,
      iconWrap: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20",
      href: "/dashboard/orders",
      displayValue: inr(metrics.revenue),
      footer: null as ReactNode,
    },
    {
      key: "profit" as const,
      title: "Collected",
      hint: "Paid invoices",
      icon: Wallet,
      iconWrap: "bg-sky-500/15 text-sky-300 ring-sky-500/20",
      href: "/dashboard/insights",
      displayValue: inr(metrics.profit),
      footer: null,
    },
    {
      key: "totalOrders" as const,
      title: "Orders",
      hint: `${metrics.inProgress.toLocaleString()} in progress`,
      icon: Package,
      iconWrap: "bg-primary/15 text-primary ring-primary/25",
      href: "/dashboard/orders",
      displayValue: metrics.totalOrders.toLocaleString("en-IN"),
      footer: null,
    },
    {
      key: "inventoryHealth" as const,
      title: "Inventory health",
      hint: inv.label,
      icon: Factory,
      iconWrap: "bg-amber-500/15 text-amber-300 ring-amber-500/20",
      href: "/dashboard/inventory?view=low-stock",
      displayValue: `${metrics.inventoryHealth}`,
      footer: (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Score</span>
            <span className={inv.text}>/ 100</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn("h-full rounded-full transition-all", inv.bar)}
              style={{ width: `${Math.min(100, Math.max(0, metrics.inventoryHealth))}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: "fulfillmentRate" as const,
      title: "Fulfillment",
      hint: "Delivered / total",
      icon: Clock4,
      iconWrap: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/20",
      href: "/dashboard/orders",
      displayValue: `${metrics.fulfillmentRate.toFixed(1)}%`,
      footer: (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn("h-full rounded-full", ful.bar)}
            style={{ width: `${Math.min(100, Math.max(0, metrics.fulfillmentRate))}%` }}
          />
        </div>
      ),
    },
    {
      key: "customerGrowth" as const,
      title: "Accounts",
      hint: "Active industry book",
      icon: Users,
      iconWrap: "bg-teal-500/15 text-teal-300 ring-teal-500/20",
      href: "/dashboard/customers",
      displayValue: metrics.customerGrowth.toLocaleString("en-IN"),
      footer: null,
    },
  ];

  const items =
    metrics.role === "analyst"
      ? allItems.filter((item) => item.key !== "revenue" && item.key !== "profit")
      : allItems;

  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 xl:grid-cols-3",
        metrics.role === "analyst" ? "2xl:grid-cols-4" : "2xl:grid-cols-6",
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.key} href={item.href} className="group block h-full">
            <Card className="glass-card relative flex h-full flex-col overflow-hidden border-white/10 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_12px_40px_-20px_rgba(59,130,246,0.45)]">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl ring-1",
                    item.iconWrap,
                  )}
                >
                  <Icon size={18} />
                </div>
              </div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {item.title}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-white tabular-nums sm:text-[1.65rem]">
                {item.displayValue}
                {item.key === "inventoryHealth" ? (
                  <span className="ml-1 text-sm font-medium text-muted-foreground">/100</span>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/90">{item.hint}</p>
              {item.footer}
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
