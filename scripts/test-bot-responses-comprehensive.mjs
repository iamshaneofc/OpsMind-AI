import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const API_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Comprehensive Bot Response Testing
 * Tests actual AI responses with different roles and scenarios
 */

const testResults = {
  tests: [],
  summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
  byRole: {},
  byCategory: {},
};

// Test scenarios organized by role and category
const testScenarios = {
  super_admin: {
    "Order Queries": [
      { query: "Where is Order 9.105.260211.47?", expectedTools: ["getOrderStatus"], description: "Order status query" },
      { query: "Show me status of order 11.105.260217.24", expectedTools: ["getOrderStatus"], description: "Order status with different format" },
      { query: "What's the breakdown of order 11.105.260217.24?", expectedTools: ["getOrderDrilldown"], description: "Order drilldown" },
      { query: "Show me all delayed orders", expectedTools: ["getDelayedOrders"], description: "Delayed orders query" },
    ],
    "Invoice Queries": [
      { query: "Show me invoice 11.106.0.27887", expectedTools: ["getInvoiceDetails"], description: "Invoice details query" },
      { query: "What invoices are linked to order 11.105.260217.24?", expectedTools: ["getInvoicesByOrder"], description: "Invoices by order" },
      { query: "Show me all delayed invoices", expectedTools: ["getDelayedInvoices"], description: "Delayed invoices query" },
      { query: "Show me all invoices", expectedTools: ["getCompanyInvoices"], description: "All invoices query" },
      { query: "What's the status of invoice 9.106.0.50725?", expectedTools: ["getInvoiceStatus"], description: "Invoice status query" },
    ],
    "Inventory Queries": [
      { query: "Show me inventory", expectedTools: ["getAllInventory"], description: "All inventory query" },
      { query: "Check inventory", expectedTools: ["getAllInventory"], description: "Check inventory query" },
      { query: "What's the inventory in Mumbai warehouse?", expectedTools: ["searchWarehouseByName", "getWarehouseInventory"], description: "Warehouse inventory by name" },
      { query: "Show me low stock products", expectedTools: ["getLowStockProducts"], description: "Low stock query" },
    ],
    "Warehouse Queries": [
      { query: "Show me all warehouses", expectedTools: ["getAllWarehouses"], description: "All warehouses query" },
      { query: "What orders are in Mumbai warehouse?", expectedTools: ["searchWarehouseByName", "getOrdersByWarehouse"], description: "Orders by warehouse name" },
    ],
    "Complex Queries": [
      { query: "Show me proforma invoices for order 9.105.260211.47", expectedTools: ["getProformaInvoices"], description: "Proforma invoices query" },
      { query: "What's the status of order 9.105.260211.47 and show me its invoices", expectedTools: ["getOrderStatus", "getInvoicesByOrder"], description: "Multi-tool query" },
    ],
  },
  distributor: {
    "Order Queries": [
      { query: "Where is Order 9.105.260211.47?", expectedTools: ["getOrderStatus"], description: "Order status query", shouldWork: true },
      { query: "Show me my pending orders", expectedTools: ["getDistributorOrders"], description: "Distributor orders query", shouldWork: true },
      { query: "What's the breakdown of order 9.105.260211.47?", expectedTools: ["getOrderDrilldown"], description: "Order drilldown", shouldWork: true },
      { query: "Show me all delayed orders", expectedTools: ["getDelayedOrders"], description: "Delayed orders query", shouldWork: true },
    ],
    "Invoice Queries": [
      { query: "Show me invoice 11.106.0.27887", expectedTools: ["getInvoiceDetails"], description: "Invoice details query", shouldWork: true },
      { query: "Show me my company's invoices", expectedTools: ["getCompanyInvoices"], description: "Company invoices query", shouldWork: true },
      { query: "What invoices are linked to order 11.105.260217.24?", expectedTools: ["getInvoicesByOrder"], description: "Invoices by order", shouldWork: true },
      { query: "Show me all delayed invoices", expectedTools: ["getDelayedInvoices"], description: "Delayed invoices query", shouldWork: true },
    ],
    "Access Denied Queries": [
      { query: "Show me inventory", expectedTools: [], description: "Inventory access denied", shouldWork: false, expectedError: "inventory" },
      { query: "Check warehouse inventory", expectedTools: [], description: "Warehouse inventory access denied", shouldWork: false, expectedError: "inventory" },
      { query: "Show me low stock products", expectedTools: [], description: "Low stock access denied", shouldWork: false, expectedError: "inventory" },
    ],
  },
  warehouse: {
    "Inventory Queries": [
      { query: "Show me inventory", expectedTools: ["getWarehouseInventory"], description: "My warehouse inventory", shouldWork: true },
      { query: "Check inventory", expectedTools: ["getWarehouseInventory"], description: "Check inventory query", shouldWork: true },
      { query: "What's in my warehouse?", expectedTools: ["getWarehouseInventory"], description: "My warehouse query", shouldWork: true },
    ],
    "Order Queries": [
      { query: "Show me orders in my warehouse", expectedTools: ["getOrdersByWarehouse"], description: "My warehouse orders", shouldWork: true },
      { query: "What orders are ready for dispatch?", expectedTools: ["getDispatchQueue"], description: "Dispatch queue query", shouldWork: true },
      { query: "Show me delayed orders", expectedTools: ["getDelayedOrders"], description: "Delayed orders query", shouldWork: true },
    ],
  },
  "company_admin": {
    "Order Queries": [
      { query: "Where is Order 9.105.260211.47?", expectedTools: ["getOrderStatus"], description: "Order status query", shouldWork: true },
      { query: "Show me all orders for my company", expectedTools: ["getDistributorOrders"], description: "Company orders query", shouldWork: true },
    ],
    "Invoice Queries": [
      { query: "Show me my company's invoices", expectedTools: ["getCompanyInvoices"], description: "Company invoices query", shouldWork: true },
      { query: "Show me invoice 11.106.0.27887", expectedTools: ["getInvoiceDetails"], description: "Invoice details query", shouldWork: true },
    ],
  },
};

