import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================================
// Test Functions
// ============================================================================

async function testUserAccess(email, expectedRole, expectedCompanyId = null, expectedWarehouseId = null) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Testing Access for: ${email}`);
  console.log("=".repeat(80));

  try {
    // Get auth user
    const { data: authUsers, error: listError } = await admin.auth.admin.listUsers();
    if (listError) throw listError;
    const authUser = authUsers.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!authUser) {
      console.log(`❌ Auth user not found: ${email}`);
      return false;
    }

    // Get app user
    const { data: appUser, error: userError } = await admin
      .from("users")
      .select("user_id, id, email, name, full_name, role_id, company_id, warehouse_id")
      .eq("email", email)
      .single();

    if (userError || !appUser) {
      console.log(`❌ App user not found: ${email}`);
      return false;
    }

    console.log(`\n✓ User Found:`);
    console.log(`  - Email: ${appUser.email}`);
    console.log(`  - Name: ${appUser.name || appUser.full_name || "N/A"}`);
    console.log(`  - Role ID: ${appUser.role_id}`);
    console.log(`  - Company ID: ${appUser.company_id || "None"}`);
    console.log(`  - Warehouse ID: ${appUser.warehouse_id || "None"}`);

    // Test invoice access
    console.log(`\n📋 Testing Invoice Access:`);
    let invoiceQuery = admin.from("invoices").select("id, invoice_number, invoice_date, company_id, customer_full_name");
    
    if (expectedRole === "distributor" && expectedCompanyId) {
      invoiceQuery = invoiceQuery.eq("company_id", expectedCompanyId);
    } else if (expectedRole === "warehouse") {
      // Warehouse users might see invoices for their warehouse's orders
      invoiceQuery = invoiceQuery.limit(5); // Limited access
    } else if (expectedRole === "super_admin") {
      invoiceQuery = invoiceQuery.limit(10); // Full access
    } else {
      invoiceQuery = invoiceQuery.limit(5);
    }

    const { data: invoices, error: invError } = await invoiceQuery;
    if (invError) {
      console.log(`  ❌ Error accessing invoices: ${invError.message}`);
    } else {
      console.log(`  ✓ Can access ${invoices?.length || 0} invoices`);
      if (invoices && invoices.length > 0) {
        console.log(`  Sample invoices:`);
        invoices.slice(0, 3).forEach((inv) => {
          console.log(`    - ${inv.invoice_number} (Company: ${inv.company_id || "N/A"})`);
        });
      }
    }

    // Test order access
    console.log(`\n📦 Testing Order Access:`);
    let orderQuery = admin.from("orders").select("id, order_number, order_date, company_id, warehouse_id, status");
    
    if (expectedRole === "distributor" && expectedCompanyId) {
      orderQuery = orderQuery.eq("company_id", expectedCompanyId);
    } else if (expectedRole === "warehouse" && expectedWarehouseId) {
      orderQuery = orderQuery.eq("warehouse_id", expectedWarehouseId);
    } else if (expectedRole === "super_admin") {
      orderQuery = orderQuery.limit(10);
    } else {
      orderQuery = orderQuery.limit(5);
    }

    const { data: orders, error: orderError } = await orderQuery;
    if (orderError) {
      console.log(`  ❌ Error accessing orders: ${orderError.message}`);
    } else {
      console.log(`  ✓ Can access ${orders?.length || 0} orders`);
      if (orders && orders.length > 0) {
        console.log(`  Sample orders:`);
        orders.slice(0, 3).forEach((ord) => {
          console.log(`    - ${ord.order_number} (Company: ${ord.company_id || "N/A"}, Warehouse: ${ord.warehouse_id || "N/A"})`);
        });
      }
    }

    // Test inventory access (for warehouse users)
    if (expectedRole === "warehouse" && expectedWarehouseId) {
      console.log(`\n📊 Testing Inventory Access:`);
      const { data: inventory, error: invError2 } = await admin
        .from("inventory")
        .select("id, product_id, warehouse_id, available_qty, available_quantity")
        .eq("warehouse_id", expectedWarehouseId)
        .limit(5);

      if (invError2) {
        console.log(`  ❌ Error accessing inventory: ${invError2.message}`);
      } else {
        console.log(`  ✓ Can access ${inventory?.length || 0} inventory items`);
      }
    }

    return true;
  } catch (error) {
    console.error(`❌ Error testing access for ${email}:`, error);
    return false;
  }
}

async function testAuthorization() {
  console.log("=".repeat(80));
  console.log("TESTING ACCOUNT AUTHORIZATION");
  console.log("=".repeat(80));

  // Get all test accounts
  const testAccounts = [
    {
      email: "krisshna.enterprise@srlchemicals.com",
      role: "distributor",
      description: "Krisshna Enterprise Distributor",
    },
    {
      email: "viraj.lifescience@srlchemicals.com",
      role: "distributor",
      description: "Viraj Life Science Distributor",
    },
    {
      email: "warehouse.central@srlchemicals.com",
      role: "warehouse",
      description: "SRL Central Warehouse",
    },
    {
      email: "warehouse.delhi@srlchemicals.com",
      role: "warehouse",
      description: "Delhi Central Warehouse",
    },
    {
      email: "super.admin@srlchemicals.com",
      role: "super_admin",
      description: "Super Admin",
    },
  ];

  const results = [];

  for (const account of testAccounts) {
    // Get user details
    const { data: user, error: userError } = await admin
      .from("users")
      .select("user_id, email, name, role_id, company_id, warehouse_id")
      .eq("email", account.email)
      .maybeSingle();

    if (userError || !user) {
      console.log(`\n❌ User not found: ${account.email}`);
      results.push({ account, success: false, error: "User not found" });
      continue;
    }

    const success = await testUserAccess(
      account.email,
      account.role,
      user.company_id,
      user.warehouse_id
    );

    results.push({ account, success, user });
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("AUTHORIZATION TEST SUMMARY");
  console.log("=".repeat(80));

  results.forEach((result) => {
    const status = result.success ? "✅ PASS" : "❌ FAIL";
    console.log(`\n${status} - ${result.account.description}`);
    console.log(`   Email: ${result.account.email}`);
    if (result.user) {
      console.log(`   Company ID: ${result.user.company_id || "None"}`);
      console.log(`   Warehouse ID: ${result.user.warehouse_id || "None"}`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  const passCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Results: ${passCount} passed, ${failCount} failed`);
  console.log("=".repeat(80));

  return results;
}

// ============================================================================
// Run Tests
// ============================================================================

testAuthorization()
  .then(() => {
    console.log("\n✅ Authorization testing completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Authorization testing failed:", error);
    process.exit(1);
  });
