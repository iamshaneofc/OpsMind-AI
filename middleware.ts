import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/supabase/middleware";
import { canAccessPath } from "@/auth/role-guard";
import type { AppRole } from "@/types/auth";

function mapRoleIdToAppRole(roleId: number | null | undefined): AppRole {
  if (roleId === 1) return "super_admin";
  if (roleId === 3) return "warehouse";
  return "distributor";
}

export async function middleware(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);

  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const { data } = await supabase
      .from("users")
      .select("role_id")
      .eq("email", user.email ?? "")
      .single();
    const role = mapRoleIdToAppRole((data?.role_id as number | null) ?? null) as AppRole;
    if (!canAccessPath(role, request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  if (request.nextUrl.pathname.startsWith("/login") && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
