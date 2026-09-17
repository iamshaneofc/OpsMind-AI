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

export const getCurrentUserProfile = cache(
  async (): Promise<{ userId: string; profile: UserProfile } | null> => {
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
        if (email.includes("admin")) role = "admin";
        else if (email.includes("warehouse") || email.includes("analyst")) role = "analyst";
        
        await prisma.userRole.create({
          data: {
            email,
            role: role.toUpperCase(),
          }
        }).catch(e => console.error("Failed to auto-create UserRole:", e));
      }
    } catch (e) {
      console.error("Error fetching UserRole from DB:", e);
      if (email.includes("admin")) role = "admin";
      else if (email.includes("warehouse") || email.includes("analyst")) role = "analyst";
    }

    const profile: UserProfile = {
      user_id: user.id,
      email: email,
      full_name: email.split("@")[0],
      role_id: role === "admin" ? 1 : role === "manager" ? 2 : 3,
      role: role,
      company_id: null,
      warehouse_id: null,
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
