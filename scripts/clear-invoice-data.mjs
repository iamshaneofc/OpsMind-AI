import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function clearInvoiceData() {
  console.log("Clearing existing invoice data...");
  
  try {
    // Delete in order to respect foreign key constraints
    console.log("Deleting invoice_items...");
    const { error: itemsError } = await admin.from("invoice_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (itemsError) console.error("Error deleting invoice_items:", itemsError.message);
    else console.log("✓ Deleted invoice_items");
    
    console.log("Deleting invoice_orders...");
    const { error: ordersError } = await admin.from("invoice_orders").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (ordersError) console.error("Error deleting invoice_orders:", ordersError.message);
    else console.log("✓ Deleted invoice_orders");
    
    console.log("Deleting invoices...");
    const { error: invoicesError } = await admin.from("invoices").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (invoicesError) console.error("Error deleting invoices:", invoicesError.message);
    else console.log("✓ Deleted invoices");
    
    console.log("Deleting customers...");
    const { error: customersError } = await admin.from("customers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (customersError) console.error("Error deleting customers:", customersError.message);
    else console.log("✓ Deleted customers");
    
    console.log("\n✓ All invoice data cleared successfully!");
  } catch (error) {
    console.error("Error clearing data:", error);
    process.exit(1);
  }
}

clearInvoiceData();
