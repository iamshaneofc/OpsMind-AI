import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/supabase/env";

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = getSupabaseEnv();

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      // Force no-cache so Next.js Data Cache never serves stale Supabase data
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
