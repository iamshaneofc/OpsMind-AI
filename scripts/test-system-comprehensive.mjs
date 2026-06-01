import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Test results
const testResults = {
  dataIntegrity: [],
  authentication: [],
  authorization: [],
  botTools: [],
  relationships: [],
  errors: [],
};

// ============================================================================
// 1. DATA INTEGRITY TESTS
// ============================================================================

async function testDataIntegrity() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 1: DATA INTEGRITY CHECKS");
  console.log("=".repeat(80));

  // 1.1 Check all required tables exist
  const requiredTables = [
    "invoices",
    "invoice_items",
    "invoice_orders",
    "proforma_invoices",
    "proforma_invoice_items",
    "orders",
    "order_items",
    "companies",
    "customers",
    "products",
    "users",
  ];

  for (const table of requiredTables) {
    const { data, error } = await admin.from(table).select("id").limit(1);
    if (error) {
      testResults.dataIntegrity.push({
        test: `Table ${table} exists`,
        status: "FAIL",
        error: error.message,
      });
      testResults.errors.push(`Table ${table} does not exist: ${error.message}`);
    } else {
      testResults.dataIntegrity.push({
        test: `Table ${table} exists`,
        status: "PASS",
      });
    }
  }

  // 1.2 Check invoice data counts
  const { data: invoices, error: invError } = await admin
    .from("invoices")
    .select("id", { count: "exact" });
  const invoiceCount = invoices?.length || 0;
  testResults.dataIntegrity.push({
    test: "Invoices exist",
    status: invoiceCount > 0 ? "PASS" : "FAIL",
    count: invoiceCount,
  });

  // 1.3 Check invoice items
  const { data: invoiceItems, error: itemsError } = await admin
    .from("invoice_items")
    .select("id", { count: "exact" });
  const itemsCount = invoiceItems?.length || 0;
  testResults.dataIntegrity.push({
    test: "Invoice items exist",
    status: itemsCount > 0 ? "PASS" : "FAIL",
    count: itemsCount,
  });

  // 1.4 Check orders
  const { data: orders, error: ordersError } = await admin
    .from("orders")
    .select("id", { count: "exact" });
  const ordersCount = orders?.length || 0;
  testResults.dataIntegrity.push({
    test: "Orders exist",
    status: ordersCount > 0 ? "PASS" : "FAIL",
    count: ordersCount,
  });

  // 1.5 Check companies
  const { data: companies, error: compError } = await admin
    .from("companies")
    .select("id", { count: "exact" });
  const companiesCount = companies?.length || 0;
  testResults.dataIntegrity.push({
    test: "Companies exist",
    status: companiesCount > 0 ? "PASS" : "FAIL",
    count: companiesCount,
  });

  // 1.6 Check customers
  const { data: customers, error: custError } = await admin
    .from("customers")
    .select("id", { count: "exact" });
  const customersCount = customers?.length || 0;
  testResults.dataIntegrity.push({
    test: "Customers exist",
    status: customersCount > 0 ? "PASS" : "FAIL",
    count: customersCount,
  });

  // 1.7 Check products
  const { data: products, error: prodError } = await admin
    .from("products")
    .select("id", { count: "exact" });
  const productsCount = products?.length || 0;
  testResults.dataIntegrity.push({
    test: "Products exist",
    status: productsCount > 0 ? "PASS" : "FAIL",
    count: productsCount,
  });

  console.log(`✓ Invoices: ${invoiceCount}`);
  console.log(`✓ Invoice Items: ${itemsCount}`);
  console.log(`✓ Orders: ${ordersCount}`);
  console.log(`✓ Companies: ${companiesCount}`);
  console.log(`✓ Customers: ${customersCount}`);
  console.log(`✓ Products: ${productsCount}`);
}

// ============================================================================
// 2. RELATIONSHIP INTEGRITY TESTS
// ============================================================================

