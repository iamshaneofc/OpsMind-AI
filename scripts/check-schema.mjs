import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Check actual schema of tables
 */

async function checkSchema() {
  console.log("================================================================================");
  console.log("CHECKING ACTUAL SCHEMA");
  console.log("================================================================================");
  console.log();

  // Check products table
  const { data: productSample } = await admin
    .from("products")
    .select("*")
    .limit(1)
    .maybeSingle();

  console.log("Products table columns:", productSample ? Object.keys(productSample) : "No products");
  if (productSample) {
    console.log("Sample product:", JSON.stringify(productSample, null, 2));
  }

  // Check order_items table
  const { data: orderItemSample } = await admin
    .from("order_items")
    .select("*")
    .limit(1)
    .maybeSingle();

  console.log("\nOrder_items table columns:", orderItemSample ? Object.keys(orderItemSample) : "No order items");
  if (orderItemSample) {
    console.log("Sample order_item:", JSON.stringify(orderItemSample, null, 2));
  }

  // Check orders table
  const { data: orderSample } = await admin
    .from("orders")
    .select("id, order_id, order_number")
    .limit(1)
    .maybeSingle();

  console.log("\nOrders table columns:", orderSample ? Object.keys(orderSample) : "No orders");
  if (orderSample) {
    console.log("Sample order:", JSON.stringify(orderSample, null, 2));
  }

  // Check companies table
  try {
    const { data: companySample } = await admin
      .from("companies")
      .select("*")
      .limit(1)
      .maybeSingle();

    console.log("\nCompanies table columns:", companySample ? Object.keys(companySample) : "No companies");
    if (companySample) {
      console.log("Sample company:", JSON.stringify(companySample, null, 2));
    }
  } catch (e) {
    console.log("\nCompanies table error:", e.message);
  }

  // Check users table
  try {
    const { data: userSample } = await admin
      .from("users")
      .select("*")
      .limit(1)
      .maybeSingle();

    console.log("\nUsers table columns:", userSample ? Object.keys(userSample) : "No users");
    if (userSample) {
      console.log("Sample user:", JSON.stringify(userSample, null, 2));
    }
  } catch (e) {
    console.log("\nUsers table error:", e.message);
  }
}

checkSchema().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
