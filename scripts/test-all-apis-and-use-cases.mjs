import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";
import { executeTool } from "../src/ai/tools.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Comprehensive test suite for all APIs and use cases
 * Tests all AI tools with different user roles and scenarios
 */

// Test profiles for different roles
const testProfiles = {
  superAdmin: {
    user_id: 1,
    role: "super_admin",
    company_id: null,
    warehouse_id: null,
    email: "superadmin@srl.com",
  },
  distributor: {
    user_id: 2,
    role: "distributor",
    company_id: 1, // Assuming company_id 1 exists
    warehouse_id: null,
    email: "distributor@srl.com",
  },
  warehouse: {
    user_id: 3,
    role: "warehouse",
    company_id: null,
    warehouse_id: 2, // Assuming warehouse_id 2 exists
    email: "warehouse@srl.com",
  },
};

// Test results storage
const testResults = {
  passed: [],
  failed: [],
  warnings: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
  },
};

function logTest(testName, result, details = {}) {
  testResults.summary.total++;
  if (result === "PASS") {
    testResults.summary.passed++;
    testResults.passed.push({ test: testName, details });
    console.log(`✅ PASS: ${testName}`);
  } else if (result === "FAIL") {
    testResults.summary.failed++;
    testResults.failed.push({ test: testName, error: details.error || details, details });
    console.log(`❌ FAIL: ${testName} - ${details.error || JSON.stringify(details)}`);
  } else {
    testResults.summary.warnings++;
    testResults.warnings.push({ test: testName, warning: details.warning || details, details });
    console.log(`⚠️  WARN: ${testName} - ${details.warning || JSON.stringify(details)}`);
  }
}

async function testOrderStatusAPI() {
  console.log("\n" + "=".repeat(80));
  console.log("TESTING: Order Status API");
  console.log("=".repeat(80));

  // Get a real order number from database
  const { data: sampleOrder } = await admin
    .from("orders")
    .select("order_number")
    .limit(1)
    .maybeSingle();

  if (!sampleOrder) {
    logTest("Order Status - No orders in database", "WARN", { warning: "No orders found to test" });
    return;
  }

  const orderNumber = sampleOrder.order_number;

  // Test 1: Super Admin can access any order
  try {
    const result = await executeTool("getOrderStatus", { orderNumber }, testProfiles.superAdmin);
    if (result && !result.error) {
      logTest("Order Status - Super Admin Access", "PASS", { orderNumber, hasData: !!result });
    } else {
      logTest("Order Status - Super Admin Access", "FAIL", { error: result?.error || "No data returned" });
    }
  } catch (e) {
    logTest("Order Status - Super Admin Access", "FAIL", { error: e.message });
  }

  // Test 2: Distributor can access their company's orders
  try {
    const result = await executeTool("getOrderStatus", { orderNumber }, testProfiles.distributor);
    if (result && !result.error) {
      logTest("Order Status - Distributor Access (Same Company)", "PASS", { orderNumber });
    } else if (result?.error?.includes("denied") || result?.error?.includes("not found")) {
      logTest("Order Status - Distributor Access (Same Company)", "WARN", { warning: "Order may not belong to distributor's company" });
    } else {
      logTest("Order Status - Distributor Access (Same Company)", "FAIL", { error: result?.error });
    }
  } catch (e) {
    logTest("Order Status - Distributor Access (Same Company)", "FAIL", { error: e.message });
  }

  // Test 3: Warehouse user can access their warehouse's orders
  try {
    const result = await executeTool("getOrderStatus", { orderNumber }, testProfiles.warehouse);
    if (result && !result.error) {
      logTest("Order Status - Warehouse Access", "PASS", { orderNumber });
    } else if (result?.error?.includes("denied") || result?.error?.includes("not found")) {
      logTest("Order Status - Warehouse Access", "WARN", { warning: "Order may not belong to warehouse" });
    } else {
      logTest("Order Status - Warehouse Access", "FAIL", { error: result?.error });
    }
  } catch (e) {
    logTest("Order Status - Warehouse Access", "FAIL", { error: e.message });
  }
}

