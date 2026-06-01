import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Create products from invoice_items and link them
 */

async function createProductsFromInvoices() {
  console.log("================================================================================");
  console.log("CREATE PRODUCTS FROM INVOICE ITEMS");
  console.log("================================================================================");
  console.log();

  // Get all unique products from invoice_items
  const { data: invoiceItems } = await admin
    .from("invoice_items")
    .select("product_catalogue_number, product_description, product_cas_number, packing_id, pack_quantity, product_catalogue_price, product_mrp")
    .not("product_catalogue_number", "is", null);

  console.log(`Found ${invoiceItems?.length || 0} invoice items with catalogue numbers`);

  // Group by catalogue number
  const productsMap = new Map();
  for (const item of invoiceItems || []) {
    const catalogueNo = item.product_catalogue_number?.trim();
    if (!catalogueNo || catalogueNo === "null" || catalogueNo === "") continue;

    if (!productsMap.has(catalogueNo)) {
      productsMap.set(catalogueNo, {
        catalogue_number: catalogueNo,
        description: item.product_description,
        cas_number: item.product_cas_number,
        packing_id: item.packing_id,
        pack_quantity: item.pack_quantity,
        catalogue_price: item.product_catalogue_price,
        mrp: item.product_mrp,
      });
    }
  }

  console.log(`Found ${productsMap.size} unique products to create`);

  // Get existing products
  const { data: existingProducts } = await admin
    .from("products")
    .select("id, product_id, catalogue_number, sku");

  const existingByCatalogue = new Map();
  for (const prod of existingProducts || []) {
    if (prod.catalogue_number && prod.catalogue_number !== "null") {
      existingByCatalogue.set(prod.catalogue_number.toLowerCase().trim(), prod);
    }
    if (prod.sku && prod.sku !== "null") {
      existingByCatalogue.set(prod.sku.toLowerCase().trim(), prod);
    }
  }

  console.log(`Found ${existingByCatalogue.size} existing products with catalogue numbers`);

  // Create or update products
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const productIdMap = new Map(); // catalogue_number -> product UUID

  // Get max product_id to avoid conflicts
  const maxProductId = existingProducts?.reduce((max, p) => Math.max(max, p.product_id || 0), 0) || 0;
  let nextProductId = maxProductId + 1;

  for (const [catalogueNo, productData] of productsMap.entries()) {
    const catalogueKey = catalogueNo.toLowerCase().trim();
    const existing = existingByCatalogue.get(catalogueKey);

    if (existing) {
      // Product exists, use its UUID id
      if (existing.id) {
        productIdMap.set(catalogueNo, existing.id);
        skipped++;
        continue;
      } else {
        // Product exists but no UUID - this shouldn't happen if migration was applied
        console.warn(`Product ${catalogueNo} exists but has no UUID id`);
        continue;
      }
    }

    // Create new product using upsert to avoid duplicate key errors
    const productPayload = {
      product_id: nextProductId,
      catalogue_number: catalogueNo,
      sku: catalogueNo, // Use catalogue number as SKU
      product_name: productData.description || catalogueNo,
      description: productData.description,
      cas_number: productData.cas_number,
      packing_id: productData.packing_id,
      pack_quantity: productData.pack_quantity,
      catalogue_price: productData.catalogue_price,
      mrp: productData.mrp,
      unit: "unit",
    };

    // Use upsert with onConflict to handle duplicates
    const { data: upsertedProduct, error: upsertError } = await admin
      .from("products")
      .upsert(productPayload, { onConflict: "product_id", ignoreDuplicates: false })
      .select("id, product_id")
      .single();

    if (upsertError) {
      // If upsert fails, try to find existing product by catalogue_number
      const { data: foundProduct } = await admin
        .from("products")
        .select("id, product_id")
        .eq("catalogue_number", catalogueNo)
        .maybeSingle();
      
      if (foundProduct && foundProduct.id) {
        productIdMap.set(catalogueNo, foundProduct.id);
        skipped++;
        continue;
      }
      
      console.error(`Error upserting product ${catalogueNo}:`, upsertError.message);
      nextProductId++; // Increment to try next ID
      continue;
    }

    if (upsertedProduct && upsertedProduct.id) {
      productIdMap.set(catalogueNo, upsertedProduct.id);
      created++;
      nextProductId++;
      
      if (created % 10 === 0) {
        console.log(`Created ${created} products...`);
      }
    } else {
      console.warn(`Could not get UUID for product ${catalogueNo}`);
      nextProductId++;
    }
  }

  console.log(`\n✓ Created ${created} products`);
  console.log(`✓ Updated ${updated} products`);
  console.log(`✓ Skipped ${skipped} existing products`);

  // Now update invoice_items with product_id
  console.log(`\nUpdating invoice_items with product_id...`);
  let itemsUpdated = 0;
  let itemsErrors = 0;

  for (const [catalogueNo, productId] of productIdMap.entries()) {
    const { error: updateError } = await admin
      .from("invoice_items")
      .update({ product_id: productId })
      .eq("product_catalogue_number", catalogueNo)
      .is("product_id", null);

    if (updateError) {
      console.error(`Error updating invoice_items for ${catalogueNo}:`, updateError.message);
      itemsErrors++;
    } else {
      itemsUpdated++;
    }
  }

  console.log(`✓ Updated ${itemsUpdated} invoice_items with product_id`);
  if (itemsErrors > 0) {
    console.log(`⚠ ${itemsErrors} update errors`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`Products created: ${created}`);
  console.log(`Products skipped: ${skipped}`);
  console.log(`Invoice items updated: ${itemsUpdated}`);
  console.log("=".repeat(80));
}

createProductsFromInvoices().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
