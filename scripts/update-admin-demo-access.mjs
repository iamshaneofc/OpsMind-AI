import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rawUrl = process.env.DATABASE_URL ?? "";
const cleanUrl = rawUrl.replace("?pgbouncer=true", "").replace("&pgbouncer=true", "");
const pool = new Pool({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false }, max: 10 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Updating Admin Demo User for Full Data Access ===\n");

  // 1. Update SQL users table - set company_id to null for super_admin (access to all)
  console.log("1. Updating SQL users table (company_id = null for super_admin)...");
  const { data: updatedUser, error: updateError } = await admin
    .from("users")
    .update({ company_id: null })
    .eq("email", "admindemo@opsmind.com")
    .select();
  
  if (updateError) {
    console.error("   Error:", updateError.message);
  } else {
    console.log("   Updated:", updatedUser);
  }

  // 2. Verify Prisma userRole is ADMIN
  console.log("\n2. Checking Prisma userRole...");
  const userRole = await prisma.userRole.findUnique({ where: { email: "admindemo@opsmind.com" } });
  console.log("   Prisma userRole:", userRole);

  // 3. Verify the user can see all companies
  console.log("\n3. Verifying company access...");
  const { data: companies } = await admin.from("companies").select("id, name").limit(10);
  console.log(`   Total companies: ${companies?.length}`);
  companies?.forEach(c => console.log(`   - ${c.name} (${c.id})`));

  // 4. Verify orders across all companies
  const { data: orders, count } = await admin.from("orders").select("id, order_number, company_id", { count: "exact" }).limit(5);
  console.log(`\n4. Total orders in system: ${count}`);
  orders?.forEach(o => console.log(`   - ${o.order_number} (company: ${o.company_id})`));

  // 5. Verify inventory
  const { count: invCount } = await admin.from("inventory").select("id", { count: "exact", head: true });
  console.log(`\n5. Total inventory rows: ${invCount}`);

  console.log("\n=== Done ===");
}

main()
  .catch((err) => {
    console.error("Failed:", err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });