import { AppRole } from "@/types/auth";
import {
  LayoutDashboard,
  MessageSquare,
  Package,
  ShoppingCart,
  User,
  Bell,
} from "lucide-react";

export const allItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Orders", href: "/dashboard/orders", icon: ShoppingCart },
  { name: "Inventory", href: "/dashboard/inventory", icon: Package },
  { name: "Chatbot", href: "/dashboard/chatbot", icon: MessageSquare },
  { name: "Alerts", href: "/dashboard/alerts", icon: Bell },
  { name: "Account", href: "/dashboard/account", icon: User },
];

export function getNavItems(role: AppRole) {
  if (role === "admin") {
    return allItems;
  }
  if (role === "manager") {
    return allItems.filter((item) =>
      ["/dashboard", "/dashboard/orders", "/dashboard/inventory", "/dashboard/chatbot", "/dashboard/account"].includes(
        item.href,
      ),
    );
  }
  if (role === "analyst") {
    return allItems.filter((item) =>
      ["/dashboard", "/dashboard/orders", "/dashboard/inventory", "/dashboard/chatbot", "/dashboard/account", "/dashboard/alerts"].includes(
        item.href,
      ),
    );
  }
  return [];
}
