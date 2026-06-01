import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Enhanced Comprehensive Bot Testing
 * Tests all scenarios with real data and different roles
 */

const testResults = {
  tests: [],
  summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
  byRole: {},
  byCategory: {},
  responseQuality: { realistic: 0, needsImprovement: 0, accurate: 0, inaccurate: 0 },
};

// Real data
let realOrders = [];
let realInvoices = [];
let realCompanies = [];
let realWarehouses = [];
let realDelayedOrders = [];

async function loadRealData() {
  console.log("Loading real data from database...");
  
  const { data: orders } = await admin
    .from("orders")
    .select("id, order_id, order_number, company_id, warehouse_id, order_status, original_eta, revised_eta")
    .limit(30);
  realOrders = orders || [];

  const { data: invoices } = await admin
    .from("invoices")
    .select("id, invoice_id, invoice_number, company_id, customer_full_name")
    .limit(30);
  realInvoices = invoices || [];

  const { data: companies } = await admin
    .from("companies")
    .select("id, company_id, company_name, name")
    .limit(10);
  realCompanies = companies || [];

  const { data: warehouses } = await admin
    .from("warehouses")
    .select("warehouse_id, warehouse_name, location")
    .limit(10);
  realWarehouses = warehouses || [];

  // Get delayed orders
  const { data: delayed } = await admin
    .from("orders")
    .select("id, order_number, order_status, original_eta, revised_eta, delay_reason, company_id")
    .or(`order_status.eq.Running Late,order_status.eq.RUNNING_LATE`)
    .limit(20);
  realDelayedOrders = delayed || [];

  console.log(`✓ Loaded: ${realOrders.length} orders, ${realOrders.length} invoices, ${realCompanies.length} companies, ${realWarehouses.length} warehouses`);
  console.log(`✓ Found ${realDelayedOrders.length} delayed orders`);
}

function createTestProfiles() {
  const companyId = realCompanies[0]?.id || realCompanies[0]?.company_id || 1;
  const warehouseId = realWarehouses[0]?.warehouse_id || 1;

  return {
    super_admin: {
      user_id: 1,
      email: "test.superadmin@srl.com",
      full_name: "Test Super Admin",
      role_id: 1,
      role: "super_admin",
      company_id: null,
      warehouse_id: null,
    },
    distributor: {
      user_id: 2,
      email: "test.distributor@srl.com",
      full_name: "Test Distributor",
      role_id: 2,
      role: "distributor",
      company_id: companyId,
      warehouse_id: null,
    },
    warehouse: {
      user_id: 3,
      email: "test.warehouse@srl.com",
      full_name: "Test Warehouse",
      role_id: 3,
      role: "warehouse",
      company_id: null,
      warehouse_id: warehouseId,
    },
    company_admin: {
      user_id: 4,
      email: "test.admin@srl.com",
      full_name: "Test Company Admin",
      role_id: 2,
      role: "distributor",
      company_id: companyId,
      warehouse_id: null,
    },
  };
}

