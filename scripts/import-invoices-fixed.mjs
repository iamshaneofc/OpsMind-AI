import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// CSV column mapping (based on the SQL query output)
const CSV_COLUMNS = [
  "Invoice_ID", "Invoice_Number", "Invoice_Date", "Prompt_1", "Prompt_2", "Prompt_3", "Prompt_4", "Prompt_5",
  "Invoice_Base_Amount", "Invoice_Discount_Amount", "Invoice_Excise_Amount", "Invoice_Tax_Amount", "Invoice_Item_Amount",
  "Invoice_Total_Amount", "Invoice_Confirmed", "Transport_Name", "Vehicle_Number", "Date_Of_Removal",
  "Order_ID", "Order_Number", "Order_Date", "Customer_PO_Number", "Customer_PO_Date", "Order_Total_Amount", "Payment_Terms",
  "Order_Body_ID", "Order_Quantity", "Net_Order_Quantity", "Order_Price", "Order_Net_Price", "Order_Discount_Percentage",
  "Order_Item_Total_Amount", "Order_Product_Printing_Name", "Order_Remarks",
  "Invoice_Body_ID", "Invoice_Quantity", "Invoice_Line_Base_Amount", "Invoice_Line_Discount_Amount", "Invoice_Line_Excise_Amount",
  "Invoice_Line_Tax_Amount", "Invoice_Line_Item_Amount", "Invoice_SGST_Percent", "Invoice_CGST_Percent", "Invoice_IGST_Percent",
  "Invoice_SGST_Amount", "Invoice_CGST_Amount", "Invoice_IGST_Amount",
  "Product_ID", "Product_Catalogue_Number", "Product_Description", "Product_CAS_Number", "Packing_ID", "Pack_Quantity",
  "Product_Catalogue_Price", "Product_MRP",
  "Company_ID", "Company_Name", "Company_Prefix", "Company_Address", "Company_Telephone", "Company_Fax", "Company_Email",
  "Company_Authorised_Signatory", "Company_Designation", "Company_VAT_TIN", "Company_CST_TIN", "Company_PANGIR",
  "Account_ID", "Customer_Full_Name", "Customer_Short_Name", "Customer_Address", "Customer_City", "Customer_State_ID",
  "Customer_Pincode", "Customer_Telephone", "Customer_Email", "Customer_VAT_TIN", "Customer_CST_TIN", "Customer_GST_Number",
  "Customer_Contact_Person",
];

function parseValue(value, type = "text") {
  if (!value || value === "NULL" || value === "" || value === "." || (typeof value === "string" && value.trim() === "")) {
    return null;
  }
  
  if (typeof value === "string") {
    value = value.trim();
    if (value === "" || value === "NULL" || value === ".") return null;
  }
  
  switch (type) {
    case "integer":
      const intVal = parseInt(value, 10);
      return isNaN(intVal) ? null : intVal;
    case "decimal":
    case "numeric":
      const numVal = parseFloat(value);
      return isNaN(numVal) ? null : numVal;
    case "boolean":
      return value === "1" || value === "true" || value === "True" || value === true;
    case "date":
      if (!value) return null;
      try {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date.toISOString();
      } catch {
        return null;
      }
    default:
      return value;
  }
}