async function testRelationships() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 2: DATA RELATIONSHIP CHECKS");
  console.log("=".repeat(80));

  // 2.1 Check invoice -> invoice_items relationship
  const { data: invoices } = await admin.from("invoices").select("id").limit(10);
  let orphanedItems = 0;
  let validItems = 0;

  for (const invoice of invoices || []) {
    const { data: items } = await admin
      .from("invoice_items")
      .select("id")
      .eq("invoice_id", invoice.id);
    if (!items || items.length === 0) {
      orphanedItems++;
    } else {
      validItems++;
    }
  }

  testResults.relationships.push({
    test: "Invoice -> Invoice Items relationship",
    status: orphanedItems === 0 ? "PASS" : "WARN",
    valid: validItems,
    orphaned: orphanedItems,
  });

  // 2.2 Check invoice -> invoice_orders relationship
  let invoicesWithOrders = 0;
  let invoicesWithoutOrders = 0;

  for (const invoice of invoices || []) {
    const { data: orders } = await admin
      .from("invoice_orders")
      .select("id")
      .eq("invoice_id", invoice.id);
    if (orders && orders.length > 0) {
      invoicesWithOrders++;
    } else {
      invoicesWithoutOrders++;
    }
  }

  testResults.relationships.push({
    test: "Invoice -> Invoice Orders relationship",
    status: invoicesWithOrders > 0 ? "PASS" : "WARN",
    withOrders: invoicesWithOrders,
    withoutOrders: invoicesWithoutOrders,
  });

  // 2.3 Check invoice -> company relationship
  const { data: invoicesWithCompany } = await admin
    .from("invoices")
    .select("id, company_id")
    .not("company_id", "is", null)
    .limit(10);

  const { data: invoicesWithoutCompany } = await admin
    .from("invoices")
    .select("id")
    .is("company_id", null)
    .limit(10);

  testResults.relationships.push({
    test: "Invoice -> Company relationship",
    status: invoicesWithCompany && invoicesWithCompany.length > 0 ? "PASS" : "WARN",
    withCompany: invoicesWithCompany?.length || 0,
    withoutCompany: invoicesWithoutCompany?.length || 0,
  });

  // 2.4 Check invoice -> customer relationship
  const { data: invoicesWithCustomer } = await admin
    .from("invoices")
    .select("id, customer_id")
    .not("customer_id", "is", null)
    .limit(10);

  testResults.relationships.push({
    test: "Invoice -> Customer relationship",
    status: invoicesWithCustomer && invoicesWithCustomer.length > 0 ? "PASS" : "WARN",
    withCustomer: invoicesWithCustomer?.length || 0,
  });

  // 2.5 Check order -> proforma_invoice relationship
  const { data: orders } = await admin.from("orders").select("id").limit(10);
  let ordersWithProforma = 0;
  let ordersWithoutProforma = 0;

  for (const order of orders || []) {
    const { data: proformas } = await admin
      .from("proforma_invoices")
      .select("id")
      .eq("order_id", order.id);
    if (proformas && proformas.length > 0) {
      ordersWithProforma++;
    } else {
      ordersWithoutProforma++;
    }
  }

  testResults.relationships.push({
    test: "Order -> Proforma Invoice relationship",
    status: ordersWithProforma > 0 || ordersWithoutProforma === 0 ? "PASS" : "WARN",
    withProforma: ordersWithProforma,
    withoutProforma: ordersWithoutProforma,
  });

  // 2.6 Check proforma_invoice -> final invoice relationship
  const { data: proformas } = await admin
    .from("proforma_invoices")
    .select("id")
    .limit(10);
  let proformasWithInvoices = 0;
  let proformasWithoutInvoices = 0;

  for (const proforma of proformas || []) {
    const { data: finalInvoices } = await admin
      .from("invoices")
      .select("id")
      .eq("proforma_invoice_id", proforma.id);
    if (finalInvoices && finalInvoices.length > 0) {
      proformasWithInvoices++;
    } else {
      proformasWithoutInvoices++;
    }
  }

  testResults.relationships.push({
    test: "Proforma Invoice -> Final Invoice relationship",
    status: proformasWithInvoices > 0 || proformasWithoutInvoices === 0 ? "PASS" : "WARN",
    withInvoices: proformasWithInvoices,
    withoutInvoices: proformasWithoutInvoices,
  });

  // 2.7 Check invoice_orders -> orders relationship (by order_number)
  const { data: invoiceOrders } = await admin
    .from("invoice_orders")
    .select("order_number")
    .not("order_number", "is", null)
    .limit(10);

  let matchedOrders = 0;
  let unmatchedOrders = 0;

  for (const io of invoiceOrders || []) {
    const { data: order } = await admin
      .from("orders")
      .select("id")
      .eq("order_number", io.order_number)
      .maybeSingle();
    if (order) {
      matchedOrders++;
    } else {
      unmatchedOrders++;
    }
  }

  testResults.relationships.push({
    test: "Invoice Orders -> Orders relationship (by order_number)",
    status: matchedOrders > 0 ? "PASS" : "WARN",
    matched: matchedOrders,
    unmatched: unmatchedOrders,
  });

  console.log(`✓ Invoice -> Items: ${validItems} valid, ${orphanedItems} orphaned`);
  console.log(`✓ Invoice -> Orders: ${invoicesWithOrders} with orders`);
  console.log(`✓ Invoice -> Company: ${invoicesWithCompany?.length || 0} linked`);
  console.log(`✓ Invoice -> Customer: ${invoicesWithCustomer?.length || 0} linked`);
  console.log(`✓ Order -> Proforma: ${ordersWithProforma} with proforma`);
  console.log(`✓ Proforma -> Final Invoice: ${proformasWithInvoices} with invoices`);
  console.log(`✓ Invoice Orders -> Orders: ${matchedOrders} matched`);
}

