import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/supabase/server";
import type { AppRole, UserProfile } from "@/types/auth";

/** Load ERP account mapping from companies (SQL Server account_id). */
export async function loadCompanyErpAccounts(
  supabase: SupabaseClient,
  companyId: number | null,
): Promise<{
  erp_account_id: number | null;
  erp_account_ids: number[] | null;
  base_warehouse_id: number | null;
}> {
  if (companyId == null) {
    return { erp_account_id: null, erp_account_ids: null, base_warehouse_id: null };
  }
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) {
    return { erp_account_id: null, erp_account_ids: null, base_warehouse_id: null };
  }

  const erp_account_id = (data as any).erp_account_id as number | null;
  const arr = (data as any).erp_account_ids;
  const base_warehouse_id = (data as any).base_warehouse_id as number | null;
  const parsed =
    Array.isArray(arr) && arr.length > 0
      ? (arr as unknown[])
          .map((n) => (typeof n === "number" ? n : Number(n)))
          .filter((n) => Number.isFinite(n) && n > 0)
          .map((n) => Math.trunc(n))
      : [];
  let final_erp_account_ids = parsed.length ? parsed : null;

  let final_erp_account_id = erp_account_id;
  if (!final_erp_account_id && final_erp_account_ids?.length) {
    final_erp_account_id = final_erp_account_ids[0];
  }
  const inferredBaseWarehouseId = null;

  return {
    erp_account_id: final_erp_account_id,
    erp_account_ids: final_erp_account_ids,
    base_warehouse_id: base_warehouse_id ?? inferredBaseWarehouseId,
  };
}

export function mapRoleIdToAppRole(roleId: number | null | undefined): AppRole {
  if (roleId === 1) return "admin";
  if (roleId === 2) return "manager";
  if (roleId === 3) return "analyst";
  return "manager";
}

import { prisma } from "@/lib/db";

export const getCurrentUserProfile = cache(
  async (): Promise<{ userId: number; profile: UserProfile } | null> => {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const email = user.email ?? "";
    let role: AppRole = "manager";
    
    try {
      const userRoleRecord = await prisma.userRole.findUnique({
        where: { email },
      });
      
      if (userRoleRecord) {
        const dbRole = userRoleRecord.role.toLowerCase();
        if (dbRole === "admin" || dbRole === "manager" || dbRole === "analyst") {
          role = dbRole as AppRole;
        }
      } else {
        // Fallback or auto-create basic role based on email if we still want that? No, just default to manager.
        // Or if email contains admin just for bootstrapping:
        if (email.includes("admin")) role = "admin";
        else if (email.includes("warehouse") || email.includes("analyst")) role = "analyst";
        
        // Auto-create record so they show up in settings
        await prisma.userRole.create({
          data: {
            email,
            role: role.toUpperCase(),
          }
        }).catch(e => console.error("Failed to auto-create UserRole:", e));
      }
    } catch (e) {
      console.error("Error fetching UserRole from DB:", e);
      // Fallback to email logic
      if (email.includes("admin")) role = "admin";
      else if (email.includes("warehouse") || email.includes("analyst")) role = "analyst";
    }

    const profile: UserProfile = {
      user_id: 1,
      email: email,
      full_name: email.split("@")[0],
      role_id: role === "admin" ? 1 : role === "manager" ? 2 : 3,
      role: role,
      company_id: null,
      warehouse_id: null,
      base_warehouse_id: null,
      erp_account_id: null,
      erp_account_ids: null,
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
