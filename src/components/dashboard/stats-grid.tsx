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
          <Link key={item.key} href={item.href} className="group">
            <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:shadow-[0_0_48px_-20px_rgba(56,189,248,0.6)]">
              <div className="mb-3 flex items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground">{item.title}</CardTitle>
                <Icon className={item.color} size={18} />
              </div>
              <p className="text-3xl font-semibold">{metrics[item.key]}</p>
              <CardDescription className="mt-1">
                Same list as Orders tab <span className="ml-1 text-cyan-300 group-hover:text-cyan-200">Open</span>
              </CardDescription>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