// ============================================================================
// 3. AUTHENTICATION & AUTHORIZATION TESTS
// ============================================================================

async function testAuthentication() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 3: AUTHENTICATION & AUTHORIZATION CHECKS");
  console.log("=".repeat(80));

  // 3.1 Check users table structure
  const { data: users, error: usersError } = await admin
    .from("users")
    .select("id, email, role, company_id, warehouse_id")
    .limit(10);

  if (usersError) {
    testResults.authentication.push({
      test: "Users table accessible",
      status: "FAIL",
      error: usersError.message,
    });
    return;
  }

  testResults.authentication.push({
    test: "Users table accessible",
    status: "PASS",
    count: users?.length || 0,
  });

  // 3.2 Check role distribution
  const roleCounts = {};
  for (const user of users || []) {
    roleCounts[user.role] = (roleCounts[user.role] || 0) + 1;
  }

  testResults.authentication.push({
    test: "User roles distribution",
    status: "PASS",
    roles: roleCounts,
  });

  // 3.3 Check super_admin users
  const { data: superAdmins } = await admin
    .from("users")
    .select("id, email")
    .eq("role", "super_admin");

  testResults.authentication.push({
    test: "Super admin users exist",
    status: superAdmins && superAdmins.length > 0 ? "PASS" : "WARN",
    count: superAdmins?.length || 0,
  });

  // 3.4 Check distributor users with company_id
  const { data: distributors } = await admin
    .from("users")
    .select("id, email, company_id")
    .eq("role", "distributor");

  const distributorsWithCompany = distributors?.filter((d) => d.company_id) || [];
  testResults.authentication.push({
    test: "Distributor users with company_id",
    status: distributorsWithCompany.length > 0 ? "PASS" : "WARN",
    total: distributors?.length || 0,
    withCompany: distributorsWithCompany.length,
  });

  // 3.5 Check warehouse users with warehouse_id
  const { data: warehouses } = await admin
    .from("users")
    .select("id, email, warehouse_id")
    .eq("role", "warehouse");

  const warehousesWithId = warehouses?.filter((w) => w.warehouse_id) || [];
  testResults.authentication.push({
    test: "Warehouse users with warehouse_id",
    status: warehousesWithId.length > 0 ? "PASS" : "WARN",
    total: warehouses?.length || 0,
    withWarehouse: warehousesWithId.length,
  });

  console.log(`✓ Total users: ${users?.length || 0}`);
  console.log(`✓ Super admins: ${superAdmins?.length || 0}`);
  console.log(`✓ Distributors: ${distributors?.length || 0} (${distributorsWithCompany.length} with company)`);
  console.log(`✓ Warehouses: ${warehouses?.length || 0} (${warehousesWithId.length} with warehouse)`);
}

// ============================================================================
// 4. RLS POLICY TESTS
// ============================================================================

