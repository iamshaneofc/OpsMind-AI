export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.",
    );
  }

  // Read browser-safe values only. Never read SUPABABASE_SERVICE_ROLE_KEY here:
  // this module is imported by src/supabase/client.ts, so anything it touches is
  // emitted into the public client bundle.
  return { url, anonKey };
}
