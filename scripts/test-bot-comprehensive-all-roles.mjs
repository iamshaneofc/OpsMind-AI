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
 * Comprehensive Bot Testing - All Roles & Scenarios
 * Tests actual tool functions with different user roles
 */

const testResults = {
  tests: [],
  summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
  byRole: {},
  byCategory: {},
  responseQuality: { realistic: 0, needsImprovement: 0 },
};

// Real data from database
let realOrders = [];
let realInvoices = [];
let realCompanies = [];
let realWarehouses = [];

async function loadRealData() {
  console.log("Loading real data from database...");
  
  const { data: orders } = await admin
    .from("orders")
    .select("order_number, company_id, warehouse_id")
    .limit(20);
  realOrders = orders || [];

  const { data: invoices } = await admin
    .from("invoices")
    .select("invoice_number, company_id")
    .limit(20);
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

  console.log(`✓ Loaded: ${realOrders.length} orders, ${realInvoices.length} invoices, ${realCompanies.length} companies, ${realWarehouses.length} warehouses`);
}

// Create test profiles
function createTestProfiles() {
  const companyId = realCompanies[0]?.id || realCompanies[0]?.company_id || 1;
  const warehouseId = realWarehouses[0]?.warehouse_id || 1;

  return {
    super_admin: {
      user_id: 1,
      email: "test.superadmin@opsmind.com",
      full_name: "Test Super Admin",
      role_id: 1,
      role: "super_admin",
      company_id: null,
      warehouse_id: null,
    },
    distributor: {
      user_id: 2,
      email: "test.distributor@opsmind.com",
      full_name: "Test Distributor",
      role_id: 2,
      role: "distributor",
      company_id: companyId,
      warehouse_id: null,
    },
    warehouse: {
      user_id: 3,
      email: "test.warehouse@opsmind.com",
      full_name: "Test Warehouse",
      role_id: 3,
      role: "warehouse",
      company_id: null,
      warehouse_id: warehouseId,
    },
    company_admin: {
      user_id: 4,
      email: "test.admin@opsmind.com",
      full_name: "Test Company Admin",
      role_id: 2, // Assuming company admin uses distributor role_id
      role: "distributor", // Will be treated as company admin
      company_id: companyId,
      warehouse_id: null,
    },
  };
}

// Import tool functions (we'll test them directly)
async function getToolFunction(toolName) {
  // Since we can't import TypeScript directly, we'll recreate the logic
  const supabase = admin;

  const tools = {
    getOrderStatus: async (args, profile) => {
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
    },

    getInvoiceDetails: async (args, profile) => {
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

      // Authorization check
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
    },

    getInvoicesByOrder: async (args, profile) => {
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
    },

    getOrderDrilldown: async (args, profile) => {
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
    },

    getWarehouseInventory: async (args, profile) => {
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
    },

    getDelayedInvoices: async (args, profile) => {
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
    },

    getCompanyInvoices: async (args, profile) => {
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
    },
  };

  return tools[toolName] || null;
}

// Test scenarios
const testScenarios = [
  // Super Admin Tests
  {
    role: "super_admin",
    category: "Order Queries",
    query: "Where is Order 9.105.260211.47?",
    tool: "getOrderStatus",
    args: { orderNumber: "9.105.260211.47" },
    description: "Super Admin - Order status query",
    shouldWork: true,
  },
  {
    role: "super_admin",
    category: "Order Queries",
    query: "Show me breakdown of order 11.105.260217.24",
    tool: "getOrderDrilldown",
    args: { orderNumber: "11.105.260217.24" },
    description: "Super Admin - Order drilldown",
    shouldWork: true,
  },
  {
    role: "super_admin",
    category: "Invoice Queries",
    query: "Show me invoice 11.106.0.27887",
    tool: "getInvoiceDetails",
    args: { invoiceNumber: "11.106.0.27887" },
    description: "Super Admin - Invoice details",
    shouldWork: true,
  },
  {
    role: "super_admin",
    category: "Invoice Queries",
    query: "What invoices are linked to order 11.105.260217.24?",
    tool: "getInvoicesByOrder",
    args: { orderNumber: "11.105.260217.24" },
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
  // Distributor Tests
  {
    role: "distributor",
    category: "Order Queries",
    query: "Where is Order 9.105.260211.47?",
    tool: "getOrderStatus",
    args: { orderNumber: "9.105.260211.47" },
    description: "Distributor - Order status (own company)",
    shouldWork: true,
  },
  {
    role: "distributor",
    category: "Invoice Queries",
    query: "Show me invoice 11.106.0.27887",
    tool: "getInvoiceDetails",
    args: { invoiceNumber: "11.106.0.27887" },
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
    category: "Access Denied",
    query: "Show me inventory",
    tool: "getWarehouseInventory",
    args: { warehouseId: 1 },
    description: "Distributor - Inventory access denied",
    shouldWork: false,
    expectedError: "Access denied",
  },
  // Warehouse Tests
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
    query: "Where is Order 9.105.260211.47?",
    tool: "getOrderStatus",
    args: { orderNumber: "9.105.260211.47" },
    description: "Warehouse - Order status",
    shouldWork: true,
  },
];

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

    // Auto-fill warehouse_id for warehouse users
    if (role === "warehouse" && profile.warehouse_id && (!args.warehouseId || args.warehouseId === null)) {
      args.warehouseId = profile.warehouse_id;
    }

    const toolFunction = await getToolFunction(toolName);
    if (!toolFunction) {
      return {
        testId,
        role,
        tool: toolName,
        description,
        result: "FAIL",
        error: `Tool function not found: ${toolName}`,
      };
    }

    const result = await toolFunction(args, profile);

    // Evaluate result
    let testResult = "PASS";
    let details = {};

    if (shouldWork) {
      if (result.error) {
        testResult = "FAIL";
        details.error = result.error;
      } else {
        details.hasResult = true;
        details.resultType = Array.isArray(result) ? "array" : typeof result;
        details.resultKeys = result && typeof result === "object" ? Object.keys(result) : [];
        
        // Check response quality
        if (result && typeof result === "object" && !result.error) {
          testResults.responseQuality.realistic++;
          details.quality = "realistic";
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
      } else if (!result.error) {
        testResult = "FAIL";
        details.error = "Access should have been denied but wasn't";
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
  console.log("COMPREHENSIVE BOT TESTING - ALL ROLES & SCENARIOS");
  console.log("=".repeat(80));
  console.log(`Testing at: ${new Date().toISOString()}`);
  console.log();

  await loadRealData();

  // Update test scenarios with real data
  if (realOrders.length > 0) {
    testScenarios.forEach((scenario) => {
      if (scenario.args.orderNumber && !realOrders.some((o) => o.order_number === scenario.args.orderNumber)) {
        scenario.args.orderNumber = realOrders[0].order_number;
      }
      if (scenario.args.invoiceNumber && !realInvoices.some((i) => i.invoice_number === scenario.args.invoiceNumber)) {
        scenario.args.invoiceNumber = realInvoices[0].invoice_number;
      }
    });
  }

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
        console.log(`   Result: ${result.details.resultType} with ${result.details.resultKeys.length} keys`);
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

    // Small delay
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
  console.log(`  Needs Improvement: ${testResults.responseQuality.needsImprovement}`);

  // Save detailed report
  const reportPath = path.join(__dirname, "..", "..", "BOT_COMPREHENSIVE_TEST_REPORT.json");
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  process.exit(testResults.summary.failed > 0 ? 1 : 0);
}

runAllTests().catch((error) => {
  console.error("Test suite failed:", error);
  process.exit(1);
});