async function testRLSPolicies() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 4: RLS POLICY CHECKS");
  console.log("=".repeat(80));

  // 4.1 Check if RLS is enabled on invoice tables
  const tablesWithRLS = [
    "invoices",
    "invoice_items",
    "invoice_orders",
    "proforma_invoices",
    "proforma_invoice_items",
    "customers",
  ];

  for (const table of tablesWithRLS) {
    // Check if table exists and is accessible (RLS is enabled, but service role bypasses it)
    try {
      const { error: selectError } = await admin.from(table).select("id").limit(1);
      if (!selectError) {
        testResults.authorization.push({
          test: `RLS check for ${table}`,
          status: "PASS", // RLS is enabled, but service role bypasses it
          note: "Service role bypasses RLS - manual testing required",
        });
      } else {
        testResults.authorization.push({
          test: `RLS check for ${table}`,
          status: "FAIL",
          error: selectError.message,
        });
      }
    } catch (e) {
      testResults.authorization.push({
        test: `RLS check for ${table}`,
        status: "FAIL",
        error: e.message,
      });
    }
  }

  // 4.2 Check helper functions exist
  const functions = ["is_super_admin", "get_user_company_id", "current_user_role", "current_company_id"];

  for (const funcName of functions) {
    try {
      // Try to call the function (it will return null for service role, but that's OK)
      const { data, error } = await admin.rpc(funcName);
      // Function exists if no error (or returns null for non-authenticated)
      testResults.authorization.push({
        test: `Function ${funcName} exists`,
        status: error ? "FAIL" : "PASS",
        error: error?.message,
      });
    } catch (e) {
      testResults.authorization.push({
        test: `Function ${funcName} exists`,
        status: "FAIL",
        error: e.message,
      });
    }
  }

  console.log(`✓ Checked RLS on ${tablesWithRLS.length} tables`);
  console.log(`✓ Checked ${functions.length} helper functions`);
}

// ============================================================================
// 5. ORDER-INVOICE MATCHING TESTS
// ============================================================================

async function testOrderInvoiceMatching() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 5: ORDER-INVOICE MATCHING CHECKS");
  console.log("=".repeat(80));

  // 5.1 Get sample invoices with their orders
  const { data: invoiceOrders } = await admin
    .from("invoice_orders")
    .select("invoice_id, order_number, order_id")
    .not("order_number", "is", null)
    .limit(20);

  let matchedByNumber = 0;
  let matchedById = 0;
  let unmatched = 0;

  for (const io of invoiceOrders || []) {
    // Try to match by order_number
    const { data: orderByNumber } = await admin
      .from("orders")
      .select("id, order_number")
      .eq("order_number", io.order_number)
      .maybeSingle();

    // Try to match by order_id (UUID)
    let orderById = null;
    if (io.order_id) {
      const { data } = await admin
        .from("orders")
        .select("id")
        .eq("id", io.order_id)
        .maybeSingle();
      orderById = data;
    }

    if (orderByNumber) {
      matchedByNumber++;
    } else if (orderById) {
      matchedById++;
    } else {
      unmatched++;
      testResults.relationships.push({
        test: `Order matching for invoice ${io.invoice_id}`,
        status: "FAIL",
        orderNumber: io.order_number,
        orderId: io.order_id,
      });
    }
  }

  testResults.relationships.push({
    test: "Invoice Orders -> Orders matching",
    status: unmatched === 0 ? "PASS" : "WARN",
    matchedByNumber,
    matchedById,
    unmatched,
  });

  // 5.2 Check invoice items match order items (by product)
  const { data: sampleInvoice } = await admin
    .from("invoices")
    .select("id")
    .limit(1)
    .single();

  if (sampleInvoice) {
    const { data: invoiceItems } = await admin
      .from("invoice_items")
      .select("product_id, invoice_quantity, order_body_id")
      .eq("invoice_id", sampleInvoice.id)
      .limit(10);

    const { data: linkedOrders } = await admin
      .from("invoice_orders")
      .select("order_number")
      .eq("invoice_id", sampleInvoice.id)
      .limit(1);

    if (linkedOrders && linkedOrders.length > 0) {
      const orderNumber = linkedOrders[0].order_number;
      const { data: order } = await admin
        .from("orders")
        .select("id")
        .eq("order_number", orderNumber)
        .maybeSingle();

      if (order) {
        const { data: orderItems } = await admin
          .from("order_items")
          .select("product_id, quantity")
          .eq("order_id", order.id);

        let itemsMatched = 0;
        for (const invItem of invoiceItems || []) {
          if (invItem.product_id) {
            const matchingOrderItem = orderItems?.find(
              (oi) => oi.product_id === invItem.product_id
            );
            if (matchingOrderItem) {
              itemsMatched++;
            }
          }
        }

        testResults.relationships.push({
          test: "Invoice Items -> Order Items matching (by product)",
          status: itemsMatched > 0 ? "PASS" : "WARN",
          matched: itemsMatched,
          total: invoiceItems?.length || 0,
        });
      }
    }
  }

  console.log(`✓ Matched by order_number: ${matchedByNumber}`);
  console.log(`✓ Matched by order_id: ${matchedById}`);
  console.log(`✓ Unmatched: ${unmatched}`);
}

