/**
 * Guarantees inactive accounts per industry for bot demos
 * (customers with no orders in the last 45 days).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const industries = ["chemical", "automobile", "pharma", "agriculture"];
const rawUrl = (process.env.DATABASE_URL ?? "")
  .replace("?pgbouncer=true", "")
  .replace("&pgbouncer=true", "");
const pool = new Pool({
  connectionString: rawUrl,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);

  for (const industry of industries) {
    const customers = await prisma.customer.findMany({
      where: { industry },
      orderBy: { name: "asc" },
      take: 8,
    });
    // Push last 6 customers' orders far into the past + mark INACTIVE
    const targets = customers.slice(-6);
    for (const c of targets) {
      await prisma.customer.update({
        where: { id: c.id },
        data: { status: "INACTIVE" },
      });
      await prisma.order.updateMany({
        where: { customerId: c.id, industry },
        data: {
          orderDate: cutoff,
          createdAt: cutoff,
          updatedAt: cutoff,
        },
      });
    }
    const thirty = new Date();
    thirty.setDate(thirty.getDate() - 30);
    const inactive = await prisma.customer.count({
      where: {
        industry,
        orders: { none: { industry, orderDate: { gte: thirty } } },
      },
    });
    console.log(industry, "inactive (30d):", inactive, "patched:", targets.map((t) => t.name).join("; "));
  }
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
