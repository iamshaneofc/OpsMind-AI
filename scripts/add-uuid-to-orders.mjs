import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Add UUID id column to orders table
 * This is needed for foreign key relationships
 */

async function addUUIDToOrders() {
  console.log("================================================================================");
  console.log("ADD UUID ID COLUMN TO ORDERS TABLE");
  console.log("================================================================================");
  console.log();

  // Check if id column exists
  console.log("Step 1: Checking if orders table has id column...");
  const { data: testOrder } = await admin
    .from("orders")
    .select("id, order_id")
    .limit(1)
    .maybeSingle();

  if (testOrder && testOrder.id) {
    console.log("✓ Orders table already has id column");
    return;
  }

  console.log("Orders table does not have id column. Adding it...");

  // Add id column using SQL
  const { error: alterError } = await admin.rpc("exec_sql", {
    sql: `
      -- Add id column if it doesn't exist
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'orders' 
          AND column_name = 'id'
        ) THEN
          ALTER TABLE public.orders 
          ADD COLUMN id uuid DEFAULT gen_random_uuid();
          
          -- Make it the primary key (but first need to drop existing PK)
          -- Actually, we'll keep order_id as PK and make id unique
          CREATE UNIQUE INDEX IF NOT EXISTS orders_id_unique_idx ON public.orders(id);
        END IF;
      END $$;
    `,
  });

  if (alterError) {
    console.error("Error adding id column:", alterError.message);
    console.log("Trying alternative approach...");

    // Alternative: Use direct SQL via Supabase SQL editor
    console.log("\nPlease run this SQL in Supabase SQL Editor:");
    console.log(`
      -- Add id column to orders table
      ALTER TABLE public.orders 
      ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
      
      -- Make it unique
      CREATE UNIQUE INDEX IF NOT EXISTS orders_id_unique_idx ON public.orders(id);
      
      -- Update existing orders to have UUIDs
      UPDATE public.orders SET id = gen_random_uuid() WHERE id IS NULL;
    `);
    return;
  }

  console.log("✓ Added id column to orders table");

  // Update existing orders to have UUIDs
  console.log("\nStep 2: Updating existing orders with UUIDs...");
  const { data: ordersWithoutId } = await admin
    .from("orders")
    .select("order_id")
    .is("id", null)
    .limit(1000);

  if (ordersWithoutId && ordersWithoutId.length > 0) {
    console.log(`Found ${ordersWithoutId.length} orders without UUID. Updating...`);
    
    // Update each order with a UUID
    for (const order of ordersWithoutId) {
      const { error: updateError } = await admin
        .from("orders")
        .update({ id: crypto.randomUUID() })
        .eq("order_id", order.order_id)
        .is("id", null);

      if (updateError) {
        console.error(`Error updating order ${order.order_id}:`, updateError.message);
      }
    }

    console.log(`✓ Updated ${ordersWithoutId.length} orders with UUIDs`);
  } else {
    console.log("✓ All orders already have UUIDs");
  }

  console.log("\n" + "=".repeat(80));
  console.log("COMPLETE");
  console.log("=".repeat(80));
}

addUUIDToOrders().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
