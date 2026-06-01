import { querySqlServer } from "./src/sql-server/client";
import * as fs from 'fs';

async function run() {
  const result = await querySqlServer("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES");
  const tables = result.data.map(r => (r as any).TABLE_NAME);
  fs.writeFileSync("z:/opsmind-operations-ai/all_tables.txt", JSON.stringify(tables, null, 2));
  process.exit(0);
}
run();
