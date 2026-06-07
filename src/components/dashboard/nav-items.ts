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
  { name: "Operations", href: "/dashboard/orders", icon: ShoppingCart },
  { name: "Inventory", href: "/dashboard/inventory", icon: Package },
  { name: "Customers", href: "/dashboard/customers", icon: Users },
  { name: "Analytics", href: "/dashboard/insights", icon: LineChart },
  { name: "Assistant", href: "/dashboard/chatbot", icon: MessageSquare },
  { name: "Reports", href: "/dashboard/reports", icon: FileText },
  { name: "Settings", href: "/dashboard/account", icon: User },
];

export function getNavItems(role: AppRole) {
  return allItems;
}
