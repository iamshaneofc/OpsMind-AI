import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const service = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const client = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const tables = [
  "companies",
  "users",
  "orders",
  "order_items",
  "inventory",
  "warehouses",
  "products",
  "alerts",
  "chatbot_messages",
  "chatbot_sessions",
  "chat_sessions",
  "sessions",
  "order_status_history",
];

for (const table of tables) {
  const { data, error } = await client.from(table).select("*").limit(1);
  if (error) {
    console.log(`${table}: ERROR -> ${error.message}`);
    continue;
  }
  const keys = data?.[0] ? Object.keys(data[0]).join(", ") : "(no rows)";
  console.log(`${table}: OK -> ${keys}`);
}
