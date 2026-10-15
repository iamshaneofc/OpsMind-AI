import "dotenv/config";
import { Client } from "pg";

const client = new Client({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  const orders = await client.query(
    `SELECT industry, COUNT(*)::int AS n FROM "Order" GROUP BY industry ORDER BY industry`,
  );
  console.log("Order by industry:", orders.rows);

  const industryCols = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'industry'
      AND table_name IN ('Order', 'Customer', 'Product', 'Warehouse', 'Invoice', 'InventoryMovement')
    ORDER BY table_name
  `);
  console.log("Industry columns:", industryCols.rows);

  const erp = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = ANY($1::text[])
    ORDER BY tablename
  `, [[
    "companies",
    "warehouses",
    "users",
    "orders",
    "order_items",
    "inventory",
    "alerts",
    "invoices",
    "invoice_items",
    "proforma_invoices",
    "user_whatsapp_accounts",
    "chatbot_messages",
  ]]);
  console.log("ERP/WhatsApp tables present:", erp.rows.map((r) => r.tablename));

  const expected = {
    agriculture: 880,
    automobile: 900,
    chemical: 1000,
    pharma: 850,
  };
  let ok = true;
  for (const row of orders.rows) {
    const want = expected[row.industry];
    if (want && row.n !== want) {
      console.warn(`WARN: ${row.industry} has ${row.n}, expected ${want}`);
      ok = false;
    }
  }
  if (orders.rows.length < 4) {
    console.warn("WARN: missing industry packs");
    ok = false;
  }
  console.log(ok ? "Industry seed intact." : "Industry seed needs re-seed.");
  process.exitCode = ok ? 0 : 2;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.end());
