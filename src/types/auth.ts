export type AppRole = "admin" | "manager" | "analyst";

export interface UserProfile {
  user_id: number;
  email: string;
  full_name: string | null;
  role: AppRole;
  role_id: number;
  company_id: number | null;
  warehouse_id: number | null;
  /** ERP Location_id from public.companies.base_warehouse_id — primary warehouse for this distributor company */
  base_warehouse_id: number | null;
  /** ERP dbo.sales_order_header.account_id — set on public.companies.erp_account_id */
  erp_account_id: number | null;
  /** Multiple ERP account IDs — public.companies.erp_account_ids (overrides erp_account_id when set) */
  erp_account_ids: number[] | null;
}
