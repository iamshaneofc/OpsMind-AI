import fs from 'fs';

let c = fs.readFileSync('src/ai/tools.ts', 'utf8');

c = c.replace(/import \{ isSqlServerDataEnabled \}.*\n/g, '');
c = c.replace(/import \* as sqlServerOps.*\n/g, '');
c = c.replace(/import \{ buildLaneAOrderSnapshot \}.*\n/g, 'import { buildLaneAOrderSnapshot } from "@/services/lane-a-supabase";\n');
c = c.replace(/import \{ estimateExpectedDeliveryDate \}.*\n/g, '');
c = c.replace(/import \{ getDistributorSqlAccountIds \}.*\n/g, '');

c = c.replace(/if \(isSqlServerDataEnabled\(\)\) return sqlServerOps\.sqlServerGetOrderStatus\(orderNumber, profile\);\n/g, '');
c = c.replace(/if \(isSqlServerDataEnabled\(\)\) return sqlServerOps\.sqlServerGetDistributorOrdersByName\(name, profile\);\n/g, '');
c = c.replace(/if \(isSqlServerDataEnabled\(\)\) return sqlServerOps\.sqlServerGetDistributorOrders\(companyId, profile\);\n/g, '');
c = c.replace(/if \(isSqlServerDataEnabled\(\)\) return sqlServerOps\.sqlServerGetWarehouseInventory\(warehouseId, profile\);\n/g, '');

c = c.replace(/return sqlServerOps\.sqlServerGetDistributorOrdersByName\(name, profile\);\n/g, 'return { error: "Not implemented" };\n');
c = c.replace(/return sqlServerOps\.sqlServerSearchDistributors\(search, profile\);\n/g, 'return { error: "Not implemented" };\n');

// For other sqlServerOps calls, let's just make them throw or return error
c = c.replace(/const result = await sqlServerOps\.sqlServerListErpAccounts\(limit, profile\);/g, 'const result = { accounts: [] };');

fs.writeFileSync('src/ai/tools.ts', c);
