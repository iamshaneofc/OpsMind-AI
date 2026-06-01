import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Check invoice_items table
 */

async function checkInvoiceItems() {
  console.log("================================================================================");
  console.log("CHECK INVOICE ITEMS");
  console.log("================================================================================");
  console.log();

  // Check total count
  const { count: totalCount, error: countError } = await admin
    .from("invoice_items")
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error("Error counting invoice_items:", countError.message);
    return;
  }

  console.log(`Total invoice_items in database: ${totalCount || 0}`);

  // Get sample items
  const { data: sampleItems, error: sampleError } = await admin
    .from("invoice_items")
    .select("id, invoice_id, product_id, invoice_quantity, invoice_body_id")
    .limit(10);

  if (sampleError) {
    console.error("Error fetching sample invoice_items:", sampleError.message);
    return;
  }

  if (sampleItems && sampleItems.length > 0) {
    console.log(`\nSample invoice_items (showing ${sampleItems.length}):`);
    sampleItems.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ID: ${item.id}, Invoice ID: ${item.invoice_id}, Product ID: ${item.product_id}, Quantity: ${item.invoice_quantity}, Body ID: ${item.invoice_body_id}`);
    });
  } else {
    console.log("\n⚠ No invoice_items found in database!");
    console.log("This means invoice items were not imported properly.");
    console.log("\nPlease run the import script:");
    console.log("  node scripts/import-invoices-fixed.mjs");
  }

  // Check items with product_id
  const { count: itemsWithProduct, error: productError } = await admin
    .from("invoice_items")
    .select("*", { count: "exact", head: true })
    .not("product_id", "is", null);

  if (!productError) {
    console.log(`\nInvoice items with product_id: ${itemsWithProduct || 0}`);
  }

  // Check items linked to invoices
  const { data: itemsWithInvoices, error: invoiceError } = await admin
    .from("invoice_items")
    .select("invoice_id, invoices!inner(id, invoice_id, invoice_number)")
    .limit(5);

  if (!invoiceError && itemsWithInvoices && itemsWithInvoices.length > 0) {
    console.log(`\nSample invoice_items linked to invoices:`);
    itemsWithInvoices.forEach((item, idx) => {
      const inv = item.invoices;
      console.log(`  ${idx + 1}. Invoice: ${inv?.invoice_number} (ID: ${inv?.invoice_id}), Item Invoice ID: ${item.invoice_id}`);
    });
  }
}

checkInvoiceItems().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
