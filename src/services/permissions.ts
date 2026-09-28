import type { AppRole } from "@/types/auth";

export function canAccessSection(role: AppRole, section: string) {
  if (role === "admin") return true;
  if (role === "manager") {
    return ["dashboard", "orders", "inventory", "chatbot", "account", "customers", "insights", "reports", "whatsapp"].includes(section);
  }
  if (role === "analyst") {
    return [
      "dashboard",
      "orders",
      "inventory",
      "chatbot",
      "account",
      "alerts",
      "customers",
      "insights",
      "reports",
      "whatsapp",
    ].includes(section);
  }
  return false;
}

/** Sidebar keys, in navigation order. Kept in sync with nav-items.ts. */
export const SECTION_LABELS: Array<{ key: string; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "orders", label: "Operations" },
  { key: "inventory", label: "Inventory" },
  { key: "customers", label: "Customers" },
  { key: "insights", label: "Analytics" },
  { key: "chatbot", label: "Assistant" },
  { key: "reports", label: "Reports" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "alerts", label: "Alerts" },
  { key: "account", label: "Settings" },
];

export type WriteCapability = {
  label: string;
  detail: string;
  admin: boolean;
  manager: boolean;
  analyst: boolean;
};

/**
 * Write/admin capabilities, transcribed from the actual guards in the API
 * routes (not aspirational — each row names where it is enforced).
 */
export const WRITE_CAPABILITIES: WriteCapability[] = [
  { label: "Edit AI provider keys", detail: "/api/settings/* — admin only", admin: true, manager: false, analyst: false },
  { label: "Manage team roles", detail: "/api/roles — admin only", admin: true, manager: false, analyst: false },
  { label: "Create customers", detail: "/api/dashboard/customers POST — admin or manager", admin: true, manager: true, analyst: false },
  { label: "Update own profile", detail: "/api/account/profile POST — self", admin: true, manager: true, analyst: true },
  { label: "Change own password", detail: "/api/account/password POST — self", admin: true, manager: true, analyst: true },
  { label: "Ask the assistant", detail: "/api/chat — scoped by warehouse", admin: true, manager: true, analyst: true },
];

export type PermissionMatrix = {
  sections: Array<{ key: string; label: string; admin: boolean; manager: boolean; analyst: boolean }>;
  writes: WriteCapability[];
  scope: Array<{ role: AppRole; label: string; detail: string }>;
};

/** The permission model the UI should display — derived from real guards. */
export function getPermissionMatrix(): PermissionMatrix {
  return {
    sections: SECTION_LABELS.map((s) => ({
      ...s,
      admin: canAccessSection("admin", s.key),
      manager: canAccessSection("manager", s.key),
      analyst: canAccessSection("analyst", s.key),
    })),
    writes: WRITE_CAPABILITIES,
    scope: [
      { role: "admin", label: "Admin", detail: "All warehouses, all records" },
      { role: "manager", label: "Manager", detail: "Assigned warehouse only" },
      { role: "analyst", label: "Analyst", detail: "Assigned warehouse only" },
    ],
  };
}
