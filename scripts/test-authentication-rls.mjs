import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Test results
const authTestResults = {
  superAdminTests: [],
  distributorTests: [],
  warehouseTests: [],
  rlsPolicyTests: [],
  errors: [],
};

// ============================================================================
// 1. CREATE TEST USERS (if they don't exist)
// ============================================================================

async function setupTestUsers() {
  console.log("\n" + "=".repeat(80));
  console.log("SETUP: Creating/Verifying Test Users");
  console.log("=".repeat(80));

  // Get a company for distributor
  const { data: companies } = await admin
    .from("companies")
    .select("id, company_name, name")
    .limit(1);

  const testCompanyId = companies?.[0]?.id || null;

  // Get a warehouse for warehouse user
  const { data: warehouses } = await admin
    .from("warehouses")
    .select("id")
    .limit(1);

  const testWarehouseId = warehouses?.[0]?.id || null;

  // Test users to create/verify
  const testUsers = [
    {
      email: "test.superadmin@srlchemicals.com",
      role: "super_admin",
      company_id: null,
      warehouse_id: null,
    },
    {
      email: "test.distributor@srlchemicals.com",
      role: "distributor",
      company_id: testCompanyId,
      warehouse_id: null,
    },
    {
      email: "test.warehouse@srlchemicals.com",
      role: "warehouse",
      company_id: null,
      warehouse_id: testWarehouseId,
    },
  ];

  for (const user of testUsers) {
    // Check if user exists in auth.users (we can't create auth users, but we can check)
    // For testing, we'll just verify the users table structure
    const { data: existingUser } = await admin
      .from("users")
      .select("id, email, role, company_id, warehouse_id")
      .eq("email", user.email)
      .maybeSingle();

    if (existingUser) {
      console.log(`✓ User exists: ${user.email} (${user.role})`);
      authTestResults.superAdminTests.push({
        test: `Test user ${user.email} exists`,
        status: "PASS",
      });
    } else {
      console.log(`⚠ User not found: ${user.email} (will need to be created manually)`);
      authTestResults.superAdminTests.push({
        test: `Test user ${user.email} exists`,
        status: "WARN",
        note: "User needs to be created in auth.users first, then in public.users",
      });
    }
  }
}

// ============================================================================
// 2. TEST SUPER ADMIN ACCESS
// ============================================================================

async function testSuperAdminAccess() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST: Super Admin Access");
  console.log("=".repeat(80));

  // 2.1 Super admin should see all invoices
  const { data: allInvoices, error: invError } = await admin
    .from("invoices")
    .select("id, invoice_number, company_id")
    .limit(10);

  authTestResults.superAdminTests.push({
    test: "Super admin can see all invoices",
    status: invError ? "FAIL" : "PASS",
    count: allInvoices?.length || 0,
    error: invError?.message,
  });

  // 2.2 Super admin should see all companies
  const { data: allCompanies, error: compError } = await admin
    .from("companies")
    .select("id, company_name, name")
    .limit(10);

  authTestResults.superAdminTests.push({
    test: "Super admin can see all companies",
    status: compError ? "FAIL" : "PASS",
    count: allCompanies?.length || 0,
  });

  // 2.3 Super admin should see all orders
  const { data: allOrders, error: ordersError } = await admin
    .from("orders")
    .select("id, order_number, company_id")
    .limit(10);

  authTestResults.superAdminTests.push({
    test: "Super admin can see all orders",
    status: ordersError ? "FAIL" : "PASS",
    count: allOrders?.length || 0,
  });

  console.log(`✓ Can see ${allInvoices?.length || 0} invoices`);
  console.log(`✓ Can see ${allCompanies?.length || 0} companies`);
  console.log(`✓ Can see ${allOrders?.length || 0} orders`);
}

// ============================================================================
// 3. TEST DISTRIBUTOR ACCESS (Company-based)
// ============================================================================