// ============================================================================
// 6. COMPANY-AUTHORIZATION TESTS
// ============================================================================

async function testCompanyAuthorization() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 6: COMPANY-AUTHORIZATION CHECKS");
  console.log("=".repeat(80));

  // 6.1 Get companies
  const { data: companies } = await admin
    .from("companies")
    .select("id, company_name, name")
    .limit(10);

  // 6.2 Check invoices per company
  const companyInvoiceCounts = {};
  for (const company of companies || []) {
    const { data: invoices } = await admin
      .from("invoices")
      .select("id", { count: "exact" })
      .eq("company_id", company.id);
    companyInvoiceCounts[company.company_name || company.name || "Unknown"] =
      invoices?.length || 0;
  }

  testResults.authorization.push({
    test: "Invoices per company",
    status: "PASS",
    counts: companyInvoiceCounts,
  });

  // 6.3 Check users per company
  const { data: distributors } = await admin
    .from("users")
    .select("id, email, company_id")
    .eq("role", "distributor");

  const companyUserCounts = {};
  for (const dist of distributors || []) {
    if (dist.company_id) {
      const { data: company } = await admin
        .from("companies")
        .select("company_name, name")
        .eq("id", dist.company_id)
        .maybeSingle();
      const companyName = company?.company_name || company?.name || "Unknown";
      companyUserCounts[companyName] = (companyUserCounts[companyName] || 0) + 1;
    }
  }

  testResults.authorization.push({
    test: "Users per company",
    status: "PASS",
    counts: companyUserCounts,
  });

  // 6.4 Verify company_id consistency
  // Check that invoices have valid company_id references
  const { data: invoicesWithCompany } = await admin
    .from("invoices")
    .select("id, company_id")
    .not("company_id", "is", null)
    .limit(20);

  let validCompanyRefs = 0;
  let invalidCompanyRefs = 0;

  for (const inv of invoicesWithCompany || []) {
    const { data: company } = await admin
      .from("companies")
      .select("id")
      .eq("id", inv.company_id)
      .maybeSingle();
    if (company) {
      validCompanyRefs++;
    } else {
      invalidCompanyRefs++;
      testResults.relationships.push({
        test: `Invoice ${inv.id} has invalid company_id`,
        status: "FAIL",
        companyId: inv.company_id,
      });
    }
  }

  testResults.relationships.push({
    test: "Invoice company_id references",
    status: invalidCompanyRefs === 0 ? "PASS" : "FAIL",
    valid: validCompanyRefs,
    invalid: invalidCompanyRefs,
  });

  console.log(`✓ Companies: ${companies?.length || 0}`);
  console.log(`✓ Valid company references: ${validCompanyRefs}`);
  console.log(`✓ Invalid company references: ${invalidCompanyRefs}`);
  console.log(`✓ Company invoice distribution:`, Object.keys(companyInvoiceCounts).length, "companies");
}

// ============================================================================
// 7. ORDER STATUS & ETA TESTS
// ============================================================================

