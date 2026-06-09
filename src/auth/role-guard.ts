import type { AppRole } from "@/types/auth";

export function canAccessPath(role: AppRole, path: string) {
  if (role === "admin") return true;
  if (role === "manager") {
    return (
      path === "/dashboard" ||
      path.startsWith("/dashboard/orders") ||
      path.startsWith("/dashboard/inventory") ||
      path.startsWith("/dashboard/chatbot") ||
      path.startsWith("/dashboard/account") ||
      path.startsWith("/dashboard/customers") ||
      path.startsWith("/dashboard/insights") ||
      path.startsWith("/dashboard/reports")
    );
  }
  if (role === "analyst") {
    return (
      path === "/dashboard" ||
      path.startsWith("/dashboard/orders") ||
      path.startsWith("/dashboard/inventory") ||
      path.startsWith("/dashboard/chatbot") ||
      path.startsWith("/dashboard/alerts") ||
      path.startsWith("/dashboard/account") ||
      path.startsWith("/dashboard/customers") ||
      path.startsWith("/dashboard/insights") ||
      path.startsWith("/dashboard/reports")
    );
  }
  return false;
}
