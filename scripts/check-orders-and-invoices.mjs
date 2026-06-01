import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function checkData() {
  console.log("=".repeat(80));
  console.log("CHECKING ORDERS AND INVOICES");
  console.log("=".repeat(80));
  console.log();

  // Check orders
  const { data: orders } = await admin
    .from("orders")
    .select("order_number, status, order_status, expected_delivery_date, delivery_date, original_eta")
    .limit(20);

  console.log(`Total Orders Found: ${orders?.length || 0}`);
  console.log("\nSample Orders:");
  orders?.slice(0, 10).forEach((order) => {
    console.log(`  - ${order.order_number}: status=${order.status}, order_status=${order.order_status}, expected_delivery=${order.expected_delivery_date}`);
  });

  // Check dispatch ready orders
  const today = new Date().toISOString().split("T")[0];
  const { data: dispatchReady } = await admin
    .from("orders")
    .select("order_number, status, expected_delivery_date, delivery_date")
    .eq("status", "DISPATCH_READY")
    .limit(20);

  console.log(`\nDispatch Ready Orders: ${dispatchReady?.length || 0}`);
  console.log("\nDispatch Ready Orders (with dates):");
  dispatchReady?.forEach((order) => {
    const isPast = order.expected_delivery_date && order.expected_delivery_date < today;
    const marker = isPast ? " ⚠️ PAST DATE" : "";
    console.log(`  - ${order.order_number}: ${order.expected_delivery_date}${marker}`);
  });

  // Check invoices
  const { data: invoices } = await admin
    .from("invoices")
    .select("invoice_number, invoice_date, company_id, customer_full_name")
    .order("invoice_date", { ascending: false })
    .limit(20);

  console.log(`\nTotal Invoices Found: ${invoices?.length || 0}`);
  console.log("\nSample Invoices:");
  invoices?.slice(0, 10).forEach((invoice) => {
    console.log(`  - ${invoice.invoice_number}: date=${invoice.invoice_date}, company_id=${invoice.company_id}, customer=${invoice.customer_full_name}`);
  });

  // Check invoice-order links
  const { data: invoiceOrders } = await admin
    .from("invoice_orders")
    .select("invoice_id, order_number")
    .limit(20);

  console.log(`\nInvoice-Order Links: ${invoiceOrders?.length || 0}`);
  console.log("\nSample Links:");
  invoiceOrders?.slice(0, 10).forEach((link) => {
    console.log(`  - Invoice ${link.invoice_id} → Order ${link.order_number}`);
  });

  // Check order status distribution
  const { data: statusData } = await admin
    .from("orders")
    .select("status, order_status");

  const statusCounts = {};
  statusData?.forEach((order) => {
    const status = order.order_status || order.status || "UNKNOWN";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  console.log(`\nOrder Status Distribution:`);
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`  - ${status}: ${count}`);
  });
}

checkData().catch(console.error);
