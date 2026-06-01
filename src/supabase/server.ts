import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/supabase/env";

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Safe during server rendering where response cookies are not mutable.
        }
      },
    },
    global: {
      // Prevent Next.js Data Cache from serving stale Supabase responses
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
