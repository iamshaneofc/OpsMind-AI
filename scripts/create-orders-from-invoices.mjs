import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Create Orders from Invoice Data
 * 
 * This script creates orders in the orders table from invoice_orders data
 * It also creates order_items from invoice_items data
 */

async function createOrdersFromInvoices() {
  console.log("================================================================================");
  console.log("CREATE ORDERS FROM INVOICE DATA");
  console.log("================================================================================");
  console.log();

  // Step 1: Get unique orders from invoice_orders
  console.log("Step 1: Fetching unique orders from invoice_orders...");
  const { data: invoiceOrders, error: ioError } = await admin
    .from("invoice_orders")
    .select("order_number, order_date, customer_po_number, customer_po_date, order_total_amount, payment_terms")
    .not("order_number", "is", null);

  if (ioError) {
    console.error("Error fetching invoice orders:", ioError);
    return;
  }

  console.log(`Found ${invoiceOrders?.length || 0} invoice-order records`);

  // Get unique order numbers
  const uniqueOrderNumbers = [...new Set(invoiceOrders?.map(io => io.order_number).filter(Boolean) || [])];
  console.log(`Found ${uniqueOrderNumbers.length} unique order numbers`);

  // Step 2: Get invoices to extract company_id
  console.log("\nStep 2: Fetching invoices to get company information...");
  const { data: invoices } = await admin
    .from("invoices")
    .select("id, invoice_id, company_id, customer_id")
    .not("company_id", "is", null);

  console.log(`Found ${invoices?.length || 0} invoices with company_id`);

  // Create invoice -> company map
  const invoiceCompanyMap = new Map();
  for (const inv of invoices || []) {
    invoiceCompanyMap.set(inv.id, inv.company_id);
  }

  // Step 3: Get or create a default warehouse
  console.log("\nStep 3: Getting or creating default warehouse...");
  let defaultWarehouseId = null;
  
  // First, check what columns exist in warehouses table
  const { data: allWarehouses } = await admin
    .from("warehouses")
    .select("*")
    .limit(1);

  if (allWarehouses && allWarehouses.length > 0) {
    defaultWarehouseId = allWarehouses[0].id;
    console.log(`Using existing warehouse: ${defaultWarehouseId}`);
  } else {
    // Try to create warehouse - check schema first
    const warehousePayload = {};
    
    // Try different possible column names
    try {
      const { data: newWarehouse, error: whError } = await admin
        .from("warehouses")
        .insert({
          name: "Default Warehouse",
          location: "Mumbai",
        })
        .select("id")
        .single();

      if (!whError && newWarehouse) {
        defaultWarehouseId = newWarehouse.id;
        console.log(`Created default warehouse: ${defaultWarehouseId}`);
      } else {
        // Try with warehouse_name instead of name
        const { data: newWarehouse2, error: whError2 } = await admin
          .from("warehouses")
          .insert({
            warehouse_name: "Default Warehouse",
            location: "Mumbai",
          })
          .select("id")
          .single();

        if (!whError2 && newWarehouse2) {
          defaultWarehouseId = newWarehouse2.id;
          console.log(`Created default warehouse: ${defaultWarehouseId}`);
        } else {
          console.warn("Could not create warehouse, will try to proceed without warehouse_id");
        }
      }
    } catch (e) {
      console.warn("Error creating warehouse:", e.message);
    }
  }

  if (!defaultWarehouseId) {
    console.error("No warehouse available. Cannot create orders.");
    return;
  }

  // Step 4: Create orders
  console.log("\nStep 4: Creating orders...");
  let ordersCreated = 0;
  let ordersSkipped = 0;
  const orderMap = new Map(); // order_number -> order UUID

  for (const orderNumber of uniqueOrderNumbers) {
    // Check if order already exists
    const { data: existingOrder } = await admin
      .from("orders")
      .select("id, company_id")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (existingOrder) {
      orderMap.set(orderNumber, existingOrder.id);
      ordersSkipped++;
      continue;
    }

    // Get order data from first invoice_order record
    const orderData = invoiceOrders?.find(io => io.order_number === orderNumber);
    if (!orderData) continue;

    // Find company_id from an invoice linked to this order
    let companyId = null;
    const { data: linkedInvoiceOrder } = await admin
      .from("invoice_orders")
      .select("invoice_id")
      .eq("order_number", orderNumber)
      .limit(1)
      .maybeSingle();

    if (linkedInvoiceOrder) {
      companyId = invoiceCompanyMap.get(linkedInvoiceOrder.invoice_id);
    }

    // If no company_id found, try to get from companies table (first company)
    if (!companyId) {
      const { data: firstCompany } = await admin
        .from("companies")
        .select("id")
        .limit(1)
        .maybeSingle();
      companyId = firstCompany?.id || null;
    }

    // Create order
    const orderPayload = {
      order_number: orderNumber,
      company_id: companyId,
      warehouse_id: defaultWarehouseId,
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

  // Step 5: Create order_items from invoice_items
  console.log("\nStep 5: Creating order_items from invoice_items...");
  let itemsCreated = 0;
  let itemsSkipped = 0;

  // Get all invoice_items with their invoices
  const { data: invoiceItems } = await admin
    .from("invoice_items")
    .select(`
      id,
      invoice_id,
      product_id,
      invoice_quantity,
      order_body_id,
      product_catalogue_number
    `)
    .not("product_id", "is", null);

  console.log(`Found ${invoiceItems?.length || 0} invoice items`);

  // Group items by order_number and product_id
  const orderItemMap = new Map(); // (order_number, product_id) -> { quantity, order_id }

  for (const item of invoiceItems || []) {
    // Get order_number for this invoice
    const { data: invoiceOrder } = await admin
      .from("invoice_orders")
      .select("order_number")
      .eq("invoice_id", item.invoice_id)
      .limit(1)
      .maybeSingle();

    if (!invoiceOrder || !invoiceOrder.order_number) continue;

    const orderId = orderMap.get(invoiceOrder.order_number);
    if (!orderId) continue;

    const key = `${orderId}-${item.product_id}`;
    if (!orderItemMap.has(key)) {
      orderItemMap.set(key, {
        order_id: orderId,
        product_id: item.product_id,
        quantity: 0,
        order_number: invoiceOrder.order_number,
      });
    }

    const orderItem = orderItemMap.get(key);
    orderItem.quantity += Number(item.invoice_quantity) || 0;
  }

  // Create order_items
  for (const [key, itemData] of orderItemMap.entries()) {
    // Check if order_item already exists
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
      console.error(`Error creating order_item for order ${itemData.order_number}, product ${itemData.product_id}:`, itemError.message);
      continue;
    }

    itemsCreated++;
  }

  console.log(`✓ Created ${itemsCreated} order items`);
  console.log(`✓ Skipped ${itemsSkipped} existing items`);

  // Step 6: Update invoice_orders with order_id
  console.log("\nStep 6: Updating invoice_orders with order_id...");
  let updated = 0;
  let updateErrors = 0;

  for (const [orderNumber, orderId] of orderMap.entries()) {
    const { error: updateError } = await admin
      .from("invoice_orders")
      .update({ order_id: orderId })
      .eq("order_number", orderNumber)
      .is("order_id", null);

    if (updateError) {
      console.error(`Error updating invoice_orders for ${orderNumber}:`, updateError.message);
      updateErrors++;
    } else {
      updated++;
    }
  }

  console.log(`✓ Updated ${updated} invoice_orders with order_id`);
  if (updateErrors > 0) {
    console.log(`⚠ ${updateErrors} update errors`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`Orders created: ${ordersCreated}`);
  console.log(`Orders skipped (already exist): ${ordersSkipped}`);
  console.log(`Order items created: ${itemsCreated}`);
  console.log(`Order items skipped (already exist): ${itemsSkipped}`);
  console.log(`Invoice orders updated: ${updated}`);
  console.log("=".repeat(80));
}

createOrdersFromInvoices().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
