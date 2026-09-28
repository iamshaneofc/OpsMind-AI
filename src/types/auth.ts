export type AppRole = "admin" | "manager" | "analyst";

export interface UserProfile {
  user_id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  role_id: number;
  company_id: string | null;
  warehouse_id: string | null;
}
