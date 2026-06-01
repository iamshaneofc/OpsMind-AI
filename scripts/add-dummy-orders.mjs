import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Add dummy orders for showcase
 */
async function addDummyOrders() {
  console.log("=".repeat(80));
  console.log("ADDING DUMMY ORDERS FOR SHOWCASE");
  console.log("=".repeat(80));
  console.log();

  try {
    // Step 1: Get companies
    console.log("Step 1: Fetching companies...");
    const { data: companies, error: companiesError } = await admin
      .from("companies")
      .select("company_id, company_name")
      .in("company_id", [8, 9]) // Krisshna Enterprise and Viraj Life Science
      .order("company_id");

    if (companiesError) throw companiesError;

    const krisshnaCompany = companies?.find((c) => c.company_id === 8);
    const virajCompany = companies?.find((c) => c.company_id === 9);

    if (!krisshnaCompany || !virajCompany) {
      throw new Error("Required companies not found");
    }

    console.log(`  ✓ Found: ${krisshnaCompany.company_name} (ID: ${krisshnaCompany.company_id})`);
    console.log(`  ✓ Found: ${virajCompany.company_name} (ID: ${virajCompany.company_id})`);

    // Step 2: Get warehouses
    console.log("\nStep 2: Fetching warehouses...");
    const { data: warehouses, error: warehousesError } = await admin
      .from("warehouses")
      .select("warehouse_id, warehouse_name")
      .in("warehouse_id", [1, 3]) // SRL Central Warehouse and Delhi Central
      .order("warehouse_id");

    if (warehousesError) throw warehousesError;

    const srlCentral = warehouses?.find((w) => w.warehouse_id === 1);
    const delhiCentral = warehouses?.find((w) => w.warehouse_id === 3);

    if (!srlCentral || !delhiCentral) {
      throw new Error("Required warehouses not found");
    }

    console.log(`  ✓ Found: ${srlCentral.warehouse_name} (ID: ${srlCentral.warehouse_id})`);
    console.log(`  ✓ Found: ${delhiCentral.warehouse_name} (ID: ${delhiCentral.warehouse_id})`);

    // Step 3: Get some products
    console.log("\nStep 3: Fetching products...");
    const { data: products, error: productsError } = await admin
      .from("products")
      .select("product_id, product_name, sku, catalogue_number")
      .limit(20);

    if (productsError) throw productsError;

    console.log(`  ✓ Found ${products?.length || 0} products`);

    if (!products || products.length === 0) {
      console.log("  ⚠️  No products found - orders will be created without items");
    }

    // Step 4: Create dummy orders
    console.log("\nStep 4: Creating dummy orders...");
    const today = new Date();
    const orders = [];

    // Helper to format date
    const formatDate = (date) => date.toISOString().split("T")[0];

    // Helper to get date N days from today
    const daysFromNow = (days) => {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return formatDate(d);
    };

    // Krisshna Enterprise Orders
    orders.push(
      {
        order_number: "SRL-2026-001",
        company_id: krisshnaCompany.company_id,
        warehouse_id: srlCentral.warehouse_id,
        status: "IN_PREPARATION",
        order_status: "Work in Progress",
        order_date: daysFromNow(-5),
        expected_delivery_date: daysFromNow(3),
        original_eta: daysFromNow(2),
        revised_eta: null,
        delay_reason: null,
        delivery_date: null,
        order_value: 45000,
        delivery_location: "Guwahati",
      },
      {
        order_number: "SRL-2026-002",
        company_id: krisshnaCompany.company_id,
        warehouse_id: delhiCentral.warehouse_id,
        status: "DISPATCH_READY",
        order_status: "Work in Progress",
        order_date: daysFromNow(-10),
        expected_delivery_date: daysFromNow(1),
        original_eta: daysFromNow(-2),
        revised_eta: daysFromNow(1),
        delay_reason: "Delayed due to warehouse processing backlog",
        delivery_date: null,
        order_value: 32000,
        delivery_location: "Guwahati",
      },
      {
        order_number: "SRL-2026-003",
        company_id: krisshnaCompany.company_id,
        warehouse_id: srlCentral.warehouse_id,
        status: "DELIVERED",
        order_status: "Delivered",
        order_date: daysFromNow(-15),
        expected_delivery_date: daysFromNow(-8),
        original_eta: daysFromNow(-10),
        revised_eta: null,
        delay_reason: null,
        delivery_date: daysFromNow(-8),
        order_value: 28000,
        delivery_location: "Guwahati",
      },
      {
        order_number: "SRL-2026-004",
        company_id: krisshnaCompany.company_id,
        warehouse_id: delhiCentral.warehouse_id,
        status: "IN_TRANSIT",
        order_status: "Running Late",
        order_date: daysFromNow(-12),
        expected_delivery_date: daysFromNow(-3),
        original_eta: daysFromNow(-5),
        revised_eta: daysFromNow(2),
        delay_reason: "Order stuck in transit due to transportation delay",
        delivery_date: null,
        order_value: 55000,
        delivery_location: "Guwahati",
      },
      {
        order_number: "SRL-2026-005",
        company_id: krisshnaCompany.company_id,
        warehouse_id: srlCentral.warehouse_id,
        status: "AWAITING_FACTORY",
        order_status: "Work in Progress",
        order_date: daysFromNow(-3),
        expected_delivery_date: daysFromNow(5),
        original_eta: daysFromNow(4),
        revised_eta: null,
        delay_reason: null,
        delivery_date: null,
        order_value: 38000,
        delivery_location: "Guwahati",
      }
    );

    // Viraj Life Science Orders
    orders.push(
      {
        order_number: "SRL-2026-101",
        company_id: virajCompany.company_id,
        warehouse_id: srlCentral.warehouse_id,
        status: "IN_PREPARATION",
        order_status: "Work in Progress",
        order_date: daysFromNow(-7),
        expected_delivery_date: daysFromNow(4),
        original_eta: daysFromNow(3),
        revised_eta: null,
        delay_reason: null,
        delivery_date: null,
        order_value: 42000,
        delivery_location: "Haridwar",
      },
      {
        order_number: "SRL-2026-102",
        company_id: virajCompany.company_id,
        warehouse_id: delhiCentral.warehouse_id,
        status: "DISPATCH_READY",
        order_status: "Running Late",
        order_date: daysFromNow(-14),
        expected_delivery_date: daysFromNow(-2),
        original_eta: daysFromNow(-4),
        revised_eta: daysFromNow(3),
        delay_reason: "Items delayed in warehouse due to quality check",
        delivery_date: null,
        order_value: 35000,
        delivery_location: "Haridwar",
      },
      {
        order_number: "SRL-2026-103",
        company_id: virajCompany.company_id,
        warehouse_id: srlCentral.warehouse_id,
        status: "DELIVERED",
        order_status: "Delivered",
        order_date: daysFromNow(-20),
        expected_delivery_date: daysFromNow(-12),
        original_eta: daysFromNow(-15),
        revised_eta: null,
        delay_reason: null,
        delivery_date: daysFromNow(-12),
        order_value: 29000,
        delivery_location: "Haridwar",
      },
      {
        order_number: "SRL-2026-104",
        company_id: virajCompany.company_id,
        warehouse_id: delhiCentral.warehouse_id,
        status: "IN_PREPARATION",
        order_status: "Work in Progress",
        order_date: daysFromNow(-2),
        expected_delivery_date: daysFromNow(6),
        original_eta: daysFromNow(5),
        revised_eta: null,
        delay_reason: null,
        delivery_date: null,
        order_value: 48000,
        delivery_location: "Haridwar",
      },
      {
        order_number: "SRL-2026-105",
        company_id: virajCompany.company_id,
        warehouse_id: srlCentral.warehouse_id,
        status: "CANCELLED",
        order_status: "Cancelled",
        order_date: daysFromNow(-8),
        expected_delivery_date: daysFromNow(2),
        original_eta: daysFromNow(1),
        revised_eta: null,
        delay_reason: "Order cancelled by customer",
        delivery_date: null,
        order_value: 25000,
        delivery_location: "Haridwar",
      }
    );

    // Step 5: Insert orders
    console.log(`  Creating ${orders.length} orders...`);
    const createdOrders = [];
    const orderItems = [];

    for (const orderData of orders) {
      // Check if order already exists
      const { data: existing, error: checkError } = await admin
        .from("orders")
        .select("order_id, id, order_number")
        .eq("order_number", orderData.order_number)
        .maybeSingle();

      if (existing) {
        console.log(`    ⚠️  Order ${orderData.order_number} already exists, skipping`);
        createdOrders.push(existing);
        continue;
      }

      const { data: order, error: orderError } = await admin
        .from("orders")
        .insert(orderData)
        .select("order_id, id, order_number, company_id, warehouse_id")
        .single();

      if (orderError) {
        console.error(`    ❌ Error creating order ${orderData.order_number}:`, orderError.message);
        continue;
      }

      console.log(`    ✓ Created order: ${order.order_number} (${orderData.order_status})`);
      createdOrders.push(order);

      // Add order items (2-4 items per order)
      if (products && products.length > 0) {
        const itemCount = Math.floor(Math.random() * 3) + 2; // 2-4 items
        const selectedProducts = products
          .sort(() => Math.random() - 0.5)
          .slice(0, itemCount);

        for (const product of selectedProducts) {
          const quantity = Math.floor(Math.random() * 20) + 5; // 5-24 units

          const { data: orderItem, error: itemError } = await admin
            .from("order_items")
            .insert({
              order_id: order.order_id, // Use integer order_id
              product_id: product.product_id, // Use integer product_id
              quantity: quantity,
            })
            .select("id, order_id, product_id, quantity")
            .single();

          if (itemError) {
            console.error(`      ❌ Error adding item for order ${order.order_number}:`, itemError.message);
          } else {
            orderItems.push(orderItem);
          }
        }
      }
    }

    // Step 6: Summary
    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total orders created: ${createdOrders.length}`);
    console.log(`Total order items created: ${orderItems.length}`);

    console.log("\n📋 Orders by Company:");
    const krisshnaOrders = createdOrders.filter((o) => o.company_id === krisshnaCompany.company_id);
    const virajOrders = createdOrders.filter((o) => o.company_id === virajCompany.company_id);

    console.log(`\n  ${krisshnaCompany.company_name}: ${krisshnaOrders.length} orders`);
    krisshnaOrders.forEach((o) => {
      console.log(`    - ${o.order_number}`);
    });

    console.log(`\n  ${virajCompany.company_name}: ${virajOrders.length} orders`);
    virajOrders.forEach((o) => {
      console.log(`    - ${o.order_number}`);
    });

    console.log("\n📊 Orders by Status:");
    const statusCounts = {};
    createdOrders.forEach((o) => {
      const status = o.order_status || "Unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    console.log("\n✅ Dummy orders created successfully!");

  } catch (error) {
    console.error("\n❌ Error adding dummy orders:", error);
    throw error;
  }
}

// Run the script
addDummyOrders()
  .then(() => {
    console.log("\n✅ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
