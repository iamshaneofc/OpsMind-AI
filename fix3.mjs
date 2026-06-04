import fs from 'fs';

let route = fs.readFileSync('src/app/api/chat/route.ts', 'utf8');
route = route.replace(/import \{ isSqlServerDataEnabled \}.*\n/g, 'const isSqlServerDataEnabled = () => false;\n');
route = route.replace(/import \{ deriveOrderStatusFromERP \}.*\n/g, 'const deriveOrderStatusFromERP = (o: any) => o?.status || "ORDER_RECEIVED";\n');
route = route.replace(/import \{ looksLikeErpInvoiceVoucherNumber \}.*\n/g, 'const looksLikeErpInvoiceVoucherNumber = (v: string) => false;\n');
route = route.replace(/import \{ querySqlServer \}.*\n/g, 'const querySqlServer = async <T>(...args: any[]) => ({ data: [] as T[], error: null });\n');
route = route.replace(/import \{ getDistributorSqlAccountIds \}.*\n/g, 'const getDistributorSqlAccountIds = (p: any) => [];\n');
fs.writeFileSync('src/app/api/chat/route.ts', route);

let tools = fs.readFileSync('src/ai/tools.ts', 'utf8');
tools = tools.replace(/import \{ isSqlServerDataEnabled \}.*\n/g, 'const isSqlServerDataEnabled = () => false;\n');
tools = tools.replace(/import \* as sqlServerOps.*\n/g, 'const sqlServerOps = {} as any;\n');
tools = tools.replace(/import \{ buildLaneAOrderSnapshot \}.*\n/g, 'import { buildLaneAOrderSnapshot } from "@/services/lane-a-supabase";\n');
tools = tools.replace(/import \{ estimateExpectedDeliveryDate \}.*\n/g, 'const estimateExpectedDeliveryDate = (a: any) => null;\n');
tools = tools.replace(/import \{ getDistributorSqlAccountIds \}.*\n/g, 'const getDistributorSqlAccountIds = (p: any) => [];\n');
fs.writeFileSync('src/ai/tools.ts', tools);
