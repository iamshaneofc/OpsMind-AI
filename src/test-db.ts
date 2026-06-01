import { querySqlServer } from "./sql-server/client";

async function main() {
  const q = `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Sales_Invoice_Header'
  `;
  const res = await querySqlServer(q);
  console.log(res.data.map((r: any) => r.COLUMN_NAME).filter((c: string) => c.toLowerCase().includes('transport')));
}
main().catch(console.error);
