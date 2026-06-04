import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/supabase/env";

export async function updateSession(request: NextRequest) {
  console.log("--> updateSession called for:", request.nextUrl.pathname);
  console.log("--> Request Cookies:", request.cookies.getAll().map(c => c.name));
  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  console.log("--> getUser result:", { user_id: data?.user?.id, error: error?.message });
  return { response, user: data.user, supabase };
}