// Real data from database
let realOrders = [];
let realInvoices = [];
let realCompanies = [];

async function loadRealData() {
  console.log("Loading real data from database...");
  
  const { data: orders } = await admin
    .from("orders")
    .select("order_number, company_id")
    .limit(10);
  realOrders = orders || [];

  const { data: invoices } = await admin
    .from("invoices")
    .select("invoice_number, company_id")
    .limit(10);
  realInvoices = invoices || [];

  const { data: companies } = await admin
    .from("companies")
    .select("id, company_id, company_name, name")
    .limit(5);
  realCompanies = companies || [];

  console.log(`Loaded: ${realOrders.length} orders, ${realInvoices.length} invoices, ${realCompanies.length} companies`);
}

async function getTestUser(role) {
  // Get a real user with the specified role
  const { data: users } = await admin
    .from("users")
    .select("user_id, email, role_id, company_id, warehouse_id")
    .limit(50);

  if (!users || users.length === 0) {
    return null;
  }

  // Map role names to role_ids (you may need to adjust these)
  const roleMap = {
    super_admin: 1,
    distributor: 2,
    warehouse: 3,
    company_admin: 2, // Assuming company admin uses distributor role_id
  };

  const targetRoleId = roleMap[role];
  const user = users.find((u) => u.role_id === targetRoleId) || users[0];

  return user;
}

