"use client";

import { Building2, Clock4, Factory, MapPin, Package, TrendingUp, TrendingDown } from "lucide-react";
import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface StatsGridProps {
  totalOrders: number;
  inProgress: number;
  ordersInLocalWarehouse: number;
  awaitingFactory: number;
  ordersInCentralWarehouse: number;
}

// Generate some random sparkline data
const generateSparkline = (base: number) => {
  return Array.from({ length: 14 }).map((_, i) => ({
    value: base + Math.random() * (base * 0.5) - (base * 0.25)
  }));
};

export function StatsGrid(metrics: StatsGridProps) {
  const items = [
    {
      key: "totalOrders",
      title: "Total Orders",
      icon: Package,
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
      href: "/dashboard/orders",
      trend: "+12.5%",
      trendUp: true,
      sparkline: generateSparkline(100),
      sparkColor: "#22d3ee"
    },
    {
      key: "inProgress",
      title: "In Progress",
      icon: Clock4,
      color: "text-indigo-400",
      bg: "bg-indigo-400/10",
      href: "/dashboard/orders?view=in-progress",
      trend: "+4.2%",
      trendUp: true,
      sparkline: generateSparkline(50),
      sparkColor: "#818cf8"
    },
    {
      key: "ordersInLocalWarehouse",
      title: "Local WH",
      icon: MapPin,
      color: "text-amber-400",
      bg: "bg-amber-400/10",
      href: "/dashboard/orders?view=local-warehouse",
      trend: "-2.1%",
      trendUp: false,
      sparkline: generateSparkline(30),
      sparkColor: "#fbbf24"
    },
    {
      key: "awaitingFactory",
      title: "Awaiting Factory",
      icon: Factory,
      color: "text-orange-400",
      bg: "bg-orange-400/10",
      href: "/dashboard/orders?view=awaiting-factory",
      trend: "+8.9%",
      trendUp: true,
      sparkline: generateSparkline(20),
      sparkColor: "#fb923c"
    },
    {
      key: "ordersInCentralWarehouse",
      title: "Central WH",
      icon: Building2,
      color: "text-emerald-400",
      bg: "bg-emerald-400/10",
      href: "/dashboard/orders?view=central-warehouse",
      trend: "+1.2%",
      trendUp: true,
      sparkline: generateSparkline(80),
      sparkColor: "#34d399"
    },
  ] as const;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        // @ts-ignore
        const val = metrics[item.key] as number;
        return (
          <Link key={item.key} href={item.href} className="group block h-full">
            <Card className="glass-card relative flex h-full flex-col hover:-translate-y-1 hover:border-primary/30 transition-all p-5 shadow-lg overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.bg} border border-white/5`}>
                  <Icon className={item.color} size={20} />
                </div>
                <div className={`flex items-center gap-1 text-xs font-semibold ${item.trendUp ? 'text-success' : 'text-destructive'}`}>
                  {item.trendUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {item.trend}
                </div>
              </div>
              
              <p className="text-3xl font-bold tracking-tight text-white mb-1">{val}</p>
              <CardTitle className="text-sm font-medium tracking-wide text-muted-foreground">{item.title}</CardTitle>
              
              <div className="absolute bottom-0 left-0 right-0 h-16 opacity-30 group-hover:opacity-100 transition-opacity pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={item.sparkline}>
                    <Line type="monotone" dataKey="value" stroke={item.sparkColor} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
