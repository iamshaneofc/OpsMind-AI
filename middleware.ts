import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/supabase/middleware";
import { canAccessPath } from "@/auth/role-guard";
import type { AppRole } from "@/types/auth";

export async function middleware(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);
  
  console.log("MIDDLEWARE URL:", request.nextUrl.pathname);
  console.log("MIDDLEWARE USER:", user?.id || "null");
  console.log("MIDDLEWARE COOKIES:", request.cookies.getAll().map(c => c.name));

  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const email = user.email ?? "";
    let role: AppRole = "manager"; // default
    if (email.includes("admin")) role = "admin";
    else if (email.includes("warehouse") || email.includes("analyst")) role = "analyst";
    else if (email.includes("distributor") || email.includes("manager")) role = "manager";

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