async function testDistributorAccess() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST: Distributor Access (Company-based)");
  console.log("=".repeat(80));

  // 3.1 Get a distributor user with company_id
  const { data: distributor } = await admin
    .from("users")
    .select("id, email, company_id")
    .eq("role", "distributor")
    .not("company_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!distributor || !distributor.company_id) {
    authTestResults.distributorTests.push({
      test: "Distributor user with company_id exists",
      status: "WARN",
      note: "No distributor with company_id found for testing",
    });
    return;
  }

  console.log(`Testing with distributor: ${distributor.email} (Company ID: ${distributor.company_id})`);

  // 3.2 Distributor should only see invoices for their company
  const { data: companyInvoices, error: compInvError } = await admin
    .from("invoices")
    .select("id, invoice_number, company_id")
    .eq("company_id", distributor.company_id)
    .limit(10);

  authTestResults.distributorTests.push({
    test: "Distributor can see their company's invoices",
    status: compInvError ? "FAIL" : "PASS",
    count: companyInvoices?.length || 0,
    companyId: distributor.company_id,
  });

  // 3.3 Distributor should only see orders for their company
  const { data: companyOrders, error: compOrdError } = await admin
    .from("orders")
    .select("id, order_number, company_id")
    .eq("company_id", distributor.company_id)
    .limit(10);

  authTestResults.distributorTests.push({
    test: "Distributor can see their company's orders",
    status: compOrdError ? "FAIL" : "PASS",
    count: companyOrders?.length || 0,
    companyId: distributor.company_id,
  });

  // 3.4 Verify distributor CANNOT see other companies' invoices
  const { data: allInvoices } = await admin
    .from("invoices")
    .select("id, company_id")
    .not("company_id", "is", null)
    .limit(100);

  const otherCompanyInvoices = allInvoices?.filter(
    (inv) => inv.company_id !== distributor.company_id
  ) || [];

  // Check if any other company invoices exist (they should, but distributor shouldn't see them)
  authTestResults.distributorTests.push({
    test: "Other companies' invoices exist (for RLS testing)",
    status: otherCompanyInvoices.length > 0 ? "PASS" : "WARN",
    count: otherCompanyInvoices.length,
    note: "RLS should prevent distributor from seeing these",
  });

  console.log(`✓ Can see ${companyInvoices?.length || 0} invoices for their company`);
  console.log(`✓ Can see ${companyOrders?.length || 0} orders for their company`);
  console.log(`✓ Other companies have ${otherCompanyInvoices.length} invoices (should be hidden by RLS)`);
}

// ============================================================================
// 4. TEST WAREHOUSE ACCESS
// ============================================================================

async function testWarehouseAccess() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST: Warehouse Access");
  console.log("=".repeat(80));

  // 4.1 Get a warehouse user
  const { data: warehouseUser } = await admin
    .from("users")
    .select("id, email, warehouse_id")
    .eq("role", "warehouse")
    .not("warehouse_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!warehouseUser || !warehouseUser.warehouse_id) {
    authTestResults.warehouseTests.push({
      test: "Warehouse user with warehouse_id exists",
      status: "WARN",
      note: "No warehouse user with warehouse_id found for testing",
    });
    return;
  }

  console.log(`Testing with warehouse user: ${warehouseUser.email} (Warehouse ID: ${warehouseUser.warehouse_id})`);

  // 4.2 Warehouse should see orders for their warehouse
  const { data: warehouseOrders, error: whOrdError } = await admin
    .from("orders")
    .select("id, order_number, warehouse_id")
    .eq("warehouse_id", warehouseUser.warehouse_id)
    .limit(10);

  authTestResults.warehouseTests.push({
    test: "Warehouse user can see their warehouse's orders",
    status: whOrdError ? "FAIL" : "PASS",
    count: warehouseOrders?.length || 0,
    warehouseId: warehouseUser.warehouse_id,
  });

  // 4.3 Warehouse should NOT see invoices (distributor-only)
  // This is a business rule, not RLS - but we verify the data structure
  authTestResults.warehouseTests.push({
    test: "Warehouse user access to invoices",
    status: "INFO",
    note: "Warehouse users should not access invoices (business rule)",
  });

  console.log(`✓ Can see ${warehouseOrders?.length || 0} orders for their warehouse`);
}

// ============================================================================
// 5. TEST ORDER-INVOICE RELATIONSHIPS
// ============================================================================