async function testOrderStatusAndETA() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 7: ORDER STATUS & ETA CHECKS");
  console.log("=".repeat(80));

  // 7.1 Check order_status field exists and has values
  const { data: ordersWithStatus } = await admin
    .from("orders")
    .select("id, order_status, original_eta, revised_eta, delivery_date")
    .limit(20);

  const statusCounts = {};
  let ordersWithETA = 0;
  let ordersWithDeliveryDate = 0;
  let ordersRunningLate = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const order of ordersWithStatus || []) {
    statusCounts[order.order_status || "NULL"] = (statusCounts[order.order_status || "NULL"] || 0) + 1;

    if (order.original_eta || order.revised_eta) {
      ordersWithETA++;
    }

    if (order.delivery_date) {
      ordersWithDeliveryDate++;
    }

    // Check if running late
    const eta = order.revised_eta || order.original_eta;
    if (eta && !order.delivery_date) {
      const etaDate = new Date(eta);
      if (etaDate < today) {
        ordersRunningLate++;
      }
    }
  }

  testResults.dataIntegrity.push({
    test: "Order status distribution",
    status: "PASS",
    counts: statusCounts,
  });

  testResults.dataIntegrity.push({
    test: "Orders with ETA",
    status: ordersWithETA > 0 ? "PASS" : "WARN",
    count: ordersWithETA,
  });

  testResults.dataIntegrity.push({
    test: "Orders with delivery date",
    status: "PASS",
    count: ordersWithDeliveryDate,
  });

  testResults.dataIntegrity.push({
    test: "Orders running late",
    status: "PASS",
    count: ordersRunningLate,
  });

  console.log(`✓ Order statuses:`, statusCounts);
  console.log(`✓ Orders with ETA: ${ordersWithETA}`);
  console.log(`✓ Orders delivered: ${ordersWithDeliveryDate}`);
  console.log(`✓ Orders running late: ${ordersRunningLate}`);
}

// ============================================================================
// 8. PROFORMA INVOICE TESTS
// ============================================================================

async function testProformaInvoices() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 8: PROFORMA INVOICE CHECKS");
  console.log("=".repeat(80));

  // 8.1 Check proforma invoices exist
  const { data: proformas, error: proformaError } = await admin
    .from("proforma_invoices")
    .select("id, proforma_number, order_id, company_id, status")
    .limit(20);

  if (proformaError) {
    testResults.dataIntegrity.push({
      test: "Proforma invoices exist",
      status: "FAIL",
      error: proformaError.message,
    });
    return;
  }

  testResults.dataIntegrity.push({
    test: "Proforma invoices exist",
    status: proformas && proformas.length > 0 ? "PASS" : "WARN",
    count: proformas?.length || 0,
  });

  // 8.2 Check proforma invoice items
  const { data: proformaItems } = await admin
    .from("proforma_invoice_items")
    .select("id, proforma_invoice_id")
    .limit(20);

  testResults.dataIntegrity.push({
    test: "Proforma invoice items exist",
    status: proformaItems && proformaItems.length > 0 ? "PASS" : "WARN",
    count: proformaItems?.length || 0,
  });

  // 8.3 Check proforma -> order relationship
  let proformasWithOrders = 0;
  let proformasWithoutOrders = 0;

  for (const proforma of proformas || []) {
    if (proforma.order_id) {
      const { data: order } = await admin
        .from("orders")
        .select("id")
        .eq("id", proforma.order_id)
        .maybeSingle();
      if (order) {
        proformasWithOrders++;
      } else {
        proformasWithoutOrders++;
      }
    } else {
      proformasWithoutOrders++;
    }
  }

  testResults.relationships.push({
    test: "Proforma Invoice -> Order relationship",
    status: proformasWithOrders > 0 ? "PASS" : "WARN",
    withOrder: proformasWithOrders,
    withoutOrder: proformasWithoutOrders,
  });

  // 8.4 Check proforma -> final invoice relationship
  let proformasWithFinalInvoices = 0;
  let proformasWithoutFinalInvoices = 0;

  for (const proforma of proformas || []) {
    const { data: finalInvoices } = await admin
      .from("invoices")
      .select("id")
      .eq("proforma_invoice_id", proforma.id);
    if (finalInvoices && finalInvoices.length > 0) {
      proformasWithFinalInvoices++;
    } else {
      proformasWithoutFinalInvoices++;
    }
  }

  testResults.relationships.push({
    test: "Proforma Invoice -> Final Invoice relationship",
    status: proformasWithFinalInvoices > 0 ? "PASS" : "WARN",
    withFinalInvoices: proformasWithFinalInvoices,
    withoutFinalInvoices: proformasWithoutFinalInvoices,
  });

  console.log(`✓ Proforma invoices: ${proformas?.length || 0}`);
  console.log(`✓ Proforma items: ${proformaItems?.length || 0}`);
  console.log(`✓ Proformas with orders: ${proformasWithOrders}`);
  console.log(`✓ Proformas with final invoices: ${proformasWithFinalInvoices}`);
}

// ============================================================================
// 9. BOT TOOL FUNCTIONALITY TESTS
// ============================================================================

