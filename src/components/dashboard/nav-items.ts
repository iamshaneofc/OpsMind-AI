import { AppRole } from "@/types/auth";
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
  { name: "AI Copilot", href: "/dashboard/chatbot", icon: MessageSquare },
  { name: "Orders", href: "/dashboard/orders", icon: ShoppingCart },
  { name: "Inventory", href: "/dashboard/inventory", icon: Package },
  { name: "Customers", href: "/dashboard/customers", icon: Users },
  { name: "Insights Hub", href: "/dashboard/insights", icon: LineChart },
  { name: "Reports", href: "/dashboard/reports", icon: FileText },
  { name: "Account", href: "/dashboard/account", icon: User },
];

export function getNavItems(role: AppRole) {
  return allItems;
}
