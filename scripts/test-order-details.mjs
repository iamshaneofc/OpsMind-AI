import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function testOrderDetails() {
  console.log("Testing order details for OpsMind-2026-001...\n");

  // Get order
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("order_id, order_number, company_id, warehouse_id, order_status, expected_delivery_date")
    .eq("order_number", "OpsMind-2026-001")
    .single();

  if (orderError || !order) {
    console.error("Order not found:", orderError);
    return;
  }

  console.log("Order found:");
  console.log(`  Order Number: ${order.order_number}`);
  console.log(`  Order ID: ${order.order_id}`);
  console.log(`  Status: ${order.order_status}`);
  console.log(`  Expected Delivery: ${order.expected_delivery_date}`);

  // Get order items
  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("id, order_id, product_id, quantity")
    .eq("order_id", order.order_id);

  if (itemsError) {
    console.error("Error fetching items:", itemsError);
    return;
  }

  console.log(`\nOrder Items: ${items?.length || 0}`);

  if (items && items.length > 0) {
    // Get products
    const productIds = items.map((i) => i.product_id).filter(Boolean);
    const { data: products, error: productsError } = await admin
      .from("products")
      .select("product_id, product_name, sku")
      .in("product_id", productIds);

    if (productsError) {
      console.error("Error fetching products:", productsError);
      return;
    }

    const productMap = new Map((products || []).map((p) => [p.product_id, p]));

    items.forEach((item, idx) => {
      const product = productMap.get(item.product_id);
      console.log(`\n  Item ${idx + 1}:`);
      console.log(`    Product: ${product?.product_name || "Unknown"}`);
      console.log(`    SKU: ${product?.sku || "N/A"}`);
      console.log(`    Quantity: ${item.quantity}`);
    });
  } else {
    console.log("  No items found for this order.");
  }

  console.log("\n✅ Test complete!");
}

testOrderDetails()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