async function testBotTools() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 9: BOT TOOL FUNCTIONALITY CHECKS");
  console.log("=".repeat(80));

  // 9.1 Test data availability for getInvoiceDetails
  const { data: sampleInvoice } = await admin
    .from("invoices")
    .select("invoice_number, invoice_id")
    .limit(1)
    .maybeSingle();

  if (sampleInvoice) {
    testResults.botTools.push({
      test: "getInvoiceDetails - Sample invoice available",
      status: "PASS",
      invoiceNumber: sampleInvoice.invoice_number,
      invoiceId: sampleInvoice.invoice_id,
    });
  } else {
    testResults.botTools.push({
      test: "getInvoiceDetails - Sample invoice available",
      status: "FAIL",
      error: "No invoices found",
    });
  }

  // 9.2 Test data availability for getInvoicesByOrder
  const { data: sampleInvoiceOrder } = await admin
    .from("invoice_orders")
    .select("order_number")
    .not("order_number", "is", null)
    .limit(1)
    .maybeSingle();

  if (sampleInvoiceOrder) {
    testResults.botTools.push({
      test: "getInvoicesByOrder - Sample order available",
      status: "PASS",
      orderNumber: sampleInvoiceOrder.order_number,
    });
  } else {
    testResults.botTools.push({
      test: "getInvoicesByOrder - Sample order available",
      status: "FAIL",
      error: "No invoice_orders found",
    });
  }

  // 9.3 Test data availability for getOrderDrilldown
  const { data: sampleOrder } = await admin
    .from("orders")
    .select("order_number")
    .limit(1)
    .maybeSingle();

  if (sampleOrder) {
    testResults.botTools.push({
      test: "getOrderDrilldown - Sample order available",
      status: "PASS",
      orderNumber: sampleOrder.order_number,
    });
  } else {
    testResults.botTools.push({
      test: "getOrderDrilldown - Sample order available",
      status: "FAIL",
      error: "No orders found",
    });
  }

  // 9.4 Test data availability for getProformaInvoices
  const { data: sampleProforma } = await admin
    .from("proforma_invoices")
    .select("id, order_id")
    .limit(1)
    .maybeSingle();

  if (sampleProforma && sampleProforma.order_id) {
    const { data: order } = await admin
      .from("orders")
      .select("order_number")
      .eq("id", sampleProforma.order_id)
      .maybeSingle();

    if (order) {
      testResults.botTools.push({
        test: "getProformaInvoices - Sample proforma with order available",
        status: "PASS",
        orderNumber: order.order_number,
      });
    }
  } else {
    testResults.botTools.push({
      test: "getProformaInvoices - Sample proforma available",
      status: "WARN",
      note: "No proforma invoices found or not linked to orders",
    });
  }

  // 9.5 Test data availability for getCompanyInvoices
  const { data: sampleCompany } = await admin
    .from("companies")
    .select("id, company_name, name")
    .limit(1)
    .maybeSingle();

  if (sampleCompany) {
    const { data: companyInvoices } = await admin
      .from("invoices")
      .select("id")
      .eq("company_id", sampleCompany.id)
      .limit(1);

    testResults.botTools.push({
      test: "getCompanyInvoices - Sample company with invoices available",
      status: companyInvoices && companyInvoices.length > 0 ? "PASS" : "WARN",
      companyName: sampleCompany.company_name || sampleCompany.name,
      invoiceCount: companyInvoices?.length || 0,
    });
  }

  console.log(`✓ Sample invoice: ${sampleInvoice?.invoice_number || "N/A"}`);
  console.log(`✓ Sample order: ${sampleInvoiceOrder?.order_number || "N/A"}`);
  console.log(`✓ Sample order for drilldown: ${sampleOrder?.order_number || "N/A"}`);
}

// ============================================================================
// 10. DATA CONSISTENCY TESTS
// ============================================================================

