import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Setup Missing Data
 * 
 * This script:
 * 1. Creates companies from invoice data if they don't exist
 * 2. Creates warehouses if they don't exist
 * 3. Links invoices to companies
 * 4. Creates orders from invoice_orders
 * 5. Creates products from invoice_items
 */

async function setupMissingData() {
  console.log("================================================================================");
  console.log("SETUP MISSING DATA");
  console.log("================================================================================");
  console.log();

  // Step 1: Check and create warehouses
  console.log("Step 1: Setting up warehouses...");
  const { data: existingWarehouses } = await admin
    .from("warehouses")
    .select("id, name")
    .limit(10);

  if (!existingWarehouses || existingWarehouses.length === 0) {
    console.log("Creating default warehouses...");
    const warehouses = [
      { name: "Mumbai Central Warehouse", location: "Mumbai" },
      { name: "Delhi Central Warehouse", location: "Delhi" },
      { name: "Default Warehouse", location: "Mumbai" },
    ];

    for (const wh of warehouses) {
      const { error } = await admin
        .from("warehouses")
        .insert(wh)
        .select("id")
        .single();
      if (error) {
        console.error(`Error creating warehouse ${wh.name}:`, error.message);
      } else {
        console.log(`✓ Created warehouse: ${wh.name}`);
      }
    }
  } else {
    console.log(`✓ Found ${existingWarehouses.length} existing warehouses`);
  }

  // Get default warehouse
  const { data: defaultWarehouse } = await admin
    .from("warehouses")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!defaultWarehouse) {
    console.error("No warehouse available. Cannot proceed.");
    return;
  }

  console.log(`Using warehouse: ${defaultWarehouse.id}`);

  // Step 2: Check and create companies from invoices
  console.log("\nStep 2: Setting up companies from invoice data...");
  
  // Get unique company names from invoices (using customer data or company_name field)
  const { data: invoices } = await admin
    .from("invoices")
    .select("id, company_id, customer_full_name")
    .limit(100);

  // Check existing companies
  const { data: existingCompanies } = await admin
    .from("companies")
    .select("id, company_name, name")
    .limit(100);

  console.log(`Found ${existingCompanies?.length || 0} existing companies`);

  // If no companies exist, create SISCO (from CSV data)
  if (!existingCompanies || existingCompanies.length === 0) {
    console.log("Creating SISCO company...");
    const { data: newCompany, error: compError } = await admin
      .from("companies")
      .insert({
        company_name: "SISCO",
        name: "SISCO",
        code: "SISCO",
      })
      .select("id")
      .single();

    if (compError) {
      console.error("Error creating company:", compError.message);
    } else {
      console.log(`✓ Created company: SISCO (${newCompany.id})`);
    }
  }

  // Get SISCO company
  const { data: siscoCompany } = await admin
    .from("companies")
    .select("id, company_name, name")
    .or("company_name.ilike.SISCO,name.ilike.SISCO")
    .limit(1)
    .maybeSingle();

  if (!siscoCompany) {
    console.error("SISCO company not found. Cannot proceed.");
    return;
  }

  const defaultCompanyId = siscoCompany.id;
  console.log(`Using company: ${siscoCompany.company_name || siscoCompany.name} (${defaultCompanyId})`);

  // Step 3: Link invoices to company
  console.log("\nStep 3: Linking invoices to company...");
  const { data: invoicesWithoutCompany } = await admin
    .from("invoices")
    .select("id")
    .is("company_id", null)
    .limit(100);

  if (invoicesWithoutCompany && invoicesWithoutCompany.length > 0) {
    const { error: updateError } = await admin
      .from("invoices")
      .update({ company_id: defaultCompanyId })
      .is("company_id", null);

    if (updateError) {
      console.error("Error linking invoices to company:", updateError.message);
    } else {
      console.log(`✓ Linked ${invoicesWithoutCompany.length} invoices to company`);
    }
  } else {
    console.log("✓ All invoices already have company_id");
  }

  // Step 4: Create products from invoice_items
  console.log("\nStep 4: Creating products from invoice_items...");
  const { data: invoiceItems } = await admin
    .from("invoice_items")
    .select("product_id, product_catalogue_number, product_description")
    .not("product_catalogue_number", "is", null)
    .limit(200);

  const uniqueProducts = new Map();
  for (const item of invoiceItems || []) {
    const sku = item.product_catalogue_number;
    if (sku && !uniqueProducts.has(sku)) {
      uniqueProducts.set(sku, {
        sku: sku,
        name: item.product_description || sku,
        description: item.product_description,
        product_id: item.product_id, // MSSQL product_id
      });
    }
  }

  console.log(`Found ${uniqueProducts.size} unique products to create`);

  let productsCreated = 0;
  let productsSkipped = 0;

  for (const [sku, productData] of uniqueProducts.entries()) {
    // Check if product exists by sku
    const { data: existingProduct } = await admin
      .from("products")
      .select("id")
      .eq("sku", sku)
      .maybeSingle();

    if (existingProduct) {
      productsSkipped++;
      continue;
    }

    // Create product
    const productPayload = {
      name: productData.name || sku,
      sku: sku,
      description: productData.description,
      product_id: productData.product_id,
      catalogue_number: sku,
    };

    const { error: prodError } = await admin
      .from("products")
      .insert(productPayload);

    if (prodError) {
      console.error(`Error creating product ${sku}:`, prodError.message);
    } else {
      productsCreated++;
    }
  }

  console.log(`✓ Created ${productsCreated} products`);
  console.log(`✓ Skipped ${productsSkipped} existing products`);

  // Step 5: Create orders from invoice_orders
  console.log("\nStep 5: Creating orders from invoice_orders...");
  const { data: invoiceOrders } = await admin
    .from("invoice_orders")
    .select("order_number, order_date, customer_po_number, order_total_amount")
    .not("order_number", "is", null);

  const uniqueOrderNumbers = [...new Set(invoiceOrders?.map(io => io.order_number).filter(Boolean) || [])];
  console.log(`Found ${uniqueOrderNumbers.length} unique order numbers`);

  let ordersCreated = 0;
  let ordersSkipped = 0;
  const orderMap = new Map();

  for (const orderNumber of uniqueOrderNumbers) {
    // Check if order exists
    const { data: existingOrder } = await admin
      .from("orders")
      .select("id")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (existingOrder) {
      orderMap.set(orderNumber, existingOrder.id);
      ordersSkipped++;
      continue;
    }

    // Get order data
    const orderData = invoiceOrders?.find(io => io.order_number === orderNumber);
    if (!orderData) continue;

    // Create order
    const orderPayload = {
      order_number: orderNumber,
      company_id: defaultCompanyId,
      warehouse_id: defaultWarehouse.id,
      status: "PENDING",
      order_status: "Work in Progress",
      expected_delivery_date: orderData.order_date ? new Date(orderData.order_date).toISOString().split('T')[0] : null,
      original_eta: orderData.order_date ? new Date(orderData.order_date).toISOString().split('T')[0] : null,
    };

    const { data: newOrder, error: orderError } = await admin
      .from("orders")
      .insert(orderPayload)
      .select("id")
      .single();

    if (orderError) {
      console.error(`Error creating order ${orderNumber}:`, orderError.message);
      continue;
    }

    orderMap.set(orderNumber, newOrder.id);
    ordersCreated++;
  }

  console.log(`✓ Created ${ordersCreated} orders`);
  console.log(`✓ Skipped ${ordersSkipped} existing orders`);

  // Step 6: Update invoice_orders with order_id
  console.log("\nStep 6: Updating invoice_orders with order_id...");
  let updated = 0;
  for (const [orderNumber, orderId] of orderMap.entries()) {
    const { error: updateError } = await admin
      .from("invoice_orders")
      .update({ order_id: orderId })
      .eq("order_number", orderNumber)
      .is("order_id", null);

    if (!updateError) {
      updated++;
    }
  }
  console.log(`✓ Updated ${updated} invoice_orders with order_id`);

  // Step 7: Create order_items from invoice_items
  console.log("\nStep 7: Creating order_items from invoice_items...");
  let itemsCreated = 0;
  let itemsSkipped = 0;

  // Group invoice items by order and product
  const orderItemMap = new Map(); // (order_id, product_id) -> quantity

  for (const item of invoiceItems || []) {
    if (!item.product_id) continue;

    // Get order for this invoice
    const { data: invoiceOrder } = await admin
      .from("invoice_orders")
      .select("order_id, order_number")
      .eq("invoice_id", item.invoice_id)
      .limit(1)
      .maybeSingle();

    if (!invoiceOrder || !invoiceOrder.order_id) continue;

    const key = `${invoiceOrder.order_id}-${item.product_id}`;
    if (!orderItemMap.has(key)) {
      orderItemMap.set(key, {
        order_id: invoiceOrder.order_id,
        product_id: item.product_id,
        quantity: 0,
      });
    }

    const orderItem = orderItemMap.get(key);
    orderItem.quantity += Number(item.invoice_quantity) || 0;
  }

  // Create order_items
  for (const [key, itemData] of orderItemMap.entries()) {
    // Check if exists
    const { data: existingItem } = await admin
      .from("order_items")
      .select("id")
      .eq("order_id", itemData.order_id)
      .eq("product_id", itemData.product_id)
      .maybeSingle();

    if (existingItem) {
      itemsSkipped++;
      continue;
    }

    // Get product UUID (not MSSQL product_id)
    const { data: product } = await admin
      .from("products")
      .select("id")
      .eq("product_id", itemData.product_id)
      .maybeSingle();

    if (!product) {
      // Try by sku/catalogue_number
      const { data: productBySku } = await admin
        .from("products")
        .select("id")
        .eq("sku", itemData.product_catalogue_number)
        .maybeSingle();

      if (!productBySku) {
        console.warn(`Product not found for product_id ${itemData.product_id}, skipping order_item`);
        continue;
      }

      itemData.product_id = productBySku.id;
    } else {
      itemData.product_id = product.id;
    }

    const { error: itemError } = await admin
      .from("order_items")
      .insert({
        order_id: itemData.order_id,
        product_id: itemData.product_id,
        quantity: itemData.quantity,
        item_status: "Ordered",
        processed_quantity: 0,
        pending_quantity: itemData.quantity,
        delayed_quantity: 0,
      });

    if (itemError) {
      console.error(`Error creating order_item:`, itemError.message);
      continue;
    }

    itemsCreated++;
  }

  console.log(`✓ Created ${itemsCreated} order items`);
  console.log(`✓ Skipped ${itemsSkipped} existing items`);

  console.log("\n" + "=".repeat(80));
  console.log("SETUP COMPLETE");
  console.log("=".repeat(80));
  console.log(`Companies: ${existingCompanies?.length || 0} (created if needed)`);
  console.log(`Warehouses: ${existingWarehouses?.length || 0} (created if needed)`);
  console.log(`Products: ${productsCreated} created, ${productsSkipped} skipped`);
  console.log(`Orders: ${ordersCreated} created, ${ordersSkipped} skipped`);
  console.log(`Order Items: ${itemsCreated} created, ${itemsSkipped} skipped`);
  console.log(`Invoice-Order links updated: ${updated}`);
  console.log("=".repeat(80));
}

setupMissingData().catch((error) => {
  console.error("Setup failed:", error);
  process.exit(1);
});
