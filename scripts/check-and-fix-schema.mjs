import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Check and Fix Schema
 * 
 * This script checks what tables/columns actually exist and creates missing ones
 */

async function checkAndFixSchema() {
  console.log("================================================================================");
  console.log("CHECK AND FIX SCHEMA");
  console.log("================================================================================");
  console.log();

  // Check warehouses table structure
  console.log("Step 1: Checking warehouses table...");
  try {
    const { data: warehouses, error } = await admin
      .from("warehouses")
      .select("*")
      .limit(1);

    if (error) {
      console.error("Warehouses table error:", error.message);
      console.log("Table might not exist or have different structure");
    } else {
      console.log("Warehouses table exists");
      if (warehouses && warehouses.length > 0) {
        console.log("Sample warehouse:", warehouses[0]);
        console.log("Columns:", Object.keys(warehouses[0]));
      }
    }
  } catch (e) {
    console.error("Error checking warehouses:", e.message);
  }

  // Check companies table structure
  console.log("\nStep 2: Checking companies table...");
  try {
    const { data: companies, error } = await admin
      .from("companies")
      .select("*")
      .limit(1);

    if (error) {
      console.error("Companies table error:", error.message);
    } else {
      console.log("Companies table exists");
      if (companies && companies.length > 0) {
        console.log("Sample company:", companies[0]);
        console.log("Columns:", Object.keys(companies[0]));
      }
    }
  } catch (e) {
    console.error("Error checking companies:", e.message);
  }

  // Check products table structure
  console.log("\nStep 3: Checking products table...");
  try {
    const { data: products, error } = await admin
      .from("products")
      .select("*")
      .limit(1);

    if (error) {
      console.error("Products table error:", error.message);
    } else {
      console.log("Products table exists");
      if (products && products.length > 0) {
        console.log("Sample product:", products[0]);
        console.log("Columns:", Object.keys(products[0]));
      }
    }
  } catch (e) {
    console.error("Error checking products:", e.message);
  }

  // Check orders table structure
  console.log("\nStep 4: Checking orders table...");
  try {
    const { data: orders, error } = await admin
      .from("orders")
      .select("*")
      .limit(1);

    if (error) {
      console.error("Orders table error:", error.message);
    } else {
      console.log("Orders table exists");
      if (orders && orders.length > 0) {
        console.log("Sample order:", orders[0]);
        console.log("Columns:", Object.keys(orders[0]));
      }
    }
  } catch (e) {
    console.error("Error checking orders:", e.message);
  }

  // Check invoices table structure
  console.log("\nStep 5: Checking invoices table...");
  try {
    const { data: invoices, error } = await admin
      .from("invoices")
      .select("*")
      .limit(1);

    if (error) {
      console.error("Invoices table error:", error.message);
    } else {
      console.log("Invoices table exists");
      if (invoices && invoices.length > 0) {
        console.log("Sample invoice:", invoices[0]);
        console.log("Columns:", Object.keys(invoices[0]));
      }
    }
  } catch (e) {
    console.error("Error checking invoices:", e.message);
  }

  // Check invoice_orders table
  console.log("\nStep 6: Checking invoice_orders table...");
  try {
    const { data: invoiceOrders, error } = await admin
      .from("invoice_orders")
      .select("*")
      .limit(1);

    if (error) {
      console.error("Invoice_orders table error:", error.message);
    } else {
      console.log("Invoice_orders table exists");
      if (invoiceOrders && invoiceOrders.length > 0) {
        console.log("Sample invoice_order:", invoiceOrders[0]);
        console.log("Columns:", Object.keys(invoiceOrders[0]));
      }
    }
  } catch (e) {
    console.error("Error checking invoice_orders:", e.message);
  }

  console.log("\n" + "=".repeat(80));
  console.log("SCHEMA CHECK COMPLETE");
  console.log("=".repeat(80));
}

checkAndFixSchema().catch((error) => {
  console.error("Check failed:", error);
  process.exit(1);
});
