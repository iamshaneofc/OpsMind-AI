import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();
const client = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: users, error: usersErr } = await client
  .from("users")
  .select("user_id,email,role_id,company_id,warehouse_id")
  .limit(20);
if (usersErr) throw usersErr;
console.log("users sample", users);

const { data: roles, error: rolesErr } = await client.from("roles").select("*").limit(20);
console.log("roles table", rolesErr ? rolesErr.message : roles);