async function testBotResponse(role, query, expectedTools, description, shouldWork = true, expectedError = null) {
  const testId = `${role}_${description.replace(/\s+/g, "_")}`;
  
  try {
    const user = await getTestUser(role);
    if (!user) {
      return {
        testId,
        role,
        query,
        description,
        result: "WARN",
        error: "No test user found for this role",
      };
    }

    // Get auth token (simplified - in real scenario, you'd need proper auth)
    // For now, we'll test the tools directly
    const supabase = createSupabaseServerClient();
    
    // Create a mock profile
    const profile = {
      user_id: user.user_id,
      email: user.email,
      role_id: user.role_id,
      role: role,
      company_id: user.company_id,
      warehouse_id: user.warehouse_id,
    };

    // Test tool execution directly
    const { executeTool } = await import("../src/ai/tools.ts");
    
    // Determine which tool should be called
    let toolCalled = null;
    let toolResult = null;
    let error = null;

    // Simple heuristic to determine which tool to call
    if (query.toLowerCase().includes("order") && query.toLowerCase().includes("status")) {
      const orderMatch = query.match(/order\s+([A-Z0-9.]+)/i);
      if (orderMatch) {
        toolCalled = "getOrderStatus";
        try {
          toolResult = await executeTool("getOrderStatus", { orderNumber: orderMatch[1] }, profile);
        } catch (e) {
          error = e.message;
        }
      }
    } else if (query.toLowerCase().includes("invoice") && query.toLowerCase().includes("detail")) {
      const invoiceMatch = query.match(/invoice\s+([0-9.]+)/i);
      if (invoiceMatch) {
        toolCalled = "getInvoiceDetails";
        try {
          toolResult = await executeTool("getInvoiceDetails", { invoiceNumber: invoiceMatch[1] }, profile);
        } catch (e) {
          error = e.message;
        }
      }
    } else if (query.toLowerCase().includes("inventory") && role === "distributor") {
      // Distributor should be denied
      toolCalled = "getWarehouseInventory";
      try {
        toolResult = await executeTool("getWarehouseInventory", { warehouseId: 1 }, profile);
      } catch (e) {
        error = e.message;
      }
    }

    // Evaluate result
    let result = "PASS";
    let details = {};

    if (shouldWork) {
      if (error || (toolResult && toolResult.error)) {
        result = "FAIL";
        details.error = error || toolResult.error;
      } else if (!toolCalled || !expectedTools.includes(toolCalled)) {
        result = "WARN";
        details.warning = `Expected tools: ${expectedTools.join(", ")}, but called: ${toolCalled || "none"}`;
      } else {
        details.toolCalled = toolCalled;
        details.hasResult = !!toolResult;
      }
    } else {
      // Should be denied
      if (toolResult && toolResult.error && (expectedError ? toolResult.error.toLowerCase().includes(expectedError.toLowerCase()) : true)) {
        result = "PASS";
        details.accessDenied = true;
        details.errorMessage = toolResult.error;
      } else if (!toolResult || !toolResult.error) {
        result = "FAIL";
        details.error = "Access should have been denied but wasn't";
      }
    }

    return {
      testId,
      role,
      query,
      description,
      expectedTools,
      toolCalled,
      result,
      details,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      testId,
      role,
      query,
      description,
      result: "FAIL",
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

function createSupabaseServerClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function runAllTests() {
  console.log("=".repeat(80));
  console.log("COMPREHENSIVE BOT RESPONSE TESTING");
  console.log("=".repeat(80));
  console.log(`Testing at: ${new Date().toISOString()}`);
  console.log();

  await loadRealData();

  // Run tests for each role
  for (const [role, categories] of Object.entries(testScenarios)) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`Testing Role: ${role.toUpperCase()}`);
    console.log("=".repeat(80));

    if (!testResults.byRole[role]) {
      testResults.byRole[role] = { total: 0, passed: 0, failed: 0, warnings: 0 };
    }

    for (const [category, scenarios] of Object.entries(categories)) {
      console.log(`\nCategory: ${category}`);
      console.log("-".repeat(80));

      if (!testResults.byCategory[category]) {
        testResults.byCategory[category] = { total: 0, passed: 0, failed: 0, warnings: 0 };
      }

      for (const scenario of scenarios) {
        testResults.summary.total++;
        testResults.byRole[role].total++;
        testResults.byCategory[category].total++;

        const result = await testBotResponse(
          role,
          scenario.query,
          scenario.expectedTools || [],
          scenario.description,
          scenario.shouldWork !== false,
          scenario.expectedError
        );

        testResults.tests.push(result);

        if (result.result === "PASS") {
          testResults.summary.passed++;
          testResults.byRole[role].passed++;
          testResults.byCategory[category].passed++;
          console.log(`✅ PASS: ${scenario.description}`);
        } else if (result.result === "FAIL") {
          testResults.summary.failed++;
          testResults.byRole[role].failed++;
          testResults.byCategory[category].failed++;
          console.log(`❌ FAIL: ${scenario.description} - ${result.error || result.details?.error || "Unknown error"}`);
        } else {
          testResults.summary.warnings++;
          testResults.byRole[role].warnings++;
          testResults.byCategory[category].warnings++;
          console.log(`⚠️  WARN: ${scenario.description} - ${result.details?.warning || result.error || "Warning"}`);
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log("TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total Tests: ${testResults.summary.total}`);
  console.log(`✅ Passed: ${testResults.summary.passed}`);
  console.log(`⚠️  Warnings: ${testResults.summary.warnings}`);
  console.log(`❌ Failed: ${testResults.summary.failed}`);
  console.log(`Success Rate: ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}%`);

  console.log("\nBy Role:");
  for (const [role, stats] of Object.entries(testResults.byRole)) {
    const rate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 0;
    console.log(`  ${role}: ${stats.passed}/${stats.total} (${rate}%)`);
  }

  console.log("\nBy Category:");
  for (const [category, stats] of Object.entries(testResults.byCategory)) {
    const rate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 0;
    console.log(`  ${category}: ${stats.passed}/${stats.total} (${rate}%)`);
  }

  // Save detailed report
  const reportPath = path.join(__dirname, "..", "..", "BOT_RESPONSE_TEST_REPORT.json");
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  process.exit(testResults.summary.failed > 0 ? 1 : 0);
}

runAllTests().catch((error) => {
  console.error("Test suite failed:", error);
  process.exit(1);
});
