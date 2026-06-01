import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "OpsMind@12345";

// ============================================================================
// Helper Functions
// ============================================================================

async function getAuthUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

async function ensureAuthUser({ email, password, fullName, role }) {
  const existing = await getAuthUserByEmail(email);
  if (existing) {
    console.log(`  ✓ Auth user already exists: ${email}`);
    return existing;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (error) throw error;
  console.log(`  ✓ Created auth user: ${email}`);
  return data.user;
}

async function ensureCompany(companyName) {
  // Check if company exists by company_name
  const searchTerm = `%${companyName}%`;
  const { data: existingByName, error: err1 } = await admin
    .from("companies")
    .select("company_id, company_name")
    .ilike("company_name", searchTerm)
    .limit(1);

  if (err1) throw err1;

  if (existingByName && existingByName.length > 0) {
    const company = existingByName[0];
    console.log(`  ✓ Company found: ${company.name || company.company_name || companyName}`);
    return company;
  }

  // Create new company
  const companyData = {
    company_name: companyName,
    status: "active",
  };

  // Try inserting with company_name
  const { data: inserted, error: err2 } = await admin
    .from("companies")
    .insert(companyData)
    .select("company_id, company_name")
    .single();

  if (err2) {
    throw err2;
  }

  console.log(`  ✓ Created company: ${companyName}`);
  return inserted;
}

async function ensureWarehouse(warehouseName) {
  // Check if warehouse exists - only warehouse_name column exists
  const searchTerm = `%${warehouseName}%`;
  const { data: existing, error: err1 } = await admin
    .from("warehouses")
    .select("warehouse_id, warehouse_name")
    .ilike("warehouse_name", searchTerm)
    .limit(1);

  if (err1) throw err1;

  if (existing && existing.length > 0) {
    const warehouse = existing[0];
    console.log(`  ✓ Warehouse found: ${warehouse.warehouse_name || warehouseName}`);
    return warehouse;
  }

  // Create new warehouse - only warehouse_name column exists
  const warehouseData = {
    warehouse_name: warehouseName,
    location: warehouseName.includes("Delhi") ? "Delhi" : warehouseName.includes("Mumbai") ? "Mumbai" : "Unknown",
  };

  const { data: inserted, error: err2 } = await admin
    .from("warehouses")
    .insert(warehouseData)
    .select("warehouse_id, warehouse_name")
    .single();

  if (err2) {
    throw err2;
  }

  console.log(`  ✓ Created warehouse: ${warehouseName}`);
  return inserted;
}

async function ensureUser({ email, fullName, role, companyId, warehouseId, authUserId }) {
  // Check if user exists
  const { data: existing, error: err1 } = await admin
    .from("users")
    .select("user_id, email, name, role_id, company_id, warehouse_id")
    .eq("email", email)
    .limit(1);

  if (err1) throw err1;

  // Map role to role_id
  const roleMap = {
    super_admin: 1,
    distributor: 2,
    warehouse: 3,
    company_admin: 2, // Company admin uses distributor role_id
  };

  const roleId = roleMap[role] || 2;

  if (existing && existing.length > 0) {
    const user = existing[0];
    // Update if needed
    const updateData = {};
    if (companyId && user.company_id !== companyId) updateData.company_id = companyId;
    if (warehouseId && user.warehouse_id !== warehouseId) updateData.warehouse_id = warehouseId;
    if (user.role_id !== roleId) updateData.role_id = roleId;

    if (Object.keys(updateData).length > 0) {
      const { data: updated, error: err2 } = await admin
        .from("users")
        .update(updateData)
        .eq("email", email)
        .select("user_id, email, name, role_id, company_id, warehouse_id")
        .single();
      if (err2) throw err2;
      console.log(`  ✓ Updated user: ${email}`);
      return updated;
    }
    console.log(`  ✓ User already exists: ${email}`);
    return user;
  }

  // Create new user
  const userData = {
    email,
    name: fullName,
    role_id: roleId,
    password_hash: "managed-by-supabase-auth",
    is_active: true,
  };

  // Add company_id or warehouse_id based on role
  if (role === "distributor" || role === "company_admin") {
    if (companyId) {
      // Handle both UUID and integer company_id
      if (typeof companyId === "object" && companyId.id) {
        userData.company_id = companyId.id || companyId.company_id;
      } else {
        userData.company_id = companyId;
      }
    }
  } else if (role === "warehouse") {
    if (warehouseId) {
      // Handle both UUID and integer warehouse_id
      if (typeof warehouseId === "object" && warehouseId.id) {
        userData.warehouse_id = warehouseId.id || warehouseId.warehouse_id;
      } else {
        userData.warehouse_id = warehouseId;
      }
    }
  }

  // Note: user_id is auto-generated, we don't set it manually

  const { data: inserted, error: err2 } = await admin
    .from("users")
    .insert(userData)
    .select("user_id, email, name, role_id, company_id, warehouse_id")
    .single();

  if (err2) {
    throw err2;
  }

  console.log(`  ✓ Created user: ${email}`);
  return inserted;
}

// ============================================================================
// Main Setup Function
// ============================================================================

async function setupAccountsFromInvoices() {
  console.log("=".repeat(80));
  console.log("SETTING UP ACCOUNTS FROM INVOICE DATA");
  console.log("=".repeat(80));
  console.log("");

  try {
    // Step 1: Get unique companies from invoices
    console.log("Step 1: Extracting companies from invoices...");
    const { data: invoices, error: invoiceError } = await admin
      .from("invoices")
      .select("company_id, customer_full_name")
      .not("company_id", "is", null)
      .limit(1000);

    if (invoiceError) throw invoiceError;

    // Get company details
    const companyIds = [...new Set(invoices.map((inv) => inv.company_id).filter(Boolean))];
    console.log(`  Found ${companyIds.length} unique company IDs in invoices`);

    const companyMap = new Map();
    for (const companyId of companyIds.slice(0, 10)) {
      const { data: company, error: err } = await admin
        .from("companies")
        .select("company_id, company_name")
        .eq("company_id", companyId)
        .limit(1);
      if (!err && company && company.length > 0) {
        const c = company[0];
        companyMap.set(companyId, c);
      }
    }

    // Also search for specific companies by name
    console.log("\nStep 2: Setting up distributor companies...");
    
    // Target companies from user request
    const targetCompanies = [
      { name: "Krisshna Enterprise, Guwahati", searchName: "Krisshna" },
      { name: "Viraj Life Science, Haridwar", searchName: "Viraj" },
    ];

    const companies = [];
    for (const target of targetCompanies) {
      console.log(`\n  Setting up company: ${target.name}`);
      
      // First, try to find in companies table
      const searchTerm = `%${target.searchName}%`;
      // Try company_name (only column that exists)
      const { data: foundCompanies, error: err } = await admin
        .from("companies")
        .select("company_id, company_name")
        .ilike("company_name", searchTerm)
        .limit(5);

      if (!err && foundCompanies && foundCompanies.length > 0) {
        console.log(`    Found existing company: ${foundCompanies[0].company_name}`);
        companies.push({ ...foundCompanies[0], displayName: target.name });
      } else {
        // Check if customer name matches in invoices
        const searchTerm2 = `%${target.searchName}%`;
        const { data: invoiceCustomers, error: invErr } = await admin
          .from("invoices")
          .select("company_id, customer_full_name")
          .ilike("customer_full_name", searchTerm2)
          .not("company_id", "is", null)
          .limit(1);

        if (!invErr && invoiceCustomers && invoiceCustomers.length > 0) {
          const inv = invoiceCustomers[0];
          const { data: comp, error: compErr } = await admin
            .from("companies")
            .select("company_id, company_name")
            .eq("company_id", inv.company_id)
            .limit(1);

          if (!compErr && comp && comp.length > 0) {
            console.log(`    Found company from invoice: ${comp[0].company_name}`);
            companies.push({ ...comp[0], displayName: target.name });
          } else {
            // Create new company
            const newCompany = await ensureCompany(target.name);
            companies.push({ ...newCompany, displayName: target.name });
          }
        } else {
          // Create new company
          const newCompany = await ensureCompany(target.name);
          companies.push({ ...newCompany, displayName: target.name });
        }
      }
    }

    // Step 3: Set up warehouses
    console.log("\nStep 3: Setting up warehouses...");
    const targetWarehouses = [
      { name: "OpsMind Central Warehouse", location: "Mumbai" },
      { name: "Delhi Central", location: "Delhi" },
    ];

    const warehouses = [];
    for (const target of targetWarehouses) {
      console.log(`\n  Setting up warehouse: ${target.name}`);
      const warehouse = await ensureWarehouse(target.name);
      warehouses.push({ ...warehouse, displayName: target.name });
    }

    // Step 4: Create distributor accounts
    console.log("\nStep 4: Creating distributor accounts...");
    const distributors = [];
    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      const email = i === 0 
        ? "krisshna.enterprise@opsmindchemicals.com"
        : "viraj.lifescience@opsmindchemicals.com";
      const fullName = i === 0
        ? "Krisshna Enterprise Admin"
        : "Viraj Life Science Admin";

      console.log(`\n  Creating distributor account for: ${company.displayName}`);
      console.log(`    Email: ${email}`);
      
      const authUser = await ensureAuthUser({
        email,
        password: PASSWORD,
        fullName,
        role: "distributor",
      });

      const companyId = company.company_id;
      const user = await ensureUser({
        email,
        fullName,
        role: "distributor",
        companyId,
        warehouseId: null,
        authUserId: authUser.id,
      });

      distributors.push({ ...user, company, email, password: PASSWORD });
    }

    // Step 5: Create warehouse accounts
    console.log("\nStep 5: Creating warehouse accounts...");
    const warehouseUsers = [];
    for (let i = 0; i < warehouses.length; i++) {
      const warehouse = warehouses[i];
      const email = i === 0
        ? "warehouse.central@opsmindchemicals.com"
        : "warehouse.delhi@opsmindchemicals.com";
      const fullName = i === 0
        ? "OpsMind Central Warehouse Incharge"
        : "Delhi Central Warehouse Incharge";

      console.log(`\n  Creating warehouse account for: ${warehouse.displayName}`);
      console.log(`    Email: ${email}`);
      
      const authUser = await ensureAuthUser({
        email,
        password: PASSWORD,
        fullName,
        role: "warehouse",
      });

      const warehouseId = warehouse.warehouse_id;
      const user = await ensureUser({
        email,
        fullName,
        role: "warehouse",
        companyId: null,
        warehouseId,
        authUserId: authUser.id,
      });

      warehouseUsers.push({ ...user, warehouse, email, password: PASSWORD });
    }

    // Step 6: Summary
    console.log("\n" + "=".repeat(80));
    console.log("SETUP COMPLETE - ACCOUNT SUMMARY");
    console.log("=".repeat(80));
    console.log("\n📋 DISTRIBUTOR ACCOUNTS:");
    distributors.forEach((dist, idx) => {
      console.log(`\n${idx + 1}. ${dist.company.displayName}`);
      console.log(`   Email: ${dist.email}`);
      console.log(`   Password: ${dist.password}`);
      console.log(`   Role: Distributor`);
      console.log(`   Company ID: ${dist.company_id || dist.company.id || dist.company.company_id}`);
    });

    console.log("\n📦 WAREHOUSE ACCOUNTS:");
    warehouseUsers.forEach((wh, idx) => {
      console.log(`\n${idx + 1}. ${wh.warehouse.displayName}`);
      console.log(`   Email: ${wh.email}`);
      console.log(`   Password: ${wh.password}`);
      console.log(`   Role: Warehouse`);
      console.log(`   Warehouse ID: ${wh.warehouse_id || wh.warehouse.id || wh.warehouse.warehouse_id}`);
    });

    console.log("\n" + "=".repeat(80));
    console.log("✅ All accounts created successfully!");
    console.log("=".repeat(80));

    return {
      distributors,
      warehouseUsers,
      companies,
      warehouses,
    };

  } catch (error) {
    console.error("\n❌ Error setting up accounts:", error);
    throw error;
  }
}

// ============================================================================
// Run Setup
// ============================================================================

setupAccountsFromInvoices()
  .then(() => {
    console.log("\n✅ Setup completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  });
