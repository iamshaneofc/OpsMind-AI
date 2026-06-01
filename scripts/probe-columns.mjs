import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();
const client = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const checks = {
  inventory: [
    "id",
    "inventory_id",
    "warehouse_id",
    "product_id",
    "available_qty",
    "available_quantity",
    "quantity",
    "quantity_available",
    "quantity_on_hand",
    "current_quantity",
    "qty",
    "stock",
    "stock_qty",
    "current_stock",
    "reorder_level",
    "reorder_point",
    "reorder_qty",
    "minimum_qty",
    "min_qty",
    "threshold_qty",
    "low_stock_threshold",
    "min_stock_level",
    "updated_at",
    "last_updated",
    "created_at",
  ],
  chatbot_sessions: [
    "session_id",
    "user_id",
    "title",
    "session_title",
    "created_at",
    "updated_at",
    "last_message_at",
    "is_active",
  ],
};

for (const [table, cols] of Object.entries(checks)) {
  console.log(`\n${table}`);
  for (const col of cols) {
    const { error } = await client.from(table).select(col).limit(1);
    if (!error) console.log(`  OK: ${col}`);
  }
}