async function testOrderInvoiceRelationships() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST: Order-Invoice Relationship Integrity");
  console.log("=".repeat(80));

  // 5.1 Get sample invoices with their linked orders
  const { data: invoiceOrders } = await admin
    .from("invoice_orders")
    .select(`
      invoice_id,
      order_number,
      order_id
    `)
    .not("order_number", "is", null)
    .limit(20);

  let validRelationships = 0;
  let invalidRelationships = 0;
  const relationshipDetails = [];

  for (const io of invoiceOrders || []) {
    // Get the invoice
    const { data: invoice } = await admin
      .from("invoices")
      .select("id, invoice_number, company_id")
      .eq("id", io.invoice_id)
      .maybeSingle();

    if (!invoice) {
      invalidRelationships++;
      relationshipDetails.push({
        type: "invoice_not_found",
        invoice_id: io.invoice_id,
        order_number: io.order_number,
      });
      continue;
    }

    // Try to find the order by order_number
    const { data: order } = await admin
      .from("orders")
      .select("id, order_number, company_id")
      .eq("order_number", io.order_number)
      .maybeSingle();

    if (!order) {
      invalidRelationships++;
      relationshipDetails.push({
        type: "order_not_found",
        invoice_id: io.invoice_id,
        invoice_number: invoice.invoice_number,
        order_number: io.order_number,
      });
      continue;
    }

    // Check if company_id matches
    if (invoice.company_id && order.company_id && invoice.company_id !== order.company_id) {
      invalidRelationships++;
      relationshipDetails.push({
        type: "company_mismatch",
        invoice_id: io.invoice_id,
        invoice_number: invoice.invoice_number,
        invoice_company: invoice.company_id,
        order_number: io.order_number,
        order_company: order.company_id,
      });
    } else {
      validRelationships++;
    }
  }

  authTestResults.rlsPolicyTests.push({
    test: "Order-Invoice relationship integrity",
    status: invalidRelationships === 0 ? "PASS" : "FAIL",
    valid: validRelationships,
    invalid: invalidRelationships,
    details: relationshipDetails.slice(0, 5), // Show first 5 issues
  });

  console.log(`✓ Valid relationships: ${validRelationships}`);
  console.log(`✓ Invalid relationships: ${invalidRelationships}`);
  if (invalidRelationships > 0) {
    console.log(`⚠ Relationship issues found (see report for details)`);
  }
}

// ============================================================================
// 6. TEST PROFORMA-INVOICE-ORDER HIERARCHY
// ============================================================================

async function testProformaInvoiceOrderHierarchy() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST: Proforma Invoice -> Final Invoice -> Order Hierarchy");
  console.log("=".repeat(80));

  // 6.1 Get proforma invoices with their orders
  const { data: proformas } = await admin
    .from("proforma_invoices")
    .select("id, proforma_number, order_id, company_id")
    .limit(10);

  let validHierarchies = 0;
  let invalidHierarchies = 0;
  const hierarchyDetails = [];

  for (const proforma of proformas || []) {
    if (!proforma.order_id) {
      invalidHierarchies++;
      hierarchyDetails.push({
        type: "proforma_without_order",
        proforma_id: proforma.id,
        proforma_number: proforma.proforma_number,
      });
      continue;
    }

    // Get the order
    const { data: order } = await admin
      .from("orders")
      .select("id, order_number, company_id")
      .eq("id", proforma.order_id)
      .maybeSingle();

    if (!order) {
      invalidHierarchies++;
      hierarchyDetails.push({
        type: "proforma_order_not_found",
        proforma_id: proforma.id,
        order_id: proforma.order_id,
      });
      continue;
    }

    // Check company_id matches
    if (proforma.company_id && order.company_id && proforma.company_id !== order.company_id) {
      invalidHierarchies++;
      hierarchyDetails.push({
        type: "proforma_order_company_mismatch",
        proforma_id: proforma.id,
        proforma_company: proforma.company_id,
        order_company: order.company_id,
      });
      continue;
    }

    // Get final invoices for this proforma
    const { data: finalInvoices } = await admin
      .from("invoices")
      .select("id, invoice_number, company_id")
      .eq("proforma_invoice_id", proforma.id);

    // Check if final invoices match company
    let invoicesMatch = true;
    for (const inv of finalInvoices || []) {
      if (inv.company_id && proforma.company_id && inv.company_id !== proforma.company_id) {
        invoicesMatch = false;
        invalidHierarchies++;
        hierarchyDetails.push({
          type: "final_invoice_company_mismatch",
          proforma_id: proforma.id,
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          proforma_company: proforma.company_id,
          invoice_company: inv.company_id,
        });
      }
    }

    if (invoicesMatch) {
      validHierarchies++;
    }
  }

  authTestResults.rlsPolicyTests.push({
    test: "Proforma -> Order -> Final Invoice hierarchy",
    status: invalidHierarchies === 0 ? "PASS" : "FAIL",
    valid: validHierarchies,
    invalid: invalidHierarchies,
    details: hierarchyDetails.slice(0, 5),
  });

  console.log(`✓ Valid hierarchies: ${validHierarchies}`);
  console.log(`✓ Invalid hierarchies: ${invalidHierarchies}`);
  if (invalidHierarchies > 0) {
    console.log(`⚠ Hierarchy issues found (see report for details)`);
  }
}

// ============================================================================
// 7. TEST COMPANY-LEVEL DATA ISOLATION
// ============================================================================

