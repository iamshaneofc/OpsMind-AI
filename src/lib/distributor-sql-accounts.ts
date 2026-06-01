import type { UserProfile } from "@/types/auth";

/**
 * Resolves which ERP `sales_order_header.account_id` values to use for a distributor.
 * Uses only Supabase `companies.erp_account_ids` or `companies.erp_account_id` (exact SQL ACCOUNT_ID).
 */
export function getDistributorSqlAccountIds(profile: UserProfile): number[] {
  const raw: number[] = [];
  if (profile.erp_account_ids?.length) {
    raw.push(...profile.erp_account_ids);
  } else if (profile.erp_account_id != null && Number.isFinite(profile.erp_account_id)) {
    raw.push(Number(profile.erp_account_id));
  }
  return Array.from(new Set(raw.map((n) => Math.trunc(n)).filter((n) => Number.isInteger(n) && n > 0)));
}
