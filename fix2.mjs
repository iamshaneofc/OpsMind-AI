import fs from 'fs';

let route = fs.readFileSync('src/app/api/chat/route.ts', 'utf8');

// Replace isSqlServerDataEnabled and querySqlServer in resolveLocalWarehouseForProfile
route = route.replace(/const \{ data, error \} = await querySqlServer.*?`.*?`;/gs, 'const data = []; const error = null;');

// Replace looksLikeErpInvoiceVoucherNumber(orderToken)
route = route.replace(/if \(looksLikeErpInvoiceVoucherNumber\(orderToken\)\) return false;/g, '');

// Replace deriveOrderStatusFromERP
route = route.replace(/deriveOrderStatusFromERP\((.*?)\)/g, '($1.status || "ORDER_RECEIVED")');

// Replace getDistributorSqlAccountIds
route = route.replace(/import \{ getDistributorSqlAccountIds \} from "@\/lib\/distributor-sql-accounts";/g, '');

fs.writeFileSync('src/app/api/chat/route.ts', route);

let tools = fs.readFileSync('src/ai/tools.ts', 'utf8');
tools = tools.replace(/if \(isSqlServerDataEnabled\(\)\) return sqlServerOps\.[a-zA-Z]+\(.*\);\n/g, '');
tools = tools.replace(/return sqlServerOps\.[a-zA-Z]+\(.*\);\n/g, 'return { error: "ERP disabled" };\n');
tools = tools.replace(/const result = await sqlServerOps\.[a-zA-Z]+\(.*\);/g, 'const result = { accounts: [], source: "supabase" };');
fs.writeFileSync('src/ai/tools.ts', tools);
