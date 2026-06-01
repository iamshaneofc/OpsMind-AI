import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Check product matching between invoice_items and products
 */

async function checkProductMatching() {
  console.log("================================================================================");
  console.log("CHECK PRODUCT MATCHING");
  console.log("================================================================================");
  console.log();

  // Get sample invoice items with catalogue numbers
  const { data: invoiceItems } = await admin
    .from("invoice_items")
    .select("product_catalogue_number, product_description, product_id")
    .not("product_catalogue_number", "is", null)
    .limit(10);

  console.log(`Sample invoice_items with catalogue numbers (${invoiceItems?.length || 0}):`);
  invoiceItems?.forEach((item, idx) => {
    console.log(`  ${idx + 1}. Catalogue: "${item.product_catalogue_number}", Description: "${item.product_description}", Product ID: ${item.product_id}`);
  });

  // Get sample products
  const { data: products } = await admin
    .from("products")
    .select("id, product_id, catalogue_number, sku, name")
    .limit(10);

  console.log(`\nSample products (${products?.length || 0}):`);
  products?.forEach((prod, idx) => {
    console.log(`  ${idx + 1}. Product ID: ${prod.product_id}, Catalogue: "${prod.catalogue_number}", SKU: "${prod.sku}", Name: "${prod.name}"`);
  });

  // Try to match
  console.log(`\nAttempting to match...`);
  if (invoiceItems && invoiceItems.length > 0 && products && products.length > 0) {
    const itemCatalogue = invoiceItems[0].product_catalogue_number?.toLowerCase().trim();
    const matchingProduct = products.find(p => 
      p.catalogue_number?.toLowerCase().trim() === itemCatalogue ||
      p.sku?.toLowerCase().trim() === itemCatalogue
    );
    
    if (matchingProduct) {
      console.log(`✓ Found match: "${itemCatalogue}" -> Product ID ${matchingProduct.product_id}`);
    } else {
      console.log(`✗ No match found for: "${itemCatalogue}"`);
      console.log(`  Available product catalogue numbers: ${products.map(p => p.catalogue_number || p.sku).filter(Boolean).join(", ")}`);
    }
  }

  // Check if products exist with product_id from CSV
  console.log(`\nChecking products by product_id from CSV...`);
  const { data: productsByProductId } = await admin
    .from("products")
    .select("product_id, catalogue_number, sku")
    .not("product_id", "is", null)
    .limit(10);

  console.log(`Products with product_id: ${productsByProductId?.length || 0}`);
  productsByProductId?.forEach((prod, idx) => {
    console.log(`  ${idx + 1}. Product ID: ${prod.product_id}, Catalogue: "${prod.catalogue_number}", SKU: "${prod.sku}"`);
  });
}

checkProductMatching().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