function normalizeName(name) {
  if (!name || typeof name !== "string") return null;
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Cache for schema detection
let schemaCache = {
  companies: { idColumn: null, nameColumn: null, codeColumn: null },
  products: { idColumn: null, nameColumn: null },
  customers: { idColumn: null, accountIdColumn: null },
};

async function detectSchema() {
  // Companies schema - use standard columns from init_schema
  schemaCache.companies.idColumn = "id";
  schemaCache.companies.nameColumn = "name";
  
  // Check if code column exists
  try {
    const { data: testCompany } = await admin
      .from("companies")
      .select("id, name, code")
      .limit(1)
      .maybeSingle();
    
    if (testCompany && testCompany.code !== undefined) {
      schemaCache.companies.codeColumn = "code";
    } else {
      schemaCache.companies.codeColumn = null; // Column might not exist
    }
  } catch (e) {
    schemaCache.companies.codeColumn = null;
  }
  
  // Products schema - use standard columns from init_schema
  schemaCache.products.idColumn = "id";
  schemaCache.products.nameColumn = "name"; // Always use 'name' as per init_schema
  
  // Customers schema - use standard columns
  schemaCache.customers.idColumn = "id";
  schemaCache.customers.accountIdColumn = "account_id";
}

async function ensureCompany(companyName, companyData) {
  if (!companyName || companyName === "NULL" || companyName.trim() === "") return null;
  
  const cleanName = companyName.trim();
  // Skip if it looks like a number or invalid name
  if (/^\d+\.?\d*$/.test(cleanName) || cleanName.length < 2 || (cleanName.includes("-") && /^\d+-\d+-\d+$/.test(cleanName))) {
    return null;
  }
  
  if (!schemaCache.companies.idColumn) {
    await detectSchema();
  }
  
  // Get all companies to detect schema and find match
  const { data: allCompanies } = await admin
    .from("companies")
    .select("*");
  
  if (!allCompanies || allCompanies.length === 0) {
    // No companies exist, detect schema from table structure
    // Try to insert with both possible schemas
  }
  
  // Detect column names from first company if exists
  let idColumn = "id";
  let nameColumn = "name";
  
  if (allCompanies && allCompanies.length > 0) {
    const first = allCompanies[0];
    if (first.company_id !== undefined) idColumn = "company_id";
    if (first.company_name !== undefined) nameColumn = "company_name";
  }
  
  // Find existing company by name (case-insensitive)
  if (allCompanies) {
    const match = allCompanies.find(c => {
      const name = c[nameColumn] || c.company_name || c.name;
      return name && name.toLowerCase().trim() === cleanName.toLowerCase().trim();
    });
    if (match) {
      return match[idColumn] || match.company_id || match.id;
    }
  }
  
  // Create new company - try both schema patterns
  let companyPayload = {};
  
  // Use detected column name
  companyPayload[nameColumn] = cleanName;
  
  // Try to add code/prefix if column exists
  if (allCompanies && allCompanies.length > 0) {
    const first = allCompanies[0];
    if ((first.code !== undefined || first.company_code !== undefined) && companyData?.Company_Prefix) {
      const codeColumn = first.code !== undefined ? "code" : "company_code";
      const prefix = parseValue(companyData.Company_Prefix);
      if (prefix && prefix !== "." && prefix !== "NULL") {
        companyPayload[codeColumn] = prefix;
      }
    }
  }
  
  const { data: newCompany, error } = await admin
    .from("companies")
    .insert(companyPayload)
    .select("*")
    .single();
  
  if (error) {
    // Check if it's a unique constraint violation (company already exists)
    if (error.code === "23505" || error.message.includes("duplicate") || error.message.includes("unique")) {
      // Try to find it again by getting all companies
      const { data: found } = await admin.from("companies").select("*");
      if (found) {
        const match = found.find(c => {
          const name = c[nameColumn] || c.company_name || c.name;
          return name && name.toLowerCase().trim() === cleanName.toLowerCase().trim();
        });
        if (match) return match[idColumn] || match.company_id || match.id;
      }
    }
    console.error(`Error creating company "${cleanName}":`, error.message);
    return null;
  }
  
  if (newCompany) {
    return newCompany[idColumn] || newCompany.company_id || newCompany.id;
  }
  
  return null;
}

async function ensureCustomer(customerData) {
  const accountId = parseValue(customerData?.Account_ID, "integer");
  if (!accountId) return null;
  
  if (!schemaCache.customers.idColumn) {
    await detectSchema();
  }
  
  // Try to find existing customer by account_id
  const { data: existing } = await admin
    .from("customers")
    .select("id")
    .eq("account_id", accountId)
    .maybeSingle();
  
  if (existing) return existing.id;
  
  // Get company_id if company exists
  let companyId = null;
  const companyName = parseValue(customerData?.Company_Name);
  if (companyName) {
    companyId = await ensureCompany(companyName, customerData);
  }
  
  // Create new customer
  const customerPayload = {
    account_id: accountId,
    full_name: parseValue(customerData?.Customer_Full_Name) || "Unknown Customer",
    short_name: parseValue(customerData?.Customer_Short_Name),
    address: parseValue(customerData?.Customer_Address),
    city: parseValue(customerData?.Customer_City),
    state_id: parseValue(customerData?.Customer_State_ID, "integer"),
    pincode: parseValue(customerData?.Customer_Pincode),
    telephone: parseValue(customerData?.Customer_Telephone),
    email: parseValue(customerData?.Customer_Email),
    vat_tin: parseValue(customerData?.Customer_VAT_TIN),
    cst_tin: parseValue(customerData?.Customer_CST_TIN),
    gst_number: parseValue(customerData?.Customer_GST_Number),
    contact_person: parseValue(customerData?.Customer_Contact_Person),
  };
  
  if (companyId) {
    customerPayload.company_id = companyId;
  }
  
  const { data: newCustomer, error } = await admin
    .from("customers")
    .insert(customerPayload)
    .select("id")
    .single();
  
  if (error) {
    console.error(`Error creating customer ${accountId}:`, error.message);
    return null;
  }
  
  return newCustomer.id;
}

async function ensureProduct(productData) {
  const catalogueNo = productData?.Product_Catalogue_Number;
  if (!catalogueNo || catalogueNo === "NULL" || catalogueNo.trim() === "") return null;
  
  const cleanSku = catalogueNo.trim();
  // Skip if it looks like a number, decimal, or invalid
  if (/^\d+\.?\d*$/.test(cleanSku) || cleanSku === ".00" || cleanSku.length < 2) {
    return null;
  }
  
  if (!schemaCache.products.idColumn) {
    await detectSchema();
  }
  
  // Try to find existing product by catalogue_number or sku
  let existing = null;
  
  // First try by catalogue_number (if column exists)
  try {
    const { data: byCatalogue } = await admin
      .from("products")
      .select("id")
      .eq("catalogue_number", cleanSku)
      .maybeSingle();
    if (byCatalogue) {
      existing = byCatalogue;
    }
  } catch (e) {
    // catalogue_number column might not exist, try sku
  }
  
  // If not found, try by sku
  if (!existing) {
    const { data: bySku } = await admin
      .from("products")
      .select("id")
      .eq("sku", cleanSku)
      .maybeSingle();
    existing = bySku;
  }
  
  if (existing) return existing.id;
  
  // Create new product - only use columns that exist
  const productPayload = {
    name: parseValue(productData?.Product_Description) || cleanSku, // Always use 'name' as it exists in init schema
    sku: cleanSku,
    unit: "unit",
  };
  
  // Add optional columns if they exist
  const optionalFields = {
    catalogue_number: cleanSku,
    description: parseValue(productData?.Product_Description),
    cas_number: parseValue(productData?.Product_CAS_Number),
    packing_id: parseValue(productData?.Packing_ID, "integer"),
    pack_quantity: parseValue(productData?.Pack_Quantity, "numeric"),
    catalogue_price: parseValue(productData?.Product_Catalogue_Price, "numeric"),
    mrp: parseValue(productData?.Product_MRP, "numeric"),
  };
  
  // Only add fields that have values
  for (const [key, value] of Object.entries(optionalFields)) {
    if (value !== null && value !== undefined) {
      productPayload[key] = value;
    }
  }
  
  const { data: newProduct, error } = await admin
    .from("products")
    .insert(productPayload)
    .select("id")
    .single();
  
  if (error) {
    // Don't log schema cache errors
    if (!error.message.includes("schema cache")) {
      console.error(`Error creating product ${cleanSku}:`, error.message);
    }
    return null;
  }
  
  return newProduct.id;
}

async function importInvoices(csvPath) {
  console.log(`Reading CSV file: ${csvPath}`);
  
  // Detect schema first
  console.log("Detecting database schema...");
  await detectSchema();
  console.log(`Schema detected:`);
  console.log(`  Companies: ${schemaCache.companies.idColumn}/${schemaCache.companies.nameColumn}`);
  console.log(`  Products: ${schemaCache.products.idColumn}/${schemaCache.products.nameColumn}`);
  console.log(`  Customers: ${schemaCache.customers.idColumn}/${schemaCache.customers.accountIdColumn}`);
  
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  
  // Check if first line looks like headers
  const firstLine = csvContent.split('\n')[0];
  const hasHeaders = firstLine.includes('Invoice_ID') || firstLine.includes('Invoice_Number');
  
  const parseOptions = {
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
    columns: hasHeaders ? true : CSV_COLUMNS,
  };
  
  let records;
  try {
    records = parse(csvContent, parseOptions);
  } catch (parseError) {
    console.error("CSV parsing error:", parseError);
    parseOptions.relax_quotes = true;
    parseOptions.escape = '"';
    records = parse(csvContent, parseOptions);
  }
  
  // Filter out records that don't have a valid Invoice_ID
  records = records.filter(record => {
    const invoiceId = parseValue(record.Invoice_ID, "integer");
    return invoiceId !== null && invoiceId !== undefined;
  });
  
  console.log(`Found ${records.length} records in CSV`);
  
  // Group by invoice ID to process invoices and their items
  const invoiceMap = new Map();
  
  for (const record of records) {
    const invoiceId = parseValue(record.Invoice_ID, "integer");
    if (!invoiceId) continue;
    
    if (!invoiceMap.has(invoiceId)) {
      invoiceMap.set(invoiceId, {
        invoice: null,
        items: [],
        orders: new Map(), // Use Map to avoid duplicates
      });
    }
    
    const invoiceData = invoiceMap.get(invoiceId);
    
    // Collect invoice header data (use first record for header)
    if (!invoiceData.invoice) {
      invoiceData.invoice = {
        invoice_id: invoiceId,
        invoice_number: parseValue(record.Invoice_Number) || `INV-${invoiceId}`,
        invoice_date: parseValue(record.Invoice_Date, "date") || new Date().toISOString(),
        prompt_1: parseValue(record.Prompt_1),
        prompt_2: parseValue(record.Prompt_2),
        prompt_3: parseValue(record.Prompt_3),
        prompt_4: parseValue(record.Prompt_4),
        prompt_5: parseValue(record.Prompt_5),
        base_amount: parseValue(record.Invoice_Base_Amount, "numeric") ?? 0,
        discount_amount: parseValue(record.Invoice_Discount_Amount, "numeric") ?? 0,
        excise_amount: parseValue(record.Invoice_Excise_Amount, "numeric") ?? 0,
        tax_amount: parseValue(record.Invoice_Tax_Amount, "numeric") ?? 0,
        item_amount: parseValue(record.Invoice_Item_Amount, "numeric") ?? 0,
        invoice_total_amount: parseValue(record.Invoice_Total_Amount, "numeric") ?? 0,
        confirmed: parseValue(record.Invoice_Confirmed, "boolean") ?? false,
        transport_name: parseValue(record.Transport_Name),
        vehicle_number: parseValue(record.Vehicle_Number),
        date_of_removal: parseValue(record.Date_Of_Removal, "date"),
        account_id: parseValue(record.Account_ID, "integer"),
        customer_data: record,
        company_data: record,
      };
    }
    
    // Collect order data (use order_id as key to avoid duplicates)
    const orderId = parseValue(record.Order_ID, "integer");
    if (orderId && !invoiceData.orders.has(orderId)) {
      invoiceData.orders.set(orderId, {
        order_id: orderId,
        order_number: parseValue(record.Order_Number),
        order_date: parseValue(record.Order_Date, "date"),
        customer_po_number: parseValue(record.Customer_PO_Number),
        customer_po_date: parseValue(record.Customer_PO_Date, "date"),
        order_total_amount: parseValue(record.Order_Total_Amount, "numeric") ?? 0,
        payment_terms: parseValue(record.Payment_Terms),
      });
    }
    
      // Collect invoice item data (use invoice_body_id as key to avoid duplicates)
      const invoiceBodyId = parseValue(record.Invoice_Body_ID, "integer");
      if (invoiceBodyId) {
        // Check if this item already exists (same invoice_body_id)
        const existingItem = invoiceData.items.find(item => item.invoice_body_id === invoiceBodyId);
        if (!existingItem) {
          // Parse invoice_quantity carefully - ensure it's not getting invoice_body_id value
          let invoiceQty = parseValue(record.Invoice_Quantity, "numeric");
          // Validate: if invoice_quantity equals invoice_body_id, it's wrong - use order_quantity instead
          if (invoiceQty === invoiceBodyId) {
            console.warn(`Warning: Invoice ${invoiceId} item ${invoiceBodyId} - invoice_quantity matches invoice_body_id, using order_quantity instead`);
            invoiceQty = parseValue(record.Order_Quantity, "numeric") ?? 0;
          }
          
          invoiceData.items.push({
            invoice_body_id: invoiceBodyId,
            order_body_id: parseValue(record.Order_Body_ID, "integer"),
            invoice_quantity: invoiceQty ?? 0, // FIXED: Use numeric, not integer
          order_quantity: parseValue(record.Order_Quantity, "integer"),
          net_order_quantity: parseValue(record.Net_Order_Quantity, "integer"),
          order_price: parseValue(record.Order_Price, "numeric"),
          order_net_price: parseValue(record.Order_Net_Price, "numeric"),
          order_discount_percentage: parseValue(record.Order_Discount_Percentage, "numeric"),
          order_item_total_amount: parseValue(record.Order_Item_Total_Amount, "numeric"),
          invoice_line_base_amount: parseValue(record.Invoice_Line_Base_Amount, "numeric") ?? 0,
          invoice_line_discount_amount: parseValue(record.Invoice_Line_Discount_Amount, "numeric") ?? 0,
          invoice_line_excise_amount: parseValue(record.Invoice_Line_Excise_Amount, "numeric") ?? 0,
          invoice_line_tax_amount: parseValue(record.Invoice_Line_Tax_Amount, "numeric") ?? 0,
          invoice_line_item_amount: parseValue(record.Invoice_Line_Item_Amount, "numeric") ?? 0,
          sgst_percent: parseValue(record.Invoice_SGST_Percent, "numeric"),
          cgst_percent: parseValue(record.Invoice_CGST_Percent, "numeric"),
          igst_percent: parseValue(record.Invoice_IGST_Percent, "numeric"),
          sgst_amount: parseValue(record.Invoice_SGST_Amount, "numeric"),
          cgst_amount: parseValue(record.Invoice_CGST_Amount, "numeric"),
          igst_amount: parseValue(record.Invoice_IGST_Amount, "numeric"),
          order_product_printing_name: parseValue(record.Order_Product_Printing_Name),
          order_remarks: parseValue(record.Order_Remarks),
          product_data: record,
        });
      }
    }
  }
  
  console.log(`Processing ${invoiceMap.size} unique invoices...`);
  
  let imported = 0;
  let errors = 0;
  let customersCreated = 0;
  let companiesCreated = 0;
  let productsCreated = 0;
  
  for (const [invoiceId, data] of invoiceMap.entries()) {
    try {
      // Ensure customer exists FIRST
      const customerId = await ensureCustomer(data.invoice.customer_data);
      if (customerId) customersCreated++;
      
      // Ensure company exists
      const companyName = data.invoice.company_data?.Company_Name || data.invoice.company_name;
      const companyIdBefore = await admin
        .from("companies")
        .select("*")
        .limit(100)
        .then(r => {
          const match = r.data?.find(c => {
            const name = c.company_name || c.name;
            return name && name.toLowerCase().trim() === companyName?.toLowerCase().trim();
          });
          return match ? (match.id || match.company_id) : null;
        });
      
      const companyId = await ensureCompany(companyName, data.invoice.company_data);
      
      // Count as created if it didn't exist before
      if (companyId && !companyIdBefore) {
        companiesCreated++;
      }
      
      // If companyId is an integer (not UUID), set to null for invoices table
      // since invoices.company_id expects UUID but companies use integer company_id
      let invoiceCompanyId = companyId;
      if (companyId && typeof companyId === 'number') {
        invoiceCompanyId = null; // Can't link integer to UUID foreign key
      }
      
      // Insert invoice
      const invoicePayload = {
        invoice_id: data.invoice.invoice_id,
        invoice_number: data.invoice.invoice_number,
        invoice_date: data.invoice.invoice_date,
        prompt_1: data.invoice.prompt_1,
        prompt_2: data.invoice.prompt_2,
        prompt_3: data.invoice.prompt_3,
        prompt_4: data.invoice.prompt_4,
        prompt_5: data.invoice.prompt_5,
        base_amount: data.invoice.base_amount,
        discount_amount: data.invoice.discount_amount,
        excise_amount: data.invoice.excise_amount,
        tax_amount: data.invoice.tax_amount,
        item_amount: data.invoice.item_amount,
        invoice_total_amount: data.invoice.invoice_total_amount,
        confirmed: data.invoice.confirmed,
        transport_name: data.invoice.transport_name,
        vehicle_number: data.invoice.vehicle_number,
        date_of_removal: data.invoice.date_of_removal,
        company_id: invoiceCompanyId, // Use null if companyId is integer (can't link to UUID FK)
        customer_id: customerId, // FIXED: Add customer_id
        account_id: data.invoice.account_id,
        // Keep denormalized customer data for quick access
        customer_full_name: parseValue(data.invoice.customer_data?.Customer_Full_Name),
        customer_short_name: parseValue(data.invoice.customer_data?.Customer_Short_Name),
        customer_address: parseValue(data.invoice.customer_data?.Customer_Address),
        customer_city: parseValue(data.invoice.customer_data?.Customer_City),
        customer_pincode: parseValue(data.invoice.customer_data?.Customer_Pincode),
        customer_telephone: parseValue(data.invoice.customer_data?.Customer_Telephone),
        customer_email: parseValue(data.invoice.customer_data?.Customer_Email),
        customer_vat_tin: parseValue(data.invoice.customer_data?.Customer_VAT_TIN),
        customer_cst_tin: parseValue(data.invoice.customer_data?.Customer_CST_TIN),
        customer_gst_number: parseValue(data.invoice.customer_data?.Customer_GST_Number),
        customer_contact_person: parseValue(data.invoice.customer_data?.Customer_Contact_Person),
      };
      
      const { data: invoice, error: invoiceError } = await admin
        .from("invoices")
        .upsert(invoicePayload, {
          onConflict: "invoice_id",
          ignoreDuplicates: false,
        })
        .select("id, invoice_id")
        .single();
      
      if (invoiceError) {
        console.error(`Error inserting invoice ${invoiceId}:`, invoiceError.message);
        errors++;
        continue;
      }
      
      // Insert invoice orders (use insert, not upsert - no unique constraint)
      if (data.orders.size > 0) {
        const orderPayloads = Array.from(data.orders.values()).map((order) => ({
          invoice_id: invoice.id,
          order_number: order.order_number,
          order_date: order.order_date,
          customer_po_number: order.customer_po_number,
          customer_po_date: order.customer_po_date,
          order_total_amount: order.order_total_amount,
          payment_terms: order.payment_terms,
        }));
        
        // Check for existing orders first to avoid duplicates
        for (const orderPayload of orderPayloads) {
          const { data: existing } = await admin
            .from("invoice_orders")
            .select("id")
            .eq("invoice_id", orderPayload.invoice_id)
            .eq("order_number", orderPayload.order_number)
            .maybeSingle();
          
          if (!existing) {
            const { error: orderError } = await admin.from("invoice_orders").insert(orderPayload);
            if (orderError) {
              console.error(`Error inserting order ${orderPayload.order_number} for invoice ${invoiceId}:`, orderError.message);
            }
          }
        }
      }
      
      // Insert invoice items
      for (const item of data.items) {
        const productId = await ensureProduct(item.product_data);
        if (productId) productsCreated++;
        
        const itemPayload = {
          invoice_id: invoice.id,
          invoice_body_id: item.invoice_body_id,
          order_body_id: item.order_body_id,
          product_id: productId,
          product_catalogue_number: parseValue(item.product_data?.Product_Catalogue_Number),
          product_description: parseValue(item.product_data?.Product_Description),
          product_cas_number: parseValue(item.product_data?.Product_CAS_Number),
          packing_id: parseValue(item.product_data?.Packing_ID, "integer"),
          pack_quantity: parseValue(item.product_data?.Pack_Quantity, "numeric"),
          product_catalogue_price: parseValue(item.product_data?.Product_Catalogue_Price, "numeric"),
          product_mrp: parseValue(item.product_data?.Product_MRP, "numeric"),
          invoice_quantity: Math.round(item.invoice_quantity) || 0, // FIXED: Ensure it's an integer
          order_quantity: item.order_quantity,
          net_order_quantity: item.net_order_quantity,
          order_price: item.order_price,
          order_net_price: item.order_net_price,
          order_discount_percentage: item.order_discount_percentage,
          order_item_total_amount: item.order_item_total_amount,
          invoice_line_base_amount: item.invoice_line_base_amount,
          invoice_line_discount_amount: item.invoice_line_discount_amount,
          invoice_line_excise_amount: item.invoice_line_excise_amount,
          invoice_line_tax_amount: item.invoice_line_tax_amount,
          invoice_line_item_amount: item.invoice_line_item_amount,
          sgst_percent: item.sgst_percent,
          cgst_percent: item.cgst_percent,
          igst_percent: item.igst_percent,
          sgst_amount: item.sgst_amount,
          cgst_amount: item.cgst_amount,
          igst_amount: item.igst_amount,
          order_product_printing_name: item.order_product_printing_name,
          order_remarks: item.order_remarks,
        };
        
        // Check for existing item first to avoid duplicates
        const { data: existingItem } = await admin
          .from("invoice_items")
          .select("id")
          .eq("invoice_id", invoice.id)
          .eq("invoice_body_id", item.invoice_body_id)
          .maybeSingle();
        
        if (!existingItem) {
          const { error: itemError } = await admin.from("invoice_items").insert(itemPayload);
          if (itemError) {
            console.error(`Error inserting item ${item.invoice_body_id} for invoice ${invoiceId}:`, itemError.message);
          }
        }
      }
      
      imported++;
      if (imported % 5 === 0) {
        console.log(`Imported ${imported}/${invoiceMap.size} invoices...`);
      }
    } catch (error) {
      console.error(`Error processing invoice ${invoiceId}:`, error.message);
      errors++;
    }
  }
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Import complete!`);
  console.log(`Successfully imported: ${imported} invoices`);
  console.log(`Customers created: ${customersCreated}`);
  console.log(`Companies created: ${companiesCreated}`);
  console.log(`Products created: ${productsCreated}`);
  console.log(`Errors: ${errors}`);
  console.log(`${"=".repeat(60)}`);
}

// Main execution
const csvPath = process.argv[2] || path.join(__dirname, "..", "..", "Invoice-data.csv");

if (!fs.existsSync(csvPath)) {
  console.error(`CSV file not found: ${csvPath}`);
  console.error(`Usage: node scripts/import-invoices-fixed.mjs [path-to-csv]`);
  process.exit(1);
}

importInvoices(csvPath).catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