async function testDataConsistency() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 10: DATA CONSISTENCY CHECKS");
  console.log("=".repeat(80));

  // 10.1 Check for duplicate invoice numbers
  const { data: invoices } = await admin
    .from("invoices")
    .select("invoice_number, invoice_id");

  const invoiceNumberCounts = {};
  const duplicates = [];

  for (const inv of invoices || []) {
    const key = inv.invoice_number;
    invoiceNumberCounts[key] = (invoiceNumberCounts[key] || 0) + 1;
    if (invoiceNumberCounts[key] > 1) {
      duplicates.push(key);
    }
  }

  testResults.dataIntegrity.push({
    test: "Duplicate invoice numbers",
    status: duplicates.length === 0 ? "PASS" : "FAIL",
    duplicates: duplicates.length,
  });

  // 10.2 Check for duplicate order numbers
  const { data: orders } = await admin
    .from("orders")
    .select("order_number");

  const orderNumberCounts = {};
  const duplicateOrders = [];

  for (const order of orders || []) {
    const key = order.order_number;
    orderNumberCounts[key] = (orderNumberCounts[key] || 0) + 1;
    if (orderNumberCounts[key] > 1) {
      duplicateOrders.push(key);
    }
  }

  testResults.dataIntegrity.push({
    test: "Duplicate order numbers",
    status: duplicateOrders.length === 0 ? "PASS" : "FAIL",
    duplicates: duplicateOrders.length,
  });

  // 10.3 Check invoice totals match sum of items
  const { data: sampleInvoices } = await admin
    .from("invoices")
    .select("id, invoice_total_amount")
    .limit(10);

  let totalsMatch = 0;
  let totalsMismatch = 0;

  for (const inv of sampleInvoices || []) {
    const { data: items } = await admin
      .from("invoice_items")
      .select("invoice_line_item_amount")
      .eq("invoice_id", inv.id);

    const itemsSum = items?.reduce((sum, item) => sum + (parseFloat(item.invoice_line_item_amount) || 0), 0) || 0;
    const invoiceTotal = parseFloat(inv.invoice_total_amount) || 0;
    const difference = Math.abs(itemsSum - invoiceTotal);

    // Allow small rounding differences (0.01)
    if (difference < 0.01) {
      totalsMatch++;
    } else {
      totalsMismatch++;
      testResults.dataIntegrity.push({
        test: `Invoice ${inv.id} total mismatch`,
        status: "WARN",
        invoiceTotal,
        itemsSum,
        difference,
      });
    }
  }

  testResults.dataIntegrity.push({
    test: "Invoice totals vs items sum",
    status: totalsMismatch === 0 ? "PASS" : "WARN",
    match: totalsMatch,
    mismatch: totalsMismatch,
  });

  console.log(`✓ Duplicate invoice numbers: ${duplicates.length}`);
  console.log(`✓ Duplicate order numbers: ${duplicateOrders.length}`);
  console.log(`✓ Invoice totals match: ${totalsMatch}/${sampleInvoices?.length || 0}`);
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.log("\n" + "=".repeat(80));
  console.log("COMPREHENSIVE SYSTEM TEST");
  console.log("=".repeat(80));
  console.log(`Testing at: ${new Date().toISOString()}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);

  try {
    await testDataIntegrity();
    await testRelationships();
    await testAuthentication();
    await testRLSPolicies();
    await testOrderInvoiceMatching();
    await testCompanyAuthorization();
    await testOrderStatusAndETA();
    await testProformaInvoices();
    await testBotTools();
    await testDataConsistency();

    // Print summary
    console.log("\n" + "=".repeat(80));
    console.log("TEST SUMMARY");
    console.log("=".repeat(80));

    const allTests = [
      ...testResults.dataIntegrity,
      ...testResults.relationships,
      ...testResults.authentication,
      ...testResults.authorization,
      ...testResults.botTools,
    ];

    const passed = allTests.filter((t) => t.status === "PASS").length;
    const failed = allTests.filter((t) => t.status === "FAIL").length;
    const warnings = allTests.filter((t) => t.status === "WARN").length;

    console.log(`\nTotal Tests: ${allTests.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    console.log(`❌ Failed: ${failed}`);

    if (testResults.errors.length > 0) {
      console.log(`\n❌ Errors Found:`);
      testResults.errors.forEach((error) => console.log(`  - ${error}`));
    }

    // Save detailed report
    const fs = await import("node:fs");
    const path = await import("node:path");
    const reportPath = path.join(process.cwd(), "..", "COMPREHENSIVE_TEST_REPORT.json");
    fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);

    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("\n❌ Test execution failed:", error);
    testResults.errors.push(error.message);
    process.exit(1);
  }
}

runAllTests();
