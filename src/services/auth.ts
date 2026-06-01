import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/supabase/server";
import type { AppRole, UserProfile } from "@/types/auth";

async function inferBaseWarehouseIdFromErp(erpAccountIds: number[]): Promise<number | null> {
  if (!erpAccountIds.length) return null;
  try {
    const { querySqlServer } = await import("@/sql-server/client");
    const inList = erpAccountIds
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => Math.trunc(n));
    if (!inList.length) return null;

    const { data, error } = await querySqlServer<{ analysis_id: number | null; cnt: number }>(
      `SELECT TOP 1
         h.analysis_id,
         COUNT(1) AS cnt
       FROM dbo.sales_order_header h
       WHERE h.account_id IN (${inList.join(",")})
         AND h.analysis_id IS NOT NULL
       GROUP BY h.analysis_id
       ORDER BY cnt DESC, h.analysis_id ASC`,
    );
    if (error || !data?.length) return null;
    const id = Number(data[0].analysis_id);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch (e) {
    console.warn("ERP base warehouse inference failed:", e);
    return null;
  }
}

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


  if (!final_erp_account_ids && data.company_name) {
    try {
      const { querySqlServer } = await import("@/sql-server/client");
      let searchStr = String(data.company_name).trim().toLowerCase();
      let nameSearch = `%${String(data.company_name).trim()}%`;
      
      // Handle known typos/mismatches between Supabase and ERP
      if (searchStr.includes("vijay") && searchStr.includes("life")) {
        nameSearch = "%Viraj Life Science%";
      } else if (searchStr.includes("krishna")) {
        nameSearch = "%Krisshna Enterprise%";
      }

      const sqlRes = await querySqlServer<{ ACCOUNT_ID: number }>(
        `SELECT ACCOUNT_ID FROM dbo.ACCOUNT_MASTER WHERE LTRIM(RTRIM(FULL_NAME)) LIKE @s COLLATE SQL_Latin1_General_CP1_CI_AI`,
        { s: nameSearch },
      );
      if (sqlRes.data && sqlRes.data.length > 0) {
        final_erp_account_ids = sqlRes.data.map((r) => Number(r.ACCOUNT_ID));
      }
    } catch (e) {
      console.warn("Dynamic ERP account lookup failed:", e);
    }
  }

  let final_erp_account_id = erp_account_id;
  if (!final_erp_account_id && final_erp_account_ids?.length) {
    final_erp_account_id = final_erp_account_ids[0];
  }
  const inferredBaseWarehouseId =
    base_warehouse_id == null && final_erp_account_ids?.length
      ? await inferBaseWarehouseIdFromErp(final_erp_account_ids)
      : null;

  return {
    erp_account_id: final_erp_account_id,
    erp_account_ids: final_erp_account_ids,
    base_warehouse_id: base_warehouse_id ?? inferredBaseWarehouseId,
  };
}

export function mapRoleIdToAppRole(roleId: number | null | undefined): AppRole {
  if (roleId === 1) return "super_admin";
  if (roleId === 3) return "warehouse";
  return "distributor";
}

export const getCurrentUserProfile = cache(
  async (): Promise<{ userId: number; profile: UserProfile } | null> => {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data, error } = await supabase
      .from("users")
      .select("user_id,email,name,role_id,company_id,warehouse_id")
      .eq("email", user.email ?? "")
      .single();

    if (error || !data) return null;

    const companyId = (data.company_id as number | null) ?? null;
    const erp = await loadCompanyErpAccounts(supabase, companyId);

    const profile: UserProfile = {
      user_id: data.user_id as number,
      email: data.email as string,
      full_name: (data.name as string | null) ?? null,
      role_id: data.role_id as number,
      role: mapRoleIdToAppRole(data.role_id as number),
      company_id: companyId,
      warehouse_id: (data.warehouse_id as number | null) ?? null,
      base_warehouse_id: erp.base_warehouse_id,
      erp_account_id: erp.erp_account_id,
      erp_account_ids: erp.erp_account_ids,
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
  if (role === "super_admin") return true;
  if (role === "distributor") {
    return ["", "orders", "inventory", "chatbot", "account"].includes(section);
  }
  if (role === "warehouse") {
    return ["", "orders", "inventory", "chatbot", "account", "alerts"].includes(
      section,
    );
  }
  return false;
}