async function testInvoiceAPIs() {
  console.log("\n" + "=".repeat(80));
  console.log("TESTING: Invoice APIs");
  console.log("=".repeat(80));

  // Get a real invoice number
  const { data: sampleInvoice } = await admin
    .from("invoices")
    .select("invoice_number, invoice_id")
    .limit(1)
    .maybeSingle();

  if (!sampleInvoice) {
    logTest("Invoice APIs - No invoices in database", "WARN", { warning: "No invoices found to test" });
    return;
  }

  const invoiceNumber = sampleInvoice.invoice_number || String(sampleInvoice.invoice_id);

  // Test 1: getInvoiceDetails - Super Admin
  try {
    const result = await executeTool("getInvoiceDetails", { invoiceNumber }, testProfiles.superAdmin);
    if (result && !result.error && result.invoice) {
      logTest("getInvoiceDetails - Super Admin", "PASS", { 
        invoiceNumber, 
        hasItems: (result.items?.length || 0) > 0,
        hasOrders: (result.linked_orders?.length || 0) > 0 
      });
    } else {
      logTest("getInvoiceDetails - Super Admin", "FAIL", { error: result?.error || "No invoice data" });
    }
  } catch (e) {
    logTest("getInvoiceDetails - Super Admin", "FAIL", { error: e.message });
  }

  // Test 2: getInvoiceDetails - Distributor
  try {
    const result = await executeTool("getInvoiceDetails", { invoiceNumber }, testProfiles.distributor);
    if (result && !result.error) {
      logTest("getInvoiceDetails - Distributor (Same Company)", "PASS", { invoiceNumber });
    } else if (result?.error?.includes("denied") || result?.error?.includes("not found")) {
      logTest("getInvoiceDetails - Distributor (Same Company)", "WARN", { warning: "Invoice may not belong to distributor's company" });
    } else {
      logTest("getInvoiceDetails - Distributor (Same Company)", "FAIL", { error: result?.error });
    }
  } catch (e) {
    logTest("getInvoiceDetails - Distributor (Same Company)", "FAIL", { error: e.message });
  }

  // Test 3: getInvoicesByOrder
  const { data: sampleOrder } = await admin
    .from("orders")
    .select("order_number")
    .limit(1)
    .maybeSingle();

  if (sampleOrder) {
    try {
      const result = await executeTool("getInvoicesByOrder", { orderNumber: sampleOrder.order_number }, testProfiles.superAdmin);
      if (result && !result.error) {
        logTest("getInvoicesByOrder - Super Admin", "PASS", { 
          orderNumber: sampleOrder.order_number,
          invoiceCount: result.invoice_count || 0 
        });
      } else {
        logTest("getInvoicesByOrder - Super Admin", "FAIL", { error: result?.error || "No data" });
      }
    } catch (e) {
      logTest("getInvoicesByOrder - Super Admin", "FAIL", { error: e.message });
    }
  }

  // Test 4: getOrderDrilldown
  if (sampleOrder) {
    try {
      const result = await executeTool("getOrderDrilldown", { orderNumber: sampleOrder.order_number }, testProfiles.superAdmin);
      if (result && !result.error && result.items) {
        logTest("getOrderDrilldown - Super Admin", "PASS", { 
          orderNumber: sampleOrder.order_number,
          itemCount: result.items.length,
          hasSummary: !!result.summary 
        });
      } else {
        logTest("getOrderDrilldown - Super Admin", "FAIL", { error: result?.error || "No items data" });
      }
    } catch (e) {
      logTest("getOrderDrilldown - Super Admin", "FAIL", { error: e.message });
    }
  }

  // Test 5: getCompanyInvoices - Super Admin (all invoices)
  try {
    const result = await executeTool("getCompanyInvoices", { companyName: "", limit: 10 }, testProfiles.superAdmin);
    if (result && !result.error && Array.isArray(result.invoices)) {
      logTest("getCompanyInvoices - Super Admin (All)", "PASS", { count: result.count || 0 });
    } else {
      logTest("getCompanyInvoices - Super Admin (All)", "FAIL", { error: result?.error || "No data" });
    }
  } catch (e) {
    logTest("getCompanyInvoices - Super Admin (All)", "FAIL", { error: e.message });
  }

  // Test 6: getCompanyInvoices - Distributor (their company)
  try {
    const result = await executeTool("getCompanyInvoices", { companyName: "", limit: 10 }, testProfiles.distributor);
    if (result && !result.error) {
      logTest("getCompanyInvoices - Distributor (Own Company)", "PASS", { count: result.count || 0 });
    } else {
      logTest("getCompanyInvoices - Distributor (Own Company)", "FAIL", { error: result?.error });
    }
  } catch (e) {
    logTest("getCompanyInvoices - Distributor (Own Company)", "FAIL", { error: e.message });
  }

  // Test 7: getInvoiceStatus
  try {
    const result = await executeTool("getInvoiceStatus", { invoiceNumber }, testProfiles.superAdmin);
    if (result && !result.error && result.invoice) {
      logTest("getInvoiceStatus - Super Admin", "PASS", { 
        invoiceNumber,
        hasStatus: !!result.status 
      });
    } else {
      logTest("getInvoiceStatus - Super Admin", "FAIL", { error: result?.error || "No status data" });
    }
  } catch (e) {
    logTest("getInvoiceStatus - Super Admin", "FAIL", { error: e.message });
  }

  // Test 8: getDelayedInvoices
  try {
    const result = await executeTool("getDelayedInvoices", {}, testProfiles.superAdmin);
    if (result && !result.error) {
      logTest("getDelayedInvoices - Super Admin", "PASS", { 
        count: result.count || 0,
        hasInvoices: Array.isArray(result.delayed_invoices) 
      });
    } else {
      logTest("getDelayedInvoices - Super Admin", "FAIL", { error: result?.error || "No data" });
    }
  } catch (e) {
    logTest("getDelayedInvoices - Super Admin", "FAIL", { error: e.message });
  }
}