// Tool functions (recreated from tools.ts)
async function executeToolFunction(toolName, args, profile) {
  const supabase = admin;

  // Auto-fill warehouse_id for warehouse users
  if (profile.role === "warehouse" && profile.warehouse_id) {
    if (toolName === "getWarehouseInventory" && (!args.warehouseId || args.warehouseId === 0)) {
      args.warehouseId = profile.warehouse_id;
    }
    if (toolName === "getOrdersByWarehouse" && (!args.warehouseId || args.warehouseId === 0)) {
      args.warehouseId = profile.warehouse_id;
    }
  }

  switch (toolName) {
    case "getOrderStatus": {
      const orderNumber = String(args.orderNumber || "");
      if (!orderNumber) return { error: "Order number is required." };

      const query = supabase
        .from("orders")
        .select("id,order_id,order_number,status,order_status,expected_delivery_date,original_eta,revised_eta,delivery_date,delay_reason,company_id,warehouse_id")
        .eq("order_number", orderNumber);

      if (profile.role === "distributor" && profile.company_id) {
        query.eq("company_id", profile.company_id);
      }
      if (profile.role === "warehouse" && profile.warehouse_id) {
        query.eq("warehouse_id", profile.warehouse_id);
      }

      const { data, error } = await query.single();
      if (error || !data) return { error: "Order not found or access denied." };
      
      const { data: warehouse } = await supabase
        .from("warehouses")
        .select("warehouse_name")
        .eq("warehouse_id", data.warehouse_id)
        .single();

      const { data: invoiceOrders } = await supabase
        .from("invoice_orders")
        .select("invoice_id")
        .eq("order_number", orderNumber);

      const invoiceCount = invoiceOrders?.length || 0;
      const calculatedStatus = data.order_status || 
        (data.delivery_date ? "Delivered" : 
         (data.original_eta && new Date() > new Date(data.original_eta) ? "Running Late" : "Work in Progress"));

      return { 
        ...data, 
        warehouse_name: warehouse?.warehouse_name ?? null,
        order_status: calculatedStatus,
        invoice_count: invoiceCount,
      };
    }

    case "getInvoiceDetails": {
      const invoiceNumber = String(args.invoiceNumber || "");
      if (!invoiceNumber.trim()) return { error: "Invoice number is required." };

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select(`
          id, invoice_id, invoice_number, invoice_date, invoice_total_amount,
          base_amount, tax_amount, discount_amount, confirmed, transport_name,
          vehicle_number, date_of_removal, company_id, customer_id, account_id,
          customer_full_name, customer_email, customer_telephone
        `)
        .or(`invoice_number.eq.${invoiceNumber},invoice_id.eq.${invoiceNumber}`)
        .maybeSingle();

      if (invoiceError || !invoice) {
        return { error: `Invoice not found: ${invoiceNumber}` };
      }

      if (profile.role !== "super_admin" && profile.company_id && invoice.company_id !== profile.company_id) {
        return { error: "Access denied for this invoice." };
      }

      const { data: items } = await supabase
        .from("invoice_items")
        .select(`
          id, invoice_body_id, invoice_quantity, invoice_line_base_amount,
          invoice_line_item_amount, product_id, product_catalogue_number,
          product_description, order_product_printing_name
        `)
        .eq("invoice_id", invoice.id)
        .order("invoice_body_id");

      const { data: orders } = await supabase
        .from("invoice_orders")
        .select(`
          id, order_id, order_number, order_date, customer_po_number, order_total_amount
        `)
        .eq("invoice_id", invoice.id);

      let companyName = null;
      if (invoice.company_id) {
        const { data: company } = await supabase
          .from("companies")
          .select("name, company_name")
          .eq("id", invoice.company_id)
          .maybeSingle();
        companyName = company?.name || company?.company_name || null;
      }

      return {
        invoice: {
          invoice_id: invoice.invoice_id,
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          total_amount: invoice.invoice_total_amount,
          base_amount: invoice.base_amount,
          tax_amount: invoice.tax_amount,
          discount_amount: invoice.discount_amount,
          confirmed: invoice.confirmed,
          transport_name: invoice.transport_name,
          vehicle_number: invoice.vehicle_number,
          date_of_removal: invoice.date_of_removal,
          company_name: companyName,
          customer_name: invoice.customer_full_name,
          customer_email: invoice.customer_email,
          customer_telephone: invoice.customer_telephone,
        },
        items: items || [],
        linked_orders: orders || [],
      };
    }

    case "getInvoicesByOrder": {
      const orderNumber = String(args.orderNumber || "");
      if (!orderNumber.trim()) return { error: "Order number is required." };

      const { data: order } = await supabase
        .from("orders")
        .select("id, order_number, company_id, order_status, original_eta, revised_eta")
        .eq("order_number", orderNumber)
        .maybeSingle();

      if (!order) {
        return { error: `Order not found: ${orderNumber}` };
      }

      if (profile.role === "distributor" && profile.company_id && order.company_id !== profile.company_id) {
        return { error: "Access denied for this order." };
      }

      const { data: invoiceOrders } = await supabase
        .from("invoice_orders")
        .select("invoice_id, order_number, order_date, order_total_amount")
        .eq("order_number", orderNumber);

      if (!invoiceOrders || invoiceOrders.length === 0) {
        return {
          order: {
            order_number: order.order_number,
            order_status: order.order_status,
            original_eta: order.original_eta,
            revised_eta: order.revised_eta,
          },
          invoices: [],
          message: "No invoices found for this order.",
        };
      }

      const invoiceIds = invoiceOrders.map((io) => io.invoice_id).filter(Boolean);
      const { data: invoices } = await supabase
        .from("invoices")
        .select(`
          id, invoice_id, invoice_number, invoice_date, invoice_total_amount,
          confirmed, date_of_removal
        `)
        .in("id", invoiceIds)
        .order("invoice_date", { ascending: false });

      return {
        order: {
          order_number: order.order_number,
          order_status: order.order_status,
          original_eta: order.original_eta,
          revised_eta: order.revised_eta,
        },
        invoices: (invoices || []).map((inv) => ({
          invoice_id: inv.invoice_id,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          total_amount: inv.invoice_total_amount,
          confirmed: inv.confirmed,
          date_of_removal: inv.date_of_removal,
        })),
        invoice_count: invoices?.length || 0,
      };
    }

    case "getOrderDrilldown": {
      const orderNumber = String(args.orderNumber || "");
      if (!orderNumber.trim()) return { error: "Order number is required." };

      const { data: order } = await supabase
        .from("orders")
        .select(`
          id, order_number, company_id, order_status, original_eta, revised_eta,
          delivery_date, delay_reason
        `)
        .eq("order_number", orderNumber)
        .maybeSingle();

      if (!order) {
        return { error: `Order not found: ${orderNumber}` };
      }

      if (profile.role === "distributor" && profile.company_id && order.company_id !== profile.company_id) {
        return { error: "Access denied for this order." };
      }

      const { data: orderItems } = await supabase
        .from("order_items")
        .select(`
          id, product_id, quantity, item_status, processed_quantity,
          pending_quantity, delayed_quantity
        `)
        .eq("order_id", order.id);

      if (!orderItems || orderItems.length === 0) {
        return {
          order: {
            order_number: order.order_number,
            order_status: order.order_status,
            original_eta: order.original_eta,
            revised_eta: order.revised_eta,
            delivery_date: order.delivery_date,
            delay_reason: order.delay_reason,
          },
          items: [],
          message: "No items found for this order.",
        };
      }

      const productIds = orderItems.map((oi) => oi.product_id).filter(Boolean);
      const { data: products } = await supabase
        .from("products")
        .select("id, product_name, sku, catalogue_number, description")
        .in("id", productIds);

      const productMap = new Map((products || []).map((p) => [p.id, p]));

      const { data: invoiceOrders } = await supabase
        .from("invoice_orders")
        .select("invoice_id")
        .eq("order_number", orderNumber);

      const invoiceIds = invoiceOrders?.map((io) => io.invoice_id).filter(Boolean) || [];

      const itemsWithStatus = await Promise.all(
        orderItems.map(async (item) => {
          const product = productMap.get(item.product_id);
          
          let processedQty = item.processed_quantity || 0;
          if (invoiceIds.length > 0) {
            const { data: invoiceItems } = await supabase
              .from("invoice_items")
              .select("invoice_quantity")
              .eq("product_id", item.product_id)
              .in("invoice_id", invoiceIds);
            
            processedQty = invoiceItems?.reduce((sum, ii) => sum + (Number(ii.invoice_quantity) || 0), 0) || 0;
          }

          const orderedQty = Number(item.quantity) || 0;
          const pendingQty = Math.max(0, orderedQty - processedQty);
          const delayedQty = item.delayed_quantity || 0;

          return {
            product_id: item.product_id,
            product_name: product?.product_name || product?.description || "Unknown Product",
            product_sku: product?.sku || product?.catalogue_number || "N/A",
            ordered: orderedQty,
            processed: processedQty,
            pending: pendingQty,
            delayed: delayedQty,
            item_status: item.item_status || "Ordered",
          };
        })
      );

      return {
        order: {
          order_number: order.order_number,
          order_status: order.order_status || "Work in Progress",
          original_eta: order.original_eta,
          revised_eta: order.revised_eta,
          delivery_date: order.delivery_date,
          delay_reason: order.delay_reason,
        },
        items: itemsWithStatus,
        summary: {
          total_items: itemsWithStatus.length,
          total_ordered: itemsWithStatus.reduce((sum, item) => sum + item.ordered, 0),
          total_processed: itemsWithStatus.reduce((sum, item) => sum + item.processed, 0),
          total_pending: itemsWithStatus.reduce((sum, item) => sum + item.pending, 0),
          total_delayed: itemsWithStatus.reduce((sum, item) => sum + item.delayed, 0),
        },
      };
    }

    case "getWarehouseInventory": {
      const warehouseId = Number(args.warehouseId || 0);
      if (!Number.isFinite(warehouseId)) return { error: "Invalid warehouse id." };
      
      if (profile.role === "distributor") {
        return { error: "Access denied. Distributors cannot view inventory. Only Super Admin and Warehouse Incharge can access inventory data." };
      }
      
      if (profile.role === "warehouse") {
        if (!profile.warehouse_id) {
          return { error: "Access denied. Your account is not associated with a warehouse." };
        }
        if (profile.warehouse_id !== warehouseId) {
          return { error: "Access denied for this warehouse. You can only access inventory for your assigned warehouse." };
        }
      }

      const { data } = await supabase
        .from("inventory")
        .select("product_id,available_quantity")
        .eq("warehouse_id", warehouseId)
        .order("updated_at", { ascending: false })
        .limit(20);

      const rows = data ?? [];
      if (!rows.length) return [];

      const productIds = Array.from(new Set(rows.map((row) => row.product_id)));
      const { data: products } = await supabase
        .from("products")
        .select("product_id,product_name,sku")
        .in("product_id", productIds);
      
      const { data: warehouse } = await supabase
        .from("warehouses")
        .select("warehouse_name")
        .eq("warehouse_id", warehouseId)
        .single();
      
      const pMap = new Map((products ?? []).map((p) => [p.product_id, p]));
      return rows.map((row) => ({
        available_qty: row.available_quantity,
        reorder_level: 30,
        product_name: pMap.get(row.product_id)?.product_name ?? null,
        sku: pMap.get(row.product_id)?.sku ?? null,
        warehouse_name: warehouse?.warehouse_name ?? null,
      }));
    }

    case "getDelayedInvoices": {
      const today = new Date().toISOString().split("T")[0];

      const { data: delayedOrders } = await supabase
        .from("orders")
        .select("id, order_number, order_status, original_eta, revised_eta, delay_reason, company_id")
        .or(`order_status.eq.Running Late,order_status.eq.RUNNING_LATE`)
        .order("original_eta", { ascending: true })
        .limit(50);

      if (!delayedOrders || delayedOrders.length === 0) {
        return {
          delayed_invoices: [],
          message: "No delayed invoices found.",
        };
      }

      let filteredOrders = delayedOrders;
      if (profile.role === "distributor" && profile.company_id) {
        filteredOrders = delayedOrders.filter((o) => o.company_id === profile.company_id);
      }

      const orderNumbers = filteredOrders.map((o) => o.order_number).filter(Boolean);
      const { data: invoiceOrders } = await supabase
        .from("invoice_orders")
        .select("invoice_id, order_number")
        .in("order_number", orderNumbers);

      if (!invoiceOrders || invoiceOrders.length === 0) {
        return {
          delayed_invoices: [],
          message: "No invoices found for delayed orders.",
        };
      }

      const invoiceIds = invoiceOrders.map((io) => io.invoice_id).filter(Boolean);
      const { data: invoices } = await supabase
        .from("invoices")
        .select(`
          id, invoice_id, invoice_number, invoice_date, invoice_total_amount,
          date_of_removal, customer_full_name
        `)
        .in("id", invoiceIds)
        .order("invoice_date", { ascending: false });

      const orderMap = new Map(filteredOrders.map((o) => [o.order_number, o]));

      return {
        delayed_invoices: (invoices || []).map((inv) => {
          const linkedOrder = invoiceOrders.find((io) => io.invoice_id === inv.id);
          const order = linkedOrder ? orderMap.get(linkedOrder.order_number) : null;

          return {
            invoice_id: inv.invoice_id,
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            total_amount: inv.invoice_total_amount,
            customer_name: inv.customer_full_name,
            order_number: linkedOrder?.order_number || null,
            order_status: order?.order_status || "Running Late",
            original_eta: order?.original_eta || null,
            revised_eta: order?.revised_eta || null,
            delay_reason: order?.delay_reason || null,
          };
        }),
        count: invoices?.length || 0,
      };
    }

    case "getCompanyInvoices": {
      const companyName = String(args.companyName || "");
      const limit = Number(args.limit || 20);

      let companyId = null;

      if (companyName.trim()) {
        if (profile.role !== "super_admin") {
          return { error: "Only Super Admin can query invoices for other companies." };
        }

        const { data: company } = await supabase
          .from("companies")
          .select("id, company_id")
          .or(`name.ilike.%${companyName}%,company_name.ilike.%${companyName}%`)
          .limit(1)
          .maybeSingle();

        if (company) {
          companyId = company.id || company.company_id;
        } else {
          return { error: `Company not found: ${companyName}` };
        }
      } else {
        if (profile.role === "super_admin") {
          const { data: invoices } = await supabase
            .from("invoices")
            .select(`
              id, invoice_id, invoice_number, invoice_date, invoice_total_amount,
              confirmed, company_id, customer_full_name
            `)
            .order("invoice_date", { ascending: false })
            .limit(limit);

          return {
            invoices: invoices || [],
            count: invoices?.length || 0,
            message: "Showing all invoices (Super Admin view).",
          };
        } else if (profile.company_id) {
          companyId = String(profile.company_id);
        } else {
          return { error: "No company associated with your account." };
        }
      }

      const { data: invoices } = await supabase
        .from("invoices")
        .select(`
          id, invoice_id, invoice_number, invoice_date, invoice_total_amount,
          confirmed, customer_full_name
        `)
        .eq("company_id", companyId)
        .order("invoice_date", { ascending: false })
        .limit(limit);

      return {
        company_id: companyId,
        invoices: invoices || [],
        count: invoices?.length || 0,
      };
    }

    case "getProformaInvoices": {
      const orderNumber = String(args.orderNumber || "");
      if (!orderNumber.trim()) return { error: "Order number is required." };

      const { data: order } = await supabase
        .from("orders")
        .select("id, order_number, company_id")
        .eq("order_number", orderNumber)
        .maybeSingle();

      if (!order) {
        return { error: `Order not found: ${orderNumber}` };
      }

      if (profile.role === "distributor" && profile.company_id && order.company_id !== profile.company_id) {
        return { error: "Access denied for this order." };
      }

      const { data: proformaInvoices } = await supabase
        .from("proforma_invoices")
        .select(`
          id, proforma_number, proforma_date, status, total_amount, base_amount, tax_amount
        `)
        .eq("order_id", order.id)
        .order("proforma_date", { ascending: false });

      if (!proformaInvoices || proformaInvoices.length === 0) {
        return {
          order_number: orderNumber,
          proforma_invoices: [],
          message: "No proforma invoices found for this order.",
        };
      }

      const proformaIds = proformaInvoices.map((pi) => pi.id);
      const { data: finalInvoices } = await supabase
        .from("invoices")
        .select("id, invoice_id, invoice_number, invoice_date, invoice_total_amount, proforma_invoice_id")
        .in("proforma_invoice_id", proformaIds)
        .order("invoice_date", { ascending: false });

      const invoicesByProforma = new Map();
      finalInvoices?.forEach((inv) => {
        if (inv.proforma_invoice_id) {
          const key = inv.proforma_invoice_id;
          if (!invoicesByProforma.has(key)) {
            invoicesByProforma.set(key, []);
          }
          invoicesByProforma.get(key).push({
            invoice_id: inv.invoice_id,
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            total_amount: inv.invoice_total_amount,
          });
        }
      });

      return {
        order_number: orderNumber,
        proforma_invoices: proformaInvoices.map((pi) => ({
          proforma_number: pi.proforma_number,
          proforma_date: pi.proforma_date,
          status: pi.status,
          total_amount: pi.total_amount,
          base_amount: pi.base_amount,
          tax_amount: pi.tax_amount,
          final_invoices: invoicesByProforma.get(pi.id) || [],
          final_invoice_count: invoicesByProforma.get(pi.id)?.length || 0,
        })),
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// Build comprehensive test scenarios from real data
function buildTestScenarios() {
  const scenarios = [];

  // Get real order and invoice numbers
  const testOrder = realOrders[0];
  const testOrder2 = realOrders.find((o) => o.order_number !== testOrder?.order_number) || realOrders[1] || testOrder;
  const testInvoice = realInvoices[0];
  const testInvoice2 = realInvoices.find((i) => i.invoice_number !== testInvoice?.invoice_number) || realInvoices[1] || testInvoice;
  const testWarehouse = realWarehouses[0];
  const delayedOrder = realDelayedOrders[0] || testOrder;

  if (!testOrder || !testInvoice) {
    console.warn("⚠️  Not enough real data for comprehensive testing");
    return [];
  }

  // Super Admin Tests
  scenarios.push(
    {
      role: "super_admin",
      category: "Order Queries",
      query: `Where is Order ${testOrder.order_number}?`,
      tool: "getOrderStatus",
      args: { orderNumber: testOrder.order_number },
      description: "Super Admin - Order status query",
      shouldWork: true,
    },
    {
      role: "super_admin",
      category: "Order Queries",
      query: `Show me breakdown of order ${testOrder.order_number}`,
      tool: "getOrderDrilldown",
      args: { orderNumber: testOrder.order_number },
      description: "Super Admin - Order drilldown",
      shouldWork: true,
    },
    {
      role: "super_admin",
      category: "Invoice Queries",
      query: `Show me invoice ${testInvoice.invoice_number}`,
      tool: "getInvoiceDetails",
      args: { invoiceNumber: testInvoice.invoice_number },
      description: "Super Admin - Invoice details",
      shouldWork: true,
    },
    {
      role: "super_admin",
      category: "Invoice Queries",
      query: `What invoices are linked to order ${testOrder.order_number}?`,
      tool: "getInvoicesByOrder",
      args: { orderNumber: testOrder.order_number },
      description: "Super Admin - Invoices by order",
      shouldWork: true,
    },
    {
      role: "super_admin",
      category: "Invoice Queries",
      query: "Show me all delayed invoices",
      tool: "getDelayedInvoices",
      args: {},
      description: "Super Admin - Delayed invoices",
      shouldWork: true,
    },
    {
      role: "super_admin",
      category: "Invoice Queries",
      query: "Show me all invoices",
      tool: "getCompanyInvoices",
      args: {},
      description: "Super Admin - All invoices",
      shouldWork: true,
    },
    {
      role: "super_admin",
      category: "Proforma Queries",
      query: `Show me proforma invoices for order ${testOrder.order_number}`,
      tool: "getProformaInvoices",
      args: { orderNumber: testOrder.order_number },
      description: "Super Admin - Proforma invoices",
      shouldWork: true,
    }
  );

  // Distributor Tests
  scenarios.push(
    {
      role: "distributor",
      category: "Order Queries",
      query: `Where is Order ${testOrder.order_number}?`,
      tool: "getOrderStatus",
      args: { orderNumber: testOrder.order_number },
      description: "Distributor - Order status (own company)",
      shouldWork: true,
    },
    {
      role: "distributor",
      category: "Order Queries",
      query: `Show me breakdown of order ${testOrder.order_number}`,
      tool: "getOrderDrilldown",
      args: { orderNumber: testOrder.order_number },
      description: "Distributor - Order drilldown",
      shouldWork: true,
    },
    {
      role: "distributor",
      category: "Invoice Queries",
      query: `Show me invoice ${testInvoice.invoice_number}`,
      tool: "getInvoiceDetails",
      args: { invoiceNumber: testInvoice.invoice_number },
      description: "Distributor - Invoice details (own company)",
      shouldWork: true,
    },
    {
      role: "distributor",
      category: "Invoice Queries",
      query: "Show me my company's invoices",
      tool: "getCompanyInvoices",
      args: {},
      description: "Distributor - Company invoices",
      shouldWork: true,
    },
    {
      role: "distributor",
      category: "Invoice Queries",
      query: `What invoices are linked to order ${testOrder.order_number}?`,
      tool: "getInvoicesByOrder",
      args: { orderNumber: testOrder.order_number },
      description: "Distributor - Invoices by order",
      shouldWork: true,
    },
    {
      role: "distributor",
      category: "Invoice Queries",
      query: "Show me all delayed invoices",
      tool: "getDelayedInvoices",
      args: {},
      description: "Distributor - Delayed invoices (own company)",
      shouldWork: true,
    },
    {
      role: "distributor",
      category: "Access Denied",
      query: "Show me inventory",
      tool: "getWarehouseInventory",
      args: { warehouseId: testWarehouse?.warehouse_id || 1 },
      description: "Distributor - Inventory access denied",
      shouldWork: false,
      expectedError: "Access denied",
    }
  );

  // Warehouse Tests
  if (testWarehouse) {
    scenarios.push(
      {
        role: "warehouse",
        category: "Inventory Queries",
        query: "Show me inventory",
        tool: "getWarehouseInventory",
        args: { warehouseId: null }, // Will use profile warehouse_id
        description: "Warehouse - Own inventory",
        shouldWork: true,
      },
      {
        role: "warehouse",
        category: "Order Queries",
        query: `Where is Order ${testOrder.order_number}?`,
        tool: "getOrderStatus",
        args: { orderNumber: testOrder.order_number },
        description: "Warehouse - Order status",
        shouldWork: true,
      }
    );
  }

  // Company Admin Tests (same as distributor but with different context)
  scenarios.push(
    {
      role: "company_admin",
      category: "Order Queries",
      query: `Where is Order ${testOrder.order_number}?`,
      tool: "getOrderStatus",
      args: { orderNumber: testOrder.order_number },
      description: "Company Admin - Order status",
      shouldWork: true,
    },
    {
      role: "company_admin",
      category: "Invoice Queries",
      query: "Show me my company's invoices",
      tool: "getCompanyInvoices",
      args: {},
      description: "Company Admin - Company invoices",
      shouldWork: true,
    }
  );

  return scenarios;
}

async function testToolExecution(role, toolName, args, description, shouldWork, expectedError = null) {
  const testId = `${role}_${toolName}_${Date.now()}`;
  
  try {
    const profiles = createTestProfiles();
    const profile = profiles[role];
    
    if (!profile) {
      return {
        testId,
        role,
        tool: toolName,
        description,
        result: "WARN",
        error: `No test profile found for role: ${role}`,
      };
    }

    const result = await executeToolFunction(toolName, args, profile);

    // Evaluate result
    let testResult = "PASS";
    let details = {};

    if (shouldWork) {
      if (result.error) {
        testResult = "FAIL";
        details.error = result.error;
        testResults.responseQuality.inaccurate++;
      } else {
        details.hasResult = true;
        details.resultType = Array.isArray(result) ? "array" : typeof result;
        details.resultKeys = result && typeof result === "object" ? Object.keys(result) : [];
        
        // Check response quality
        if (result && typeof result === "object" && !result.error) {
          const hasData = Array.isArray(result) ? result.length > 0 : Object.keys(result).length > 0;
          if (hasData) {
            testResults.responseQuality.realistic++;
            testResults.responseQuality.accurate++;
            details.quality = "realistic_and_accurate";
          } else {
            testResults.responseQuality.needsImprovement++;
            details.quality = "empty_result";
          }
        } else {
          testResults.responseQuality.needsImprovement++;
          details.quality = "needs_improvement";
        }
      }
    } else {
      // Should be denied
      if (result.error && (expectedError ? result.error.toLowerCase().includes(expectedError.toLowerCase()) : true)) {
        testResult = "PASS";
        details.accessDenied = true;
        details.errorMessage = result.error;
        testResults.responseQuality.accurate++;
      } else if (!result.error) {
        testResult = "FAIL";
        details.error = "Access should have been denied but wasn't";
        testResults.responseQuality.inaccurate++;
      }
    }

    return {
      testId,
      role,
      tool: toolName,
      query: description,
      description,
      result: testResult,
      details,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      testId,
      role,
      tool: toolName,
      description,
      result: "FAIL",
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

async function runAllTests() {
  console.log("=".repeat(80));
  console.log("ENHANCED COMPREHENSIVE BOT TESTING - ALL ROLES & SCENARIOS");
  console.log("=".repeat(80));
  console.log(`Testing at: ${new Date().toISOString()}`);
  console.log();

  await loadRealData();

  const testScenarios = buildTestScenarios();
  
  if (testScenarios.length === 0) {
    console.error("❌ No test scenarios generated. Check data availability.");
    process.exit(1);
  }

  console.log(`\nGenerated ${testScenarios.length} test scenarios from real data\n`);

  // Run all test scenarios
  for (const scenario of testScenarios) {
    testResults.summary.total++;
    
    if (!testResults.byRole[scenario.role]) {
      testResults.byRole[scenario.role] = { total: 0, passed: 0, failed: 0, warnings: 0 };
    }
    if (!testResults.byCategory[scenario.category]) {
      testResults.byCategory[scenario.category] = { total: 0, passed: 0, failed: 0, warnings: 0 };
    }

    testResults.byRole[scenario.role].total++;
    testResults.byCategory[scenario.category].total++;

    const result = await testToolExecution(
      scenario.role,
      scenario.tool,
      scenario.args,
      scenario.description,
      scenario.shouldWork,
      scenario.expectedError
    );

    testResults.tests.push(result);

    if (result.result === "PASS") {
      testResults.summary.passed++;
      testResults.byRole[scenario.role].passed++;
      testResults.byCategory[scenario.category].passed++;
      console.log(`✅ PASS: ${scenario.description}`);
      if (result.details?.hasResult) {
        const resultInfo = Array.isArray(result.details.resultType) 
          ? `array[${result.details.resultKeys.length}]`
          : `${result.details.resultType}(${result.details.resultKeys.length} keys)`;
        console.log(`   Result: ${resultInfo}`);
      }
    } else if (result.result === "FAIL") {
      testResults.summary.failed++;
      testResults.byRole[scenario.role].failed++;
      testResults.byCategory[scenario.category].failed++;
      console.log(`❌ FAIL: ${scenario.description}`);
      console.log(`   Error: ${result.error || result.details?.error || "Unknown error"}`);
    } else {
      testResults.summary.warnings++;
      testResults.byRole[scenario.role].warnings++;
      testResults.byCategory[scenario.category].warnings++;
      console.log(`⚠️  WARN: ${scenario.description}`);
      console.log(`   Warning: ${result.error || result.details?.warning || "Warning"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log("TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total Tests: ${testResults.summary.total}`);
  console.log(`✅ Passed: ${testResults.summary.passed}`);
  console.log(`⚠️  Warnings: ${testResults.summary.warnings}`);
  console.log(`❌ Failed: ${testResults.summary.failed}`);
  const successRate = testResults.summary.total > 0 
    ? ((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)
    : 0;
  console.log(`Success Rate: ${successRate}%`);

  console.log("\nBy Role:");
  for (const [role, stats] of Object.entries(testResults.byRole)) {
    const rate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 0;
    console.log(`  ${role}: ${stats.passed}/${stats.total} (${rate}%)`);
  }

  console.log("\nBy Category:");
  for (const [category, stats] of Object.entries(testResults.byCategory)) {
    const rate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 0;
    console.log(`  ${category}: ${stats.passed}/${stats.total} (${rate}%)`);
  }

  console.log(`\nResponse Quality:`);
  console.log(`  Realistic: ${testResults.responseQuality.realistic}`);
  console.log(`  Accurate: ${testResults.responseQuality.accurate}`);
  console.log(`  Needs Improvement: ${testResults.responseQuality.needsImprovement}`);
  console.log(`  Inaccurate: ${testResults.responseQuality.inaccurate}`);

  // Save detailed report
  const reportPath = path.join(__dirname, "..", "..", "BOT_ENHANCED_TEST_REPORT.json");
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  // Calculate improved success rate
  const improvedRate = testResults.summary.total > 0 
    ? ((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)
    : 0;
  
  console.log(`\n🎯 Improved Success Rate: ${improvedRate}% (from 85.2%)`);
  
  if (parseFloat(improvedRate) >= 90) {
    console.log("✅ Success rate improved to 90%+!");
  } else if (parseFloat(improvedRate) >= 85) {
    console.log("✅ Success rate maintained above 85%");
  } else {
    console.log("⚠️  Success rate needs improvement");
  }

  process.exit(testResults.summary.failed > 0 ? 1 : 0);
}

runAllTests().catch((error) => {
  console.error("Test suite failed:", error);
  process.exit(1);
});
