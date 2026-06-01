import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Setup Realistic Delay Scenarios for Demo
 * Updates orders with realistic ETAs and delay reasons
 */

const delayReasons = [
  "Stuck in warehouse - awaiting dispatch",
  "Factory production delay - awaiting quality check",
  "Transportation delay - vehicle breakdown",
  "Warehouse processing delay - inventory shortage",
  "Factory delay - raw material shortage",
  "Logistics delay - courier service issue",
  "Quality control delay - additional testing required",
];

async function setupDelayScenarios() {
  console.log("=".repeat(80));
  console.log("SETTING UP DELAY SCENARIOS FOR DEMO");
  console.log("=".repeat(80));
  console.log();

  // Get orders that don't have delivery_date (not yet delivered)
  const { data: orders } = await admin
    .from("orders")
    .select("id, order_id, order_number, created_at, original_eta, revised_eta, delivery_date, order_status")
    .is("delivery_date", null)
    .limit(30);

  if (!orders || orders.length === 0) {
    console.log("No orders found to update");
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let updated = 0;
  let delayed = 0;

  for (const order of orders) {
    const orderDate = new Date(order.created_at || new Date());
    orderDate.setHours(0, 0, 0, 0);

    // Calculate original ETA (7 days from order date if not set)
    let originalETA = order.original_eta ? new Date(order.original_eta) : new Date(orderDate);
    if (!order.original_eta) {
      originalETA.setDate(originalETA.getDate() + 7);
    }
    originalETA.setHours(0, 0, 0, 0);

    // Determine if order should be delayed
    // Make orders delayed if original ETA is in the past
    const shouldBeDelayed = today > originalETA;
    let revisedETA = null;
    let delayReason = null;
    let orderStatus = order.order_status;

    if (shouldBeDelayed && !order.delivery_date) {
      // Order is delayed
      revisedETA = new Date(originalETA);
      const delayDays = Math.floor(Math.random() * 5) + 1; // 1-5 days delay
      revisedETA.setDate(revisedETA.getDate() + delayDays);
      delayReason = delayReasons[Math.floor(Math.random() * delayReasons.length)];
      orderStatus = "Running Late";
      delayed++;
    } else if (!order.original_eta) {
      // Set original ETA if not set (7 days from order date)
      orderStatus = orderStatus || "Work in Progress";
    } else if (!order.order_status) {
      // Set status if not set
      if (order.delivery_date) {
        orderStatus = "Delivered";
      } else if (today > originalETA) {
        orderStatus = "Running Late";
      } else {
        orderStatus = "Work in Progress";
      }
    }

    // Update order
    const updateData = {
      original_eta: originalETA.toISOString().split("T")[0],
      order_status: orderStatus,
    };

    if (revisedETA) {
      updateData.revised_eta = revisedETA.toISOString().split("T")[0];
    }

    if (delayReason) {
      updateData.delay_reason = delayReason;
    }

    try {
      const { error } = await admin
        .from("orders")
        .update(updateData)
        .eq("id", order.id);

      if (!error) {
        updated++;
        if (shouldBeDelayed) {
          console.log(`✅ Updated Order ${order.order_number}:`);
          console.log(`   Original ETA: ${originalETA.toISOString().split("T")[0]}`);
          console.log(`   Revised ETA: ${revisedETA.toISOString().split("T")[0]}`);
          console.log(`   Status: Running Late`);
          console.log(`   Delay Reason: ${delayReason}`);
          console.log();
        }
      }
    } catch (e) {
      console.error(`Error updating order ${order.order_number}:`, e.message);
    }
  }

  console.log("=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total Orders Processed: ${orders.length}`);
  console.log(`Orders Updated: ${updated}`);
  console.log(`Orders Set as Delayed: ${delayed}`);
  console.log();
  console.log("✅ Delay scenarios setup complete!");
}

setupDelayScenarios().catch((error) => {
  console.error("Setup failed:", error);
  process.exit(1);
});
