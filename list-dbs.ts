import { querySqlServer } from "./src/sql-server/client";
import * as fs from 'fs';

async function run() {
  const result = await querySqlServer("SELECT name FROM sys.databases");
  const dbs = result.data.map(r => (r as any).name);
  fs.writeFileSync("z:/opsmind-operations-ai/all_dbs.txt", JSON.stringify(dbs, null, 2));
  process.exit(0);
}
run();
