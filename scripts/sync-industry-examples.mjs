/** Refresh industry.ts example SKUs from live seeded products (print-only). */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const rawUrl = (process.env.DATABASE_URL ?? "")
  .replace("?pgbouncer=true", "")
  .replace("&pgbouncer=true", "");
const pool = new Pool({
  connectionString: rawUrl,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  for (const industry of ["chemical", "automobile", "pharma", "agriculture"]) {
    const products = await prisma.product.findMany({
      where: { industry },
      take: 3,
      orderBy: { sku: "asc" },
    });
    const warehouses = await prisma.warehouse.findMany({
      where: { industry },
      take: 3,
      orderBy: { name: "asc" },
    });
    console.log(industry, {
      skus: products.map((p) => p.sku),
      hubs: warehouses.map((w) => w.name),
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