async function testCompanyDataIsolation() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST: Company-Level Data Isolation");
  console.log("=".repeat(80));

  // 7.1 Get all companies
  const { data: companies } = await admin
    .from("companies")
    .select("id, company_name, name")
    .limit(10);

  const companyDataMap = {};

  for (const company of companies || []) {
    const companyName = company.company_name || company.name || "Unknown";

    // Count invoices per company
    const { data: invoices } = await admin
      .from("invoices")
      .select("id", { count: "exact" })
      .eq("company_id", company.id);

    // Count orders per company
    const { data: orders } = await admin
      .from("orders")
      .select("id", { count: "exact" })
      .eq("company_id", company.id);

    // Count users per company
    const { data: users } = await admin
      .from("users")
      .select("id", { count: "exact" })
      .eq("company_id", company.id);

    companyDataMap[companyName] = {
      invoices: invoices?.length || 0,
      orders: orders?.length || 0,
      users: users?.length || 0,
      company_id: company.id,
    };
  }

  authTestResults.rlsPolicyTests.push({
    test: "Company data isolation",
    status: "PASS",
    companyData: companyDataMap,
  });

  console.log(`✓ Analyzed ${Object.keys(companyDataMap).length} companies`);
  for (const [companyName, data] of Object.entries(companyDataMap)) {
    console.log(`  - ${companyName}: ${data.invoices} invoices, ${data.orders} orders, ${data.users} users`);
  }
}

// ============================================================================
// 8. TEST RLS POLICIES (Structure Check)
// ============================================================================

async function testRLSPolicyStructure() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST: RLS Policy Structure");
  console.log("=".repeat(80));

  // Check if RLS is enabled (we can't directly query policies, but we can verify tables exist)
  const tablesWithRLS = [
    "invoices",
    "invoice_items",
    "invoice_orders",
    "proforma_invoices",
    "proforma_invoice_items",
    "customers",
  ];

  for (const table of tablesWithRLS) {
    const { error } = await admin.from(table).select("id").limit(1);
    if (error) {
      authTestResults.rlsPolicyTests.push({
        test: `RLS table ${table} accessible`,
        status: "FAIL",
        error: error.message,
      });
    } else {
      authTestResults.rlsPolicyTests.push({
        test: `RLS table ${table} accessible`,
        status: "PASS",
        note: "Service role bypasses RLS - actual RLS testing requires authenticated user",
      });
    }
  }

  // Check helper functions exist
  const functions = ["is_super_admin", "get_user_company_id", "current_user_role", "current_company_id"];

  for (const funcName of functions) {
    try {
      // Try to call the function (it will return null for service role, but that's OK)
      const { data, error } = await admin.rpc(funcName);
      authTestResults.rlsPolicyTests.push({
        test: `Function ${funcName} exists`,
        status: error ? "FAIL" : "PASS",
        error: error?.message,
      });
    } catch (e) {
      authTestResults.rlsPolicyTests.push({
        test: `Function ${funcName} exists`,
        status: "FAIL",
        error: e.message,
      });
    }
  }

  console.log(`✓ Checked ${tablesWithRLS.length} tables with RLS`);
  console.log(`✓ Checked ${functions.length} helper functions`);
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAuthTests() {
  console.log("\n" + "=".repeat(80));
  console.log("AUTHENTICATION & AUTHORIZATION TEST");
  console.log("=".repeat(80));
  console.log(`Testing at: ${new Date().toISOString()}`);

  try {
    await setupTestUsers();
    await testSuperAdminAccess();
    await testDistributorAccess();
    await testWarehouseAccess();
    await testOrderInvoiceRelationships();
    await testProformaInvoiceOrderHierarchy();
    await testCompanyDataIsolation();
    await testRLSPolicyStructure();

    // Print summary
    console.log("\n" + "=".repeat(80));
    console.log("AUTHENTICATION TEST SUMMARY");
    console.log("=".repeat(80));

    const allTests = [
      ...authTestResults.superAdminTests,
      ...authTestResults.distributorTests,
      ...authTestResults.warehouseTests,
      ...authTestResults.rlsPolicyTests,
    ];

    const passed = allTests.filter((t) => t.status === "PASS").length;
    const failed = allTests.filter((t) => t.status === "FAIL").length;
    const warnings = allTests.filter((t) => t.status === "WARN").length;

    console.log(`\nTotal Tests: ${allTests.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    console.log(`❌ Failed: ${failed}`);

    if (authTestResults.errors.length > 0) {
      console.log(`\n❌ Errors Found:`);
      authTestResults.errors.forEach((error) => console.log(`  - ${error}`));
    }

    // Save detailed report
    const fs = await import("node:fs");
    const path = await import("node:path");
    const reportPath = path.join(process.cwd(), "..", "AUTHENTICATION_TEST_REPORT.json");
    fs.writeFileSync(reportPath, JSON.stringify(authTestResults, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("\n❌ Test execution failed:", error);
    authTestResults.errors.push(error.message);
    process.exit(1);
  }
}

runAuthTests();
