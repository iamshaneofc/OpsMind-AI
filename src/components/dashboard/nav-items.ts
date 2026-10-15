import { AppRole } from "@/types/auth";
import { canAccessSection } from "@/services/permissions";
import {
  LayoutDashboard,
  MessageSquare,
  Package,
  ShoppingCart,
  User,
  LineChart,
  FileText,
  Users,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  group: "workspace" | "intelligence" | "system";
};

export const allItems: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "workspace" },
  { name: "Operations", href: "/dashboard/orders", icon: ShoppingCart, group: "workspace" },
  { name: "Inventory", href: "/dashboard/inventory", icon: Package, group: "workspace" },
  { name: "Customers", href: "/dashboard/customers", icon: Users, group: "workspace" },
  { name: "Insights", href: "/dashboard/insights", icon: LineChart, group: "intelligence" },
  { name: "Assistant", href: "/dashboard/chatbot", icon: MessageSquare, group: "intelligence" },
  { name: "Reports", href: "/dashboard/reports", icon: FileText, group: "intelligence" },
  { name: "WhatsApp", href: "/dashboard/whatsapp", icon: MessageCircle, group: "system" },
  { name: "Settings", href: "/dashboard/account", icon: User, group: "system" },
];

export const NAV_GROUPS: Array<{ id: NavItem["group"]; label: string }> = [
  { id: "workspace", label: "Workspace" },
  { id: "intelligence", label: "Intelligence" },
  { id: "system", label: "System" },
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
