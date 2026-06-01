import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Link Invoices to Orders
 * 
 * This script:
 * 1. Creates orders from invoice_orders (using actual schema with integer IDs)
 * 2. Links invoices to companies
 * 3. Creates order_items from invoice_items
 * 4. Updates invoice_orders with order_id
 */

async function linkInvoicesToOrders() {
  console.log("================================================================================");
  console.log("LINK INVOICES TO ORDERS");
  console.log("================================================================================");
  console.log();

  // Step 1: Get warehouses (using warehouse_id integer)
  console.log("Step 1: Getting warehouses...");
  const { data: warehouses } = await admin
    .from("warehouses")
    .select("warehouse_id, warehouse_name")
    .limit(10);

  if (!warehouses || warehouses.length === 0) {
    console.error("No warehouses found. Please create warehouses first.");
    return;
  }

  const defaultWarehouseId = warehouses[0].warehouse_id;
  console.log(`Using warehouse: ${warehouses[0].warehouse_name} (ID: ${defaultWarehouseId})`);

  // Step 2: Get companies (using company_id integer)
  console.log("\nStep 2: Getting companies...");
  const { data: companies } = await admin
    .from("companies")
    .select("company_id, company_name")
    .limit(10);

  if (!companies || companies.length === 0) {
    console.error("No companies found. Please create companies first.");
    return;
  }

  // Find SISCO or use first company
  const siscoCompany = companies.find(c => 
    c.company_name?.toUpperCase().includes("SISCO")
  ) || companies[0];

  const defaultCompanyId = siscoCompany.company_id;
  console.log(`Using company: ${siscoCompany.company_name} (ID: ${defaultCompanyId})`);

  // Step 3: Link invoices to company
  console.log("\nStep 3: Linking invoices to company...");
  const { data: invoicesWithoutCompany } = await admin
    .from("invoices")
    .select("id")
    .is("company_id", null)
    .limit(100);

  if (invoicesWithoutCompany && invoicesWithoutCompany.length > 0) {
    // Update invoices with company_id (UUID from companies table)
    // First get the UUID for the company
    const { data: companyUUID } = await admin
      .from("companies")
      .select("id")
      .eq("company_id", defaultCompanyId)
      .maybeSingle();

    if (companyUUID) {
      const { error: updateError } = await admin
        .from("invoices")
        .update({ company_id: companyUUID.id })
        .is("company_id", null);

      if (updateError) {
        console.error("Error linking invoices to company:", updateError.message);
      } else {
        console.log(`✓ Linked ${invoicesWithoutCompany.length} invoices to company`);
      }
    }
  } else {
    console.log("✓ All invoices already have company_id");
  }

  // Step 4: Get unique orders from invoice_orders
  console.log("\nStep 4: Getting unique orders from invoice_orders...");
  const { data: invoiceOrders } = await admin
    .from("invoice_orders")
    .select("order_number, order_date, customer_po_number, order_total_amount")
    .not("order_number", "is", null);

  const uniqueOrderNumbers = [...new Set(invoiceOrders?.map(io => io.order_number).filter(Boolean) || [])];
  console.log(`Found ${uniqueOrderNumbers.length} unique order numbers`);

  // Step 5: Create orders
  console.log("\nStep 5: Creating orders...");
  let ordersCreated = 0;
  let ordersSkipped = 0;
  const orderMap = new Map(); // order_number -> { order_id: integer, id: uuid }

  for (const orderNumber of uniqueOrderNumbers) {
    // Check if order exists (using order_id integer)
    const { data: existingOrder } = await admin
      .from("orders")
      .select("order_id, id, order_number")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (existingOrder) {
      // Try to get id (UUID) if it exists
      let orderUUID = existingOrder.id || null;
      if (!orderUUID) {
        try {
          const { data: orderWithId } = await admin
            .from("orders")
            .select("id")
            .eq("order_id", existingOrder.order_id)
            .maybeSingle();
          orderUUID = orderWithId?.id || null;
        } catch (e) {
          // id column doesn't exist yet
        }
      }

      orderMap.set(orderNumber, {
        order_id: existingOrder.order_id,
        id: orderUUID,
      });
      ordersSkipped++;
      continue;
    }

    // Get order data
    const orderData = invoiceOrders?.find(io => io.order_number === orderNumber);
    if (!orderData) continue;

    // Create order (using integer IDs)
    const orderPayload = {
      order_number: orderNumber,
      company_id: defaultCompanyId, // integer
      warehouse_id: defaultWarehouseId, // integer
      status: "PENDING",
      order_status: "Work in Progress",
      order_date: orderData.order_date ? new Date(orderData.order_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      expected_delivery_date: orderData.order_date ? new Date(orderData.order_date).toISOString().split('T')[0] : null,
      original_eta: orderData.order_date ? new Date(orderData.order_date).toISOString().split('T')[0] : null,
      order_value: orderData.order_total_amount || 0,
    };

    // Insert order (without selecting id to avoid errors)
    const { error: orderError } = await admin
      .from("orders")
      .insert(orderPayload);

    if (orderError) {
      console.error(`Error creating order ${orderNumber}:`, orderError.message);
      continue;
    }

    // Query back to get order_id and id (if exists)
    const { data: newOrder, error: queryError } = await admin
      .from("orders")
      .select("order_id")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (queryError || !newOrder) {
      console.error(`Error querying created order ${orderNumber}:`, queryError?.message);
      continue;
    }

    // Try to get id (UUID) if it exists, otherwise use null
    let orderUUID = null;
    try {
      const { data: orderWithId } = await admin
        .from("orders")
        .select("id")
        .eq("order_id", newOrder.order_id)
        .maybeSingle();
      orderUUID = orderWithId?.id || null;
    } catch (e) {
      // id column doesn't exist yet, that's okay - migration needs to be applied
    }

    // Store both order_id (integer) and id (UUID) for later use
    orderMap.set(orderNumber, {
      order_id: newOrder.order_id,
      id: orderUUID,
    });
    ordersCreated++;
  }

  console.log(`✓ Created ${ordersCreated} orders`);
  console.log(`✓ Skipped ${ordersSkipped} existing orders`);

  // Step 6: Update invoice_orders with order_id (UUID)
  console.log("\nStep 6: Updating invoice_orders with order_id (UUID)...");
  let updated = 0;
  let updateErrors = 0;
  let skippedNoUUID = 0;

  for (const [orderNumber, orderData] of orderMap.entries()) {
    if (!orderData || !orderData.id) {
      skippedNoUUID++;
      continue;
    }

    const { error: updateError } = await admin
      .from("invoice_orders")
      .update({ order_id: orderData.id })
      .eq("order_number", orderNumber)
      .is("order_id", null);

    if (updateError) {
      console.error(`Error updating invoice_orders for ${orderNumber}:`, updateError.message);
      updateErrors++;
    } else {
      updated++;
    }
  }

  if (skippedNoUUID > 0) {
    console.log(`⚠ Skipped ${skippedNoUUID} orders without UUID (migration may not be applied)`);
  }

  console.log(`✓ Updated ${updated} invoice_orders with order_id (UUID)`);
  if (updateErrors > 0) {
    console.log(`⚠ ${updateErrors} update errors`);
  }

  // Step 7: Create order_items from invoice_items
  console.log("\nStep 7: Creating order_items from invoice_items...");
  let itemsCreated = 0;
  let itemsSkipped = 0;

  // Get invoice_items (including those without product_id - we'll link products by catalogue_number)
  const { data: invoiceItems } = await admin
    .from("invoice_items")
    .select(`
      id,
      invoice_id,
      product_id,
      invoice_quantity,
      product_catalogue_number,
      product_description
    `)
    .limit(1000);

  console.log(`Found ${invoiceItems?.length || 0} invoice items`);

  // Get all products to create lookup map
  const { data: allProducts } = await admin
    .from("products")
    .select("id, product_id, catalogue_number, sku");

  const productsByCatalogue = new Map();
  const productsByProductId = new Map();
  
  for (const prod of allProducts || []) {
    if (prod.catalogue_number) {
      productsByCatalogue.set(prod.catalogue_number.toLowerCase().trim(), prod.id);
    }
    if (prod.product_id) {
      productsByProductId.set(prod.product_id, prod.id);
    }
  }

  console.log(`Loaded ${allProducts?.length || 0} products for lookup`);

  // Group items by order and product
  const orderItemMap = new Map(); // (order_id_uuid, product_id_uuid) -> quantity

  for (const item of invoiceItems || []) {
    // Try to find product_id - first check if already linked, then try catalogue_number
    let productId = item.product_id;
    
    if (!productId && item.product_catalogue_number) {
      const catalogueKey = item.product_catalogue_number.toLowerCase().trim();
      productId = productsByCatalogue.get(catalogueKey);
    }

    // Skip if still no product_id
    if (!productId) {
      console.warn(`Skipping invoice_item ${item.id}: no product_id or catalogue_number match`);
      continue;
    }

    // Get order for this invoice
    const { data: invoiceOrder } = await admin
      .from("invoice_orders")
      .select("order_number, order_id")
      .eq("invoice_id", item.invoice_id)
      .limit(1)
      .maybeSingle();

    if (!invoiceOrder || !invoiceOrder.order_number) {
      console.warn(`Skipping invoice_item ${item.id}: no invoice_order found`);
      continue;
    }

    const orderData = orderMap.get(invoiceOrder.order_number);
    if (!orderData || !orderData.id) {
      console.warn(`Skipping invoice_item ${item.id}: order not found for ${invoiceOrder.order_number}`);
      continue;
    }

    // Use order_id (integer) from orders table, not UUID id
    const orderIdInt = orderData.order_id || orderData.id;
    const key = `${orderIdInt}-${productId}`;
    if (!orderItemMap.has(key)) {
      orderItemMap.set(key, {
        order_id: orderIdInt, // INTEGER, not UUID
        product_id: productId, // UUID
        quantity: 0,
      });
    }

    const orderItem = orderItemMap.get(key);
    orderItem.quantity += Number(item.invoice_quantity) || 0;
  }

  console.log(`Grouped into ${orderItemMap.size} unique order-product combinations`);

  // Create order_items
  for (const [key, itemData] of orderItemMap.entries()) {
    // Check if exists - order_items uses integer order_id
    const { data: existingItem } = await admin
      .from("order_items")
      .select("id")
      .eq("order_id", itemData.order_id) // This is integer
      .eq("product_id", itemData.product_id) // This is UUID
      .maybeSingle();

    if (existingItem) {
      itemsSkipped++;
      continue;
    }

    // order_items table expects: order_id (integer), product_id (integer)
    // itemData.product_id is UUID, need to get product.product_id (integer)
    const { data: product } = await admin
      .from("products")
      .select("product_id")
      .eq("id", itemData.product_id)
      .maybeSingle();

    if (!product || !product.product_id) {
      console.warn(`Skipping order_item: product not found for UUID ${itemData.product_id}`);
      continue;
    }

    const { error: itemError } = await admin
      .from("order_items")
      .insert({
        order_id: itemData.order_id, // INTEGER
        product_id: product.product_id, // INTEGER, not UUID
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
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`Orders created: ${ordersCreated}`);
  console.log(`Orders skipped: ${ordersSkipped}`);
  console.log(`Order items created: ${itemsCreated}`);
  console.log(`Order items skipped: ${itemsSkipped}`);
  console.log(`Invoice orders updated: ${updated}`);
  console.log("=".repeat(80));
}

linkInvoicesToOrders().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
