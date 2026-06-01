import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Apply migration to add UUID id column to orders table
 */

async function applyMigration() {
  console.log("================================================================================");
  console.log("APPLY MIGRATION: Add UUID id column to orders table");
  console.log("================================================================================");
  console.log();

  // Check if id column exists
  console.log("Step 1: Checking if orders table has id column...");
  try {
    const { data: testOrder } = await admin
      .from("orders")
      .select("id, order_id")
      .limit(1)
      .maybeSingle();

    if (testOrder && testOrder.id) {
      console.log("✓ Orders table already has id column");
      console.log("Sample order:", testOrder);
      return true;
    }
  } catch (e) {
    // Column doesn't exist, continue
    console.log("id column does not exist, will add it...");
  }

  console.log("\nStep 2: Adding id column to orders table...");
  console.log("NOTE: This requires running SQL directly in Supabase SQL Editor.");
  console.log("\nPlease run the following SQL in Supabase SQL Editor:");
  console.log("\n" + "=".repeat(80));
  console.log(`
-- Add id column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

-- Make it unique
CREATE UNIQUE INDEX IF NOT EXISTS orders_id_unique_idx ON public.orders(id);

-- Update existing orders to have UUIDs
UPDATE public.orders 
SET id = gen_random_uuid() 
WHERE id IS NULL;
  `);
  console.log("=".repeat(80));
  console.log("\nAfter running the SQL, press Enter to continue...");

  // Wait for user confirmation (in a real scenario, you'd read from stdin)
  // For now, just check if it was applied
  console.log("\nChecking if migration was applied...");
  
  // Try to query the id column
  try {
    const { data: ordersWithId } = await admin
      .from("orders")
      .select("id, order_id, order_number")
      .limit(5);

    if (ordersWithId && ordersWithId.length > 0 && ordersWithId[0].id) {
      console.log("✓ Migration applied successfully!");
      console.log("Sample orders with id:");
      ordersWithId.forEach(o => {
        console.log(`  - Order ${o.order_number}: order_id=${o.order_id}, id=${o.id}`);
      });
      return true;
    } else {
      console.log("⚠ Migration not yet applied. Please run the SQL above.");
      return false;
    }
  } catch (e) {
    console.log("⚠ Migration not yet applied. Please run the SQL above.");
    console.error("Error:", e.message);
    return false;
  }
}

applyMigration().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
