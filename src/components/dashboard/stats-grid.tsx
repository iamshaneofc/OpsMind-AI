import { Building2, Clock4, Factory, MapPin, Package } from "lucide-react";
import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

interface StatsGridProps {
  totalOrders: number;
  inProgress: number;
  ordersInLocalWarehouse: number;
  awaitingFactory: number;
  ordersInCentralWarehouse: number;
}

const items = [
  {
    key: "totalOrders",
    title: "Total Orders",
    icon: Package,
    color: "text-cyan-300",
    href: "/dashboard/orders",
  },
  {
    key: "inProgress",
    title: "Orders In Progress",
    icon: Clock4,
    color: "text-indigo-300",
    href: "/dashboard/orders?view=in-progress",
  },
  {
    key: "ordersInLocalWarehouse",
    title: "Orders in Local Warehouse",
    icon: MapPin,
    color: "text-amber-300",
    href: "/dashboard/orders?view=local-warehouse",
  },
  {
    key: "awaitingFactory",
    title: "Awaiting Factory",
    icon: Factory,
    color: "text-orange-300",
    href: "/dashboard/orders?view=awaiting-factory",
  },
  {
    key: "ordersInCentralWarehouse",
    title: "Orders in Central Warehouse",
    icon: Building2,
    color: "text-emerald-300",
    href: "/dashboard/orders?view=central-warehouse",
  },
] as const;

export function StatsGrid(metrics: StatsGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.key} href={item.href} className="group relative">
            <div className={`absolute -inset-0.5 rounded-xl bg-gradient-to-r ${item.color.replace('text-', 'from-').replace('-300', '-600')} to-transparent opacity-0 blur transition duration-500 group-hover:opacity-30`}></div>
            <Card className="glass-panel relative flex h-full flex-col p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20">
              <div className="mb-4 flex items-center justify-between">
                <CardTitle className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{item.title}</CardTitle>
                <div className={`rounded-full bg-slate-900/50 p-2 shadow-inner border border-white/5`}>
                  <Icon className={item.color} size={18} />
                </div>
              </div>
              <p className="mt-auto text-4xl font-bold tracking-tight text-white">{metrics[item.key]}</p>
              <CardDescription className="mt-2 text-xs flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                View matching records <span className="ml-1 text-cyan-400 font-medium">→</span>
              </CardDescription>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
