// Create admin demo user in Supabase Auth + Prisma userRole + SQL users table
import { loadLocalEnv, requireEnv } from "./_env.mjs";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rawUrl = process.env.DATABASE_URL ?? "";
const cleanUrl = rawUrl.replace("?pgbouncer=true", "").replace("&pgbouncer=true", "");
const pool = new Pool({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false }, max: 10 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const EMAIL = "admindemo@opsmind.com";
const PASSWORD = "admindemo123";
const FULL_NAME = "Admin Demo";
const ROLE = "super_admin";

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

async function main() {
  console.log("=== Creating Admin Demo User ===\n");

  // 1. Create/update Supabase Auth user
  console.log("1. Checking Supabase Auth...");
  let authUser = await getAuthUserByEmail(EMAIL);
  
  if (authUser) {
    console.log("   User exists, updating password...");
    const { error } = await admin.auth.admin.updateUserById(authUser.id, { password: PASSWORD });
    if (error) throw new Error(`Auth update failed: ${error.message}`);
    console.log("   Password updated");
  } else {
    console.log("   Creating new user...");
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME, role: ROLE },
    });
    if (error) throw new Error(`Auth create failed: ${error.message}`);
    authUser = data.user;
    console.log("   Created:", authUser.id);
  }

  // 2. Create/update Prisma userRole
  console.log("\n2. Checking Prisma userRole...");
  const existingRole = await prisma.userRole.findUnique({ where: { email: EMAIL } });
  if (existingRole) {
    console.log("   userRole exists, updating to ADMIN...");
    await prisma.userRole.update({
      where: { email: EMAIL },
      data: { role: "ADMIN" },
    });
  } else {
    console.log("   Creating userRole...");
    await prisma.userRole.create({
      data: { email: EMAIL, role: "ADMIN" },
    });
  }
  console.log("   Prisma userRole ready");

  // 3. Create/update SQL users table
  console.log("\n3. Checking SQL users table...");
  // Need a company_id for admin - use first company
  const companies = await admin.from("companies").select("id").limit(1);
  const companyId = companies.data?.[0]?.id;

  if (!companyId) {
    console.log("   WARNING: No companies found in SQL, skipping users table");
  } else {
    const { data: existingSqlUser } = await admin.from("users").select("id").eq("email", EMAIL).single();
    
    if (existingSqlUser) {
      console.log("   SQL user exists, updating...");
      await admin.from("users").update({
        full_name: FULL_NAME,
        role: ROLE,
        company_id: companyId,
        warehouse_id: null,
      }).eq("id", existingSqlUser.id);
    } else {
      console.log("   Creating SQL user...");
      await admin.from("users").insert({
        id: authUser.id,
        email: EMAIL,
        full_name: FULL_NAME,
        role: ROLE,
        company_id: companyId,
        warehouse_id: null,
      });
    }
    console.log("   SQL users table ready");
  }

  console.log("\n=== Done ===");
  console.log(`Email: ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Role: ADMIN (super_admin in Supabase)`);
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