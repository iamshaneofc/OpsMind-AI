/**
 * Creates Supabase auth users + Prisma UserRole + public.users (ERP) bridge.
 * Run after: db push / industry seed / supabase migrations.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";

const password = process.env.SEED_PASSWORD || "OpsMind@12345";

/** App role (UserRole) + ERP role (public.users) mapping per plan */
const users = [
  {
    email: "admin@opsmind.demo",
    appRole: "ADMIN",
    erpRole: "super_admin",
    fullName: "OpsMind Admin",
  },
  {
    email: "manager@opsmind.demo",
    appRole: "MANAGER",
    erpRole: "distributor",
    fullName: "OpsMind Manager",
  },
  {
    email: "analyst@opsmind.demo",
    appRole: "ANALYST",
    erpRole: "warehouse",
    fullName: "OpsMind Analyst",
  },
];

const rawUrl = (process.env.DATABASE_URL ?? "")
  .replace("?pgbouncer=true", "")
  .replace("&pgbouncer=true", "");
const pool = new Pool({
  connectionString: rawUrl,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function ensureCompanyAndWarehouse() {
  const companyRes = await pool.query(
    `INSERT INTO public.companies (name, code)
     VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code
     RETURNING id, name`,
    ["Meridian Specialty Chem", "MSC"],
  );
  const companyId = companyRes.rows[0].id;

  // Prefer matching a Prisma Warehouse name for auth.ts name-join bridge
  const prismaWh = await pool.query(
    `SELECT name, location FROM "Warehouse" WHERE industry = 'chemical' ORDER BY name LIMIT 1`,
  );
  const whName = prismaWh.rows[0]?.name || "Mumbai Hub";
  const whLoc = prismaWh.rows[0]?.location || "Mumbai, MH";

  const existingWh = await pool.query(
    `SELECT id, name FROM public.warehouses WHERE name = $1 LIMIT 1`,
    [whName],
  );
  let warehouseId;
  if (existingWh.rows[0]) {
    warehouseId = existingWh.rows[0].id;
  } else {
    const whRes = await pool.query(
      `INSERT INTO public.warehouses (name, location)
       VALUES ($1, $2)
       RETURNING id, name`,
      [whName, whLoc],
    );
    warehouseId = whRes.rows[0].id;
  }

  // Link company base warehouse if column exists
  try {
    await pool.query(
      `UPDATE public.companies SET base_warehouse_id = NULL WHERE id = $1`,
      [companyId],
    );
  } catch {
    // column type may be int4 in older shapes — ignore for demo bridge
  }

  console.log("ERP company:", companyRes.rows[0].name, companyId);
  console.log("ERP warehouse:", whName, warehouseId);
  return { companyId, warehouseId };
}

async function upsertPublicUser({ authUserId, email, fullName, erpRole, companyId, warehouseId }) {
  const company = erpRole === "distributor" || erpRole === "super_admin" ? companyId : null;
  const warehouse = erpRole === "warehouse" ? warehouseId : null;

  await pool.query(
    `INSERT INTO public.users (id, email, full_name, role, company_id, warehouse_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       full_name = EXCLUDED.full_name,
       role = EXCLUDED.role,
       company_id = EXCLUDED.company_id,
       warehouse_id = EXCLUDED.warehouse_id`,
    [authUserId, email, fullName, erpRole, company, warehouse],
  );
}

async function findAuthUserId(email) {
  // Paginate lightly — demo project is small
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (!data.users.length || data.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  const { companyId, warehouseId } = await ensureCompanyAndWarehouse();

  for (const u of users) {
    let authUserId = null;
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: u.fullName },
    });
    if (error && !/already|registered/i.test(error.message)) {
      console.log(u.email, "auth error:", error.message);
    }
    if (data?.user?.id) {
      authUserId = data.user.id;
      console.log(u.email, "created", authUserId);
    } else {
      authUserId = await findAuthUserId(u.email);
      console.log(u.email, "already exists", authUserId);
    }
    if (!authUserId) {
      console.error(u.email, "could not resolve auth user id — skip public.users");
      continue;
    }

    await prisma.userRole.upsert({
      where: { email: u.email },
      update: { role: u.appRole },
      create: { email: u.email, role: u.appRole },
    });

    await upsertPublicUser({
      authUserId,
      email: u.email,
      fullName: u.fullName,
      erpRole: u.erpRole,
      companyId,
      warehouseId,
    });
    console.log(u.email, "→ public.users role", u.erpRole);
  }

  const pub = await pool.query(
    `SELECT email, role, company_id IS NOT NULL AS has_company, warehouse_id IS NOT NULL AS has_warehouse
     FROM public.users ORDER BY email`,
  );
  console.log("public.users:", pub.rows);
  console.log("UserRole rows:", await prisma.userRole.findMany());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
