import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Migration Script: Link Invoices to Orders and Create Proforma Invoices
 * 
 * This script:
 * 1. Links existing invoices to orders via invoice_orders table
 * 2. Creates proforma invoice records from order data
 * 3. Calculates and sets order statuses
 * 4. Calculates item statuses
 */

async function migrateInvoicesToOrders() {
  console.log("================================================================================");
  console.log("INVOICE TO ORDER MIGRATION");
  console.log("================================================================================");
  console.log();

  // Step 1: Get all invoices with their linked orders
  console.log("Step 1: Fetching invoices and linked orders...");
  const { data: invoices, error: invoicesError } = await admin
    .from("invoices")
    .select("id, invoice_id, invoice_number, invoice_date, invoice_total_amount, company_id, customer_id, account_id")
    .order("invoice_date", { ascending: false });

  if (invoicesError) {
    console.error("Error fetching invoices:", invoicesError);
    return;
  }

  console.log(`Found ${invoices?.length || 0} invoices`);

  // Step 2: Get all invoice_orders (already linked)
  console.log("\nStep 2: Fetching invoice-order links...");
  const { data: invoiceOrders, error: ioError } = await admin
    .from("invoice_orders")
    .select("id, invoice_id, order_number, order_id, order_date, order_total_amount")
    .order("order_date", { ascending: false });

  if (ioError) {
    console.error("Error fetching invoice orders:", ioError);
    return;
  }

  console.log(`Found ${invoiceOrders?.length || 0} invoice-order links`);

  // Step 3: Get all orders from orders table
  console.log("\nStep 3: Fetching orders...");
  const { data: orders, error: ordersError } = await admin
    .from("orders")
    .select("id, order_number, company_id, status, expected_delivery_date, created_at")
    .order("created_at", { ascending: false });

  if (ordersError) {
    console.error("Error fetching orders:", ordersError);
    return;
  }

  console.log(`Found ${orders?.length || 0} orders`);

  // Step 4: Create order map by order_number
  const orderMap = new Map();
  orders?.forEach((order) => {
    if (order.order_number) {
      orderMap.set(String(order.order_number), order);
    }
  });

  // Step 5: Group invoice_orders by order_number to create proforma invoices
  console.log("\nStep 4: Creating proforma invoices from orders...");
  const orderToInvoices = new Map();

  invoiceOrders?.forEach((io) => {
    const orderNum = io.order_number;
    if (!orderNum) return;

    if (!orderToInvoices.has(orderNum)) {
      orderToInvoices.set(orderNum, {
        order_number: orderNum,
        order: orderMap.get(orderNum),
        invoices: [],
        invoice_orders: [],
      });
    }

    const orderData = orderToInvoices.get(orderNum);
    const invoice = invoices?.find((inv) => inv.id === io.invoice_id);
    if (invoice) {
      orderData.invoices.push(invoice);
      orderData.invoice_orders.push(io);
    }
  });

  console.log(`Found ${orderToInvoices.size} unique orders with invoices`);

  // Step 6: Create proforma invoices
  let proformaCreated = 0;
  let proformaErrors = 0;

  for (const [orderNumber, orderData] of orderToInvoices.entries()) {
    if (!orderData.order) {
      console.warn(`Order ${orderNumber} not found in orders table, skipping proforma creation`);
      continue;
    }

    try {
      // Check if proforma invoice already exists
      const { data: existingProforma } = await admin
        .from("proforma_invoices")
        .select("id")
        .eq("order_id", orderData.order.id)
        .limit(1)
        .maybeSingle();

      if (existingProforma) {
        console.log(`Proforma invoice already exists for order ${orderNumber}, skipping`);
        continue;
      }

      // Calculate totals from invoices
      const totalAmount = orderData.invoices.reduce((sum, inv) => sum + (Number(inv.invoice_total_amount) || 0), 0);
      const baseAmount = orderData.invoices.reduce((sum, inv) => sum + (Number(inv.base_amount) || 0), 0);
      const taxAmount = orderData.invoices.reduce((sum, inv) => sum + (Number(inv.tax_amount) || 0), 0);

      // Create proforma invoice
      const proformaNumber = `PRO-${orderNumber}-${Date.now()}`;
      const { data: proforma, error: proformaError } = await admin
        .from("proforma_invoices")
        .insert({
          proforma_number: proformaNumber,
          order_id: orderData.order.id,
          company_id: orderData.order.company_id,
          proforma_date: orderData.order.created_at || new Date().toISOString(),
          status: "Invoiced", // All invoices are already generated
          total_amount: totalAmount,
          base_amount: baseAmount,
          tax_amount: taxAmount,
        })
        .select("id")
        .single();

      if (proformaError) {
        console.error(`Error creating proforma for order ${orderNumber}:`, proformaError.message);
        proformaErrors++;
        continue;
      }

      // Link invoices to proforma invoice
      const invoiceIds = orderData.invoices.map((inv) => inv.id);
      const { error: updateError } = await admin
        .from("invoices")
        .update({ proforma_invoice_id: proforma.id })
        .in("id", invoiceIds);

      if (updateError) {
        console.error(`Error linking invoices to proforma for order ${orderNumber}:`, updateError.message);
      }

      proformaCreated++;
      if (proformaCreated % 5 === 0) {
        console.log(`Created ${proformaCreated} proforma invoices...`);
      }
    } catch (error) {
      console.error(`Error processing order ${orderNumber}:`, error.message);
      proformaErrors++;
    }
  }

  console.log(`\nProforma invoices created: ${proformaCreated}`);
  console.log(`Proforma errors: ${proformaErrors}`);

  // Step 7: Update order statuses
  console.log("\nStep 5: Updating order statuses...");
  let ordersUpdated = 0;
  let orderErrors = 0;

  for (const [orderNumber, orderData] of orderToInvoices.entries()) {
    if (!orderData.order) continue;

    try {
      const order = orderData.order;
      const today = new Date();
      const expectedDate = order.expected_delivery_date ? new Date(order.expected_delivery_date) : null;

      // Calculate order status
      let orderStatus = "Work in Progress";
      let delayReason = null;

      // Check if any invoice has delivery date (date_of_removal)
      const hasDelivery = orderData.invoices.some((inv) => {
        // Check invoice_orders for date_of_removal
        const io = orderData.invoice_orders.find((io) => io.invoice_id === inv.id);
        return io && inv.date_of_removal;
      });

      if (hasDelivery) {
        orderStatus = "Delivered";
      } else if (expectedDate && today > expectedDate) {
        orderStatus = "Running Late";
        delayReason = "Past expected delivery date";
      }

      // Update order
      const updateData = {
        order_status: orderStatus,
        original_eta: expectedDate ? expectedDate.toISOString().split("T")[0] : null,
        delay_reason: delayReason,
      };

      const { error: updateError } = await admin
        .from("orders")
        .update(updateData)
        .eq("id", order.id);

      if (updateError) {
        console.error(`Error updating order ${orderNumber}:`, updateError.message);
        orderErrors++;
      } else {
        ordersUpdated++;
      }
    } catch (error) {
      console.error(`Error processing order ${orderNumber}:`, error.message);
      orderErrors++;
    }
  }

  console.log(`Orders updated: ${ordersUpdated}`);
  console.log(`Order errors: ${orderErrors}`);

  // Step 8: Calculate item statuses
  console.log("\nStep 6: Calculating item statuses...");
  let itemsUpdated = 0;
  let itemErrors = 0;

  for (const [orderNumber, orderData] of orderToInvoices.entries()) {
    if (!orderData.order) continue;

    try {
      // Get order items
      const { data: orderItems } = await admin
        .from("order_items")
        .select("id, product_id, quantity")
        .eq("order_id", orderData.order.id);

      if (!orderItems || orderItems.length === 0) continue;

      // Get invoice items for this order
      const invoiceIds = orderData.invoices.map((inv) => inv.id);
      const { data: invoiceItems } = await admin
        .from("invoice_items")
        .select("product_id, invoice_quantity")
        .in("invoice_id", invoiceIds);

      // Calculate processed quantities per product
      const processedByProduct = new Map();
      invoiceItems?.forEach((item) => {
        const productId = item.product_id;
        const qty = Number(item.invoice_quantity) || 0;
        processedByProduct.set(productId, (processedByProduct.get(productId) || 0) + qty);
      });

      // Update order items
      for (const orderItem of orderItems) {
        const orderedQty = Number(orderItem.quantity) || 0;
        const processedQty = processedByProduct.get(orderItem.product_id) || 0;
        const pendingQty = Math.max(0, orderedQty - processedQty);

        let itemStatus = "Ordered";
        if (processedQty >= orderedQty) {
          itemStatus = "Processed";
        } else if (processedQty > 0) {
          itemStatus = "Pending";
        }

        // Check if delayed (if order is running late)
        const delayedQty = orderData.order.status === "Running Late" ? pendingQty : 0;

        const { error: updateError } = await admin
          .from("order_items")
          .update({
            item_status: itemStatus,
            processed_quantity: processedQty,
            pending_quantity: pendingQty,
            delayed_quantity: delayedQty,
          })
          .eq("id", orderItem.id);

        if (updateError) {
          console.error(`Error updating order item ${orderItem.id}:`, updateError.message);
          itemErrors++;
        } else {
          itemsUpdated++;
        }
      }
    } catch (error) {
      console.error(`Error processing items for order ${orderNumber}:`, error.message);
      itemErrors++;
    }
  }

  console.log(`Items updated: ${itemsUpdated}`);
  console.log(`Item errors: ${itemErrors}`);

  console.log("\n================================================================================");
  console.log("MIGRATION COMPLETE");
  console.log("================================================================================");
  console.log(`Proforma invoices created: ${proformaCreated}`);
  console.log(`Orders updated: ${ordersUpdated}`);
  console.log(`Items updated: ${itemsUpdated}`);
  console.log(`Total errors: ${proformaErrors + orderErrors + itemErrors}`);
  console.log("================================================================================");
}

migrateInvoicesToOrders().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
