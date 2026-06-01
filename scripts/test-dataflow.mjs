import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";
const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_ANON = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const PASSWORD = "OpsMind@12345";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function authedClient(email) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) {
    throw new Error(`Sign in failed for ${email}: ${error?.message ?? "No session"}`);
  }
  return { client, token: data.session.access_token, userId: data.user.id };
}

async function run() {
  const superAdmin = await authedClient("super.admin@opsmindchemicals.com");
  const distributor = await authedClient("distributor@opsmindchemicals.com");
  const warehouse = await authedClient("warehouse@opsmindchemicals.com");

  const { data: distributorUserRows, error: distUserErr } = await superAdmin.client
    .from("users")
    .select("user_id,company_id")
    .eq("email", "distributor@opsmindchemicals.com")
    .limit(1);
  if (distUserErr) throw distUserErr;
  const distributorUser = distributorUserRows?.[0];
  assert(!!distributorUser?.company_id, "Distributor app profile missing company_id.");

  const { data: warehouseUserRows, error: whUserErr } = await superAdmin.client
    .from("users")
    .select("user_id,warehouse_id")
    .eq("email", "warehouse@opsmindchemicals.com")
    .limit(1);
  if (whUserErr) throw whUserErr;
  const warehouseUser = warehouseUserRows?.[0];
  assert(!!warehouseUser?.warehouse_id, "Warehouse app profile missing warehouse_id.");

  const { data: distOrders, error: distErr } = await distributor.client
    .from("orders")
    .select("order_number,company_id")
    .eq("company_id", distributorUser.company_id);
  if (distErr) throw distErr;
  assert(distOrders.length > 0, "Distributor should have visible orders.");

  const { data: warehouseInventory, error: warehouseInvErr } = await warehouse.client
    .from("inventory")
    .select("warehouse_id,available_quantity")
    .eq("warehouse_id", warehouseUser.warehouse_id);
  if (warehouseInvErr) throw warehouseInvErr;
  assert(warehouseInventory.length > 0, "Warehouse user should see inventory.");

  const { data: delayed, error: delayedErr } = await superAdmin.client
    .from("orders")
    .select("order_number,status,expected_delivery_date")
    .lt("expected_delivery_date", new Date().toISOString().slice(0, 10))
    .neq("status", "DELIVERED");
  if (delayedErr) throw delayedErr;
  assert(delayed.length >= 1, "Super admin should see delayed orders.");

  const chatApi = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${distributor.token}`,
    },
    body: JSON.stringify({ message: "Where is order OpsMind-1024?" }),
  });

  assert(chatApi.ok, `Chat API failed: ${chatApi.status}`);
  const chatResponse = await chatApi.text();
  assert(chatResponse.length > 0, "Chat API returned empty response.");

  const { data: chatRows, error: chatErr } = await distributor.client
    .from("chatbot_messages")
    .select("message_id,user_id,message,response")
    .eq("user_id", distributorUser.user_id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (chatErr) throw chatErr;
  assert(chatRows.length === 1, "Chat message should be persisted for distributor.");

  console.log("Dataflow checks passed.");
  console.log(`- Distributor orders visible: ${distOrders.length}`);
  console.log(`- Warehouse inventory rows: ${warehouseInventory.length}`);
  console.log(`- Delayed orders visible to super admin: ${delayed.length}`);
  console.log(`- Chat API response sample: ${chatResponse.slice(0, 120)}...`);
}

run().catch((error) => {
  console.error("Dataflow test failed:", error.message || error);
  process.exit(1);
});
