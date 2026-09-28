import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/supabase/server";
import type { AppRole, UserProfile } from "@/types/auth";

export function mapRoleIdToAppRole(roleId: number | null | undefined): AppRole {
  if (roleId === 1) return "admin";
  if (roleId === 2) return "manager";
  if (roleId === 3) return "analyst";
  return "manager";
}

import { prisma } from "@/lib/db";

interface ScopeRow {
  role: string | null;
  company_id: string | null;
  warehouse_id: string | null;
}

const EMPTY_SCOPE: ScopeRow = { role: null, company_id: null, warehouse_id: null };

// Single round trip. Cross-region Postgres costs ~150ms per query, so role,
// company scope and the warehouse bridge are resolved in one statement instead
// of three sequential ones.
async function loadScope(email: string): Promise<ScopeRow> {
  try {
    const rows = await prisma.$queryRaw<ScopeRow[]>`
      SELECT
        ur.role            AS role,
        u.company_id::text AS company_id,
        w2.id::text        AS warehouse_id
      FROM (SELECT ${email}::text AS email) e
      LEFT JOIN "UserRole"  ur ON ur.email = e.email
      LEFT JOIN users       u  ON u.email  = e.email
      LEFT JOIN warehouses  w1 ON w1.id    = u.warehouse_id
      LEFT JOIN "Warehouse" w2 ON w2.name  = w1.name
      LIMIT 1
    `;
    return rows[0] ?? EMPTY_SCOPE;
  } catch (e) {
    console.error("Error fetching user scope from DB:", e);
    return EMPTY_SCOPE;
  }
}

export const getCurrentUserProfile = cache(
  async (): Promise<{ userId: string; profile: UserProfile } | null> => {
    const supabase = createSupabaseServerClient();

    // getSession() reads the cookie locally with no network call, so the DB
    // query can start immediately instead of waiting behind getUser(), which
    // is a ~200ms cross-region round trip.
    const { data: { session } } = await supabase.auth.getSession();
    const speculativeEmail = session?.user?.email ?? null;

    const authPromise = supabase.auth.getUser();
    const scopePromise = speculativeEmail ? loadScope(speculativeEmail) : null;

    const {
      data: { user },
    } = await authPromise;

    if (!user) return null;

    const email = user.email ?? "";

    // Only reuse the speculative scope when it was loaded for the same identity
    // getUser() just validated. A tampered cookie can make getSession()'s
    // (unverified, storage-derived) email differ from the verified one — in that
    // case fall back to loading scope for the verified email rather than
    // trusting the forgery. Legitimate sessions always match, so this stays a
    // single round trip in practice.
    const scope =
      scopePromise && speculativeEmail === email
        ? await scopePromise
        : await loadScope(email);

    let role: AppRole = "manager";

    if (scope.role) {
      const dbRole = scope.role.toLowerCase();
      if (dbRole === "admin" || dbRole === "manager" || dbRole === "analyst") {
        role = dbRole as AppRole;
      }
    } else {
      if (email.includes("admin")) role = "admin";
      else if (email.includes("warehouse") || email.includes("analyst")) role = "analyst";

      await prisma.userRole
        .create({ data: { email, role: role.toUpperCase() } })
        .catch((e) => console.error("Failed to auto-create UserRole:", e));
    }

    const profile: UserProfile = {
      user_id: user.id,
      email: email,
      full_name: email.split("@")[0],
      role_id: role === "admin" ? 1 : role === "manager" ? 2 : 3,
      role: role,
      company_id: scope.company_id,
      warehouse_id: scope.warehouse_id,
    };

    return {
      userId: profile.user_id,
      profile,
    };
  },
);

export async function requireAuthenticatedUser() {
  const result = await getCurrentUserProfile();
  if (!result) redirect("/login");
  return result;
}

export function canAccessSection(role: AppRole, section: string) {
  if (role === "admin") return true;
  if (role === "manager") {
    return ["dashboard", "orders", "inventory", "chatbot", "account", "customers", "insights", "reports"].includes(section);
  }
  if (role === "analyst") {
    return ["", "orders", "inventory", "chatbot", "account", "alerts", "customers", "insights", "reports"].includes(
      section,
    );
  }
  return false;
}