async function testAuthorization() {
  console.log("\n" + "=".repeat(80));
  console.log("TESTING: Authorization & Access Control");
  console.log("=".repeat(80));

  // Test 1: Distributor cannot access inventory
  try {
    const result = await executeTool("getWarehouseInventory", { warehouseId: 1 }, testProfiles.distributor);
    if (result?.error?.includes("denied") || result?.error?.includes("cannot")) {
      logTest("Authorization - Distributor Inventory Access Denied", "PASS", { error: result.error });
    } else {
      logTest("Authorization - Distributor Inventory Access Denied", "FAIL", { error: "Should have been denied" });
    }
  } catch (e) {
    logTest("Authorization - Distributor Inventory Access Denied", "FAIL", { error: e.message });
  }

  // Test 2: Warehouse user can only access their warehouse
  try {
    const result = await executeTool("getWarehouseInventory", { warehouseId: 999 }, testProfiles.warehouse);
    if (result?.error?.includes("denied") || result?.error?.includes("assigned")) {
      logTest("Authorization - Warehouse User Wrong Warehouse Denied", "PASS", { error: result.error });
    } else {
      logTest("Authorization - Warehouse User Wrong Warehouse Denied", "WARN", { warning: "May not have proper restriction" });
    }
  } catch (e) {
    logTest("Authorization - Warehouse User Wrong Warehouse Denied", "WARN", { warning: e.message });
  }

  // Test 3: Super Admin can access all inventory
  try {
    const result = await executeTool("getAllInventory", {}, testProfiles.superAdmin);
    if (result && !result.error && Array.isArray(result)) {
      logTest("Authorization - Super Admin All Inventory", "PASS", { count: result.length });
    } else if (result?.error?.includes("denied")) {
      logTest("Authorization - Super Admin All Inventory", "FAIL", { error: result.error });
    } else {
      logTest("Authorization - Super Admin All Inventory", "WARN", { warning: "May not be implemented" });
    }
  } catch (e) {
    logTest("Authorization - Super Admin All Inventory", "WARN", { warning: e.message });
  }

  // Test 4: Distributor can only query their company's invoices
  try {
    const result = await executeTool("getCompanyInvoices", { companyName: "Other Company", limit: 10 }, testProfiles.distributor);
    if (result?.error?.includes("denied") || result?.error?.includes("Only Super Admin")) {
      logTest("Authorization - Distributor Other Company Invoices Denied", "PASS", { error: result.error });
    } else {
      logTest("Authorization - Distributor Other Company Invoices Denied", "FAIL", { error: "Should have been denied" });
    }
  } catch (e) {
    logTest("Authorization - Distributor Other Company Invoices Denied", "FAIL", { error: e.message });
  }
}

async function testProformaInvoices() {
  console.log("\n" + "=".repeat(80));
  console.log("TESTING: Proforma Invoice APIs");
  console.log("=".repeat(80));

  const { data: sampleOrder } = await admin
    .from("orders")
    .select("order_number")
    .limit(1)
    .maybeSingle();

  if (!sampleOrder) {
    logTest("Proforma Invoices - No orders", "WARN", { warning: "No orders found" });
    return;
  }

  try {
    const result = await executeTool("getProformaInvoices", { orderNumber: sampleOrder.order_number }, testProfiles.superAdmin);
    if (result && !result.error) {
      logTest("getProformaInvoices - Super Admin", "PASS", { 
        orderNumber: sampleOrder.order_number,
        proformaCount: result.proforma_invoices?.length || 0 
      });
    } else {
      logTest("getProformaInvoices - Super Admin", "WARN", { warning: result?.error || "No proforma invoices (may be expected)" });
    }
  } catch (e) {
    logTest("getProformaInvoices - Super Admin", "FAIL", { error: e.message });
  }
}

async function testAllAPIs() {
  console.log("=".repeat(80));
  console.log("COMPREHENSIVE API & USE CASE TESTING");
  console.log("=".repeat(80));
  console.log(`Testing at: ${new Date().toISOString()}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log();

  await testOrderStatusAPI();
  await testInvoiceAPIs();
  await testProformaInvoices();
  await testAuthorization();

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log("TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total Tests: ${testResults.summary.total}`);
  console.log(`✅ Passed: ${testResults.summary.passed}`);
  console.log(`⚠️  Warnings: ${testResults.summary.warnings}`);
  console.log(`❌ Failed: ${testResults.summary.failed}`);

  if (testResults.failed.length > 0) {
    console.log("\nFailed Tests:");
    testResults.failed.forEach((test) => {
      console.log(`  - ${test.test}: ${test.error}`);
    });
  }

  if (testResults.warnings.length > 0) {
    console.log("\nWarnings:");
    testResults.warnings.forEach((test) => {
      console.log(`  - ${test.test}: ${test.warning}`);
    });
  }

  // Save detailed report
  const reportPath = path.join(__dirname, "..", "..", "API_TEST_REPORT.json");
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  process.exit(testResults.summary.failed > 0 ? 1 : 0);
}

testAllAPIs().catch((error) => {
  console.error("Test suite failed:", error);
  process.exit(1);
});
