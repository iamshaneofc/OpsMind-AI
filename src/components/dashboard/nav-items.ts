import {
  AlertTriangle,
  Boxes,
  Bot,
  LayoutDashboard,
  PackageSearch,
  UserCircle2,
} from "lucide-react";
import type { AppRole } from "@/types/auth";

export interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
}

const allItems: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Orders", href: "/dashboard/orders", icon: PackageSearch },
  { name: "Product List", href: "/dashboard/inventory", icon: Boxes },
  { name: "Chatbot", href: "/dashboard/chatbot", icon: Bot },
  { name: "Alerts", href: "/dashboard/alerts", icon: AlertTriangle },
  { name: "Account", href: "/dashboard/account", icon: UserCircle2 },
];

export function getNavItems(role: AppRole) {
  if (role === "super_admin") return allItems;
  if (role === "distributor") {
    return allItems.filter((item) =>
      ["/dashboard", "/dashboard/orders", "/dashboard/inventory", "/dashboard/chatbot", "/dashboard/account"].includes(
        item.href,
      ),
    );
  }
  return allItems.filter((item) =>
    [
      "/dashboard",
      "/dashboard/orders",
      "/dashboard/inventory",
      "/dashboard/chatbot",
      "/dashboard/alerts",
      "/dashboard/account",
    ].includes(item.href),
  );
}
