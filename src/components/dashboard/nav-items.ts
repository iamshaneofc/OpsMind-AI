import { AppRole } from "@/types/auth";
import { canAccessSection } from "@/services/permissions";
import {
  LayoutDashboard,
  MessageSquare,
  Package,
  ShoppingCart,
  User,
  Bell,
  LineChart,
  FileText,
  Users,
} from "lucide-react";

export const allItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Operations", href: "/dashboard/orders", icon: ShoppingCart },
  { name: "Inventory", href: "/dashboard/inventory", icon: Package },
  { name: "Customers", href: "/dashboard/customers", icon: Users },
  { name: "Analytics", href: "/dashboard/insights", icon: LineChart },
  { name: "Assistant", href: "/dashboard/chatbot", icon: MessageSquare },
  { name: "Reports", href: "/dashboard/reports", icon: FileText },
  { name: "Settings", href: "/dashboard/account", icon: User },
];

/** Map a nav href to the section key used by canAccessSection(). */
function sectionKeyFor(href: string): string {
  const parts = href.split("/").filter(Boolean);
  if (parts.length <= 1) return "dashboard";
  return parts[parts.length - 1];
}

export function getNavItems(role: AppRole) {
  // Nav visibility is derived from the same canAccessSection() guard the
  // permissions matrix displays, so the two can never disagree.
  return allItems.filter((item) => canAccessSection(role, sectionKeyFor(item.href)));
}
