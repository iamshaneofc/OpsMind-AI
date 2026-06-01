import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Master script to:
 * 1. Check if orders table has id column
 * 2. If not, prompt user to apply migration
 * 3. Link invoices to orders
 * 4. Run comprehensive tests
 */

async function checkOrdersUUIDColumn() {
  try {
    const { data: testOrder } = await admin
      .from("orders")
      .select("id, order_id, order_number")
      .limit(1)
      .maybeSingle();

    if (testOrder && testOrder.id) {
      console.log("✓ Orders table has id column");
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function setupAndTest() {
  console.log("================================================================================");
  console.log("SETUP AND TEST SYSTEM");
  console.log("================================================================================");
  console.log();

  // Step 1: Check if migration is applied
  console.log("Step 1: Checking if orders table has UUID id column...");
  const hasUUIDColumn = await checkOrdersUUIDColumn();

  if (!hasUUIDColumn) {
    console.log("\n⚠ REQUIRED: Orders table is missing UUID id column");
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
    console.log("\nAfter applying the migration, run this script again.");
    console.log("\nOr apply the migration file:");
    console.log("  srl-operations-ai/supabase/migrations/202603080001_add_uuid_to_orders.sql");
    process.exit(1);
  }

  console.log("✓ Migration is applied\n");

  // Step 2: Link invoices to orders
  console.log("Step 2: Linking invoices to orders...");
  try {
    const { stdout, stderr } = await execAsync(
      'node scripts/link-invoices-to-orders.mjs',
      { cwd: process.cwd() }
    );
    console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (e) {
    console.error("Error linking invoices to orders:", e.message);
    console.log("Continuing with tests...");
  }

  // Step 3: Run comprehensive tests
  console.log("\nStep 3: Running comprehensive system tests...");
  try {
    const { stdout, stderr } = await execAsync(
      'node scripts/test-system-comprehensive.mjs',
      { cwd: process.cwd() }
    );
    console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (e) {
    console.error("Error running tests:", e.message);
    console.log("Check test output above for details.");
  }

  console.log("\n" + "=".repeat(80));
  console.log("SETUP AND TEST COMPLETE");
  console.log("=".repeat(80));
}

setupAndTest().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
