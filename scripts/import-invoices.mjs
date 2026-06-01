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
  "Invoice_ID",
  "Invoice_Number",
  "Invoice_Date",
  "Prompt_1",
  "Prompt_2",
  "Prompt_3",
  "Prompt_4",
  "Prompt_5",
  "Invoice_Base_Amount",
  "Invoice_Discount_Amount",
  "Invoice_Excise_Amount",
  "Invoice_Tax_Amount",
  "Invoice_Item_Amount",
  "Invoice_Total_Amount",
  "Invoice_Confirmed",
  "Transport_Name",
  "Vehicle_Number",
  "Date_Of_Removal",
  "Order_ID",
  "Order_Number",
  "Order_Date",
  "Customer_PO_Number",
  "Customer_PO_Date",
  "Order_Total_Amount",
  "Payment_Terms",
  "Order_Body_ID",
  "Order_Quantity",
  "Net_Order_Quantity",
  "Order_Price",
  "Order_Net_Price",
  "Order_Discount_Percentage",
  "Order_Item_Total_Amount",
  "Order_Product_Printing_Name",
  "Order_Remarks",
  "Invoice_Body_ID",
  "Invoice_Quantity",
  "Invoice_Line_Base_Amount",
  "Invoice_Line_Discount_Amount",
  "Invoice_Line_Excise_Amount",
  "Invoice_Line_Tax_Amount",
  "Invoice_Line_Item_Amount",
  "Invoice_SGST_Percent",
  "Invoice_CGST_Percent",
  "Invoice_IGST_Percent",
  "Invoice_SGST_Amount",
  "Invoice_CGST_Amount",
  "Invoice_IGST_Amount",
  "Product_ID",
  "Product_Catalogue_Number",
  "Product_Description",
  "Product_CAS_Number",
  "Packing_ID",
  "Pack_Quantity",
  "Product_Catalogue_Price",
  "Product_MRP",
  "Company_ID",
  "Company_Name",
  "Company_Prefix",
  "Company_Address",
  "Company_Telephone",
  "Company_Fax",
  "Company_Email",
  "Company_Authorised_Signatory",
  "Company_Designation",
  "Company_VAT_TIN",
  "Company_CST_TIN",
  "Company_PANGIR",
  "Account_ID",
  "Customer_Full_Name",
  "Customer_Short_Name",
  "Customer_Address",
  "Customer_City",
  "Customer_State_ID",
  "Customer_Pincode",
  "Customer_Telephone",
  "Customer_Email",
  "Customer_VAT_TIN",
  "Customer_CST_TIN",
  "Customer_GST_Number",
  "Customer_Contact_Person",
];

function parseValue(value, type = "text") {
  if (!value || value === "NULL" || value === "" || value.trim() === "") {
    return null;
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
      return value === "1" || value === "true" || value === "True";
    case "date":
      if (!value) return null;
      try {
        return new Date(value).toISOString();
      } catch {
        return null;
      }
    default:
      return value.trim();
  }
}

// Cache for schema detection
let schemaCache = {
  companies: { idColumn: null, nameColumn: null, codeColumn: null },
  products: { idColumn: null, nameColumn: null },
};

async function detectSchema() {
  // Try to detect companies schema
  try {
    const { data: testCompany } = await admin
      .from("companies")
      .select("id, name, company_id, company_name, code")
      .limit(1)
      .maybeSingle();
    
    if (testCompany) {
      schemaCache.companies.idColumn = testCompany.id ? "id" : (testCompany.company_id ? "company_id" : null);
      schemaCache.companies.nameColumn = testCompany.name ? "name" : (testCompany.company_name ? "company_name" : null);
      schemaCache.companies.codeColumn = testCompany.code ? "code" : null;
    }
  } catch (e) {
    // Try alternative schema
    try {
      const { data: testCompany } = await admin
        .from("companies")
        .select("company_id, company_name")
        .limit(1)
        .maybeSingle();
      
      if (testCompany) {
        schemaCache.companies.idColumn = "company_id";
        schemaCache.companies.nameColumn = "company_name";
      }
    } catch (e2) {
      // Default to standard schema
      schemaCache.companies.idColumn = "id";
      schemaCache.companies.nameColumn = "name";
      schemaCache.companies.codeColumn = "code";
    }
  }
  
  // Try to detect products schema
  try {
    const { data: testProduct } = await admin
      .from("products")
      .select("id, name, product_id, product_name, sku")
      .limit(1)
      .maybeSingle();
    
    if (testProduct) {
      schemaCache.products.idColumn = testProduct.id ? "id" : (testProduct.product_id ? "product_id" : null);
      schemaCache.products.nameColumn = testProduct.name ? "name" : (testProduct.product_name ? "product_name" : null);
    }
  } catch (e) {
    // Try alternative schema
    try {
      const { data: testProduct } = await admin
        .from("products")
        .select("product_id, product_name, sku")
        .limit(1)
        .maybeSingle();
      
      if (testProduct) {
        schemaCache.products.idColumn = "product_id";
        schemaCache.products.nameColumn = "product_name";
      }
    } catch (e2) {
      // Default to standard schema
      schemaCache.products.idColumn = "id";
      schemaCache.products.nameColumn = "name";
    }
  }
}

async function ensureCompany(companyName, companyData) {
  if (!companyName || companyName === "NULL" || companyName.trim() === "") return null;
  
  // Clean company name - sometimes CSV parsing gives wrong values
  const cleanName = companyName.trim();
  // Skip if it looks like a number or invalid name
  if (/^\d+\.?\d*$/.test(cleanName) || cleanName.length < 2 || cleanName.includes("-") && /^\d+-\d+-\d+$/.test(cleanName)) {
    return null;
  }
  
  // Detect schema if not cached
  if (!schemaCache.companies.idColumn) {
    await detectSchema();
  }
  
  const idCol = schemaCache.companies.idColumn || "id";
  const nameCol = schemaCache.companies.nameColumn || "name";
  
  // Try to find existing company by name
  const selectCols = idCol;
  const { data: existing, error: findError } = await admin
    .from("companies")
    .select(selectCols)
    .eq(nameCol, cleanName)
    .maybeSingle();
  
  if (findError && findError.code !== 'PGRST116') {
    // Silently ignore schema errors, will try to create
  }
  
  if (existing) return existing[idCol];
  
  // Create new company - only use columns that exist
  const companyPayload = {};
  companyPayload[nameCol] = cleanName;
  
  // Only add code if it exists in schema and Company_Prefix is valid
  if (schemaCache.companies.codeColumn) {
    const prefix = companyData?.Company_Prefix;
    if (prefix && prefix !== "NULL" && prefix.trim() !== "" && prefix !== ".") {
      companyPayload[schemaCache.companies.codeColumn] = prefix.trim();
    }
  }
  
  const { data: newCompany, error } = await admin
    .from("companies")
    .insert(companyPayload)
    .select(idCol)
    .single();
  
  if (error) {
    // Don't log errors for invalid company names
    if (!error.message.includes("schema cache")) {
      console.error(`Error creating company ${cleanName}:`, error.message);
    }
    return null;
  }
  
  return newCompany[idCol];
}

async function ensureProduct(productData) {
  const catalogueNo = productData?.Product_Catalogue_Number;
  if (!catalogueNo || catalogueNo === "NULL" || catalogueNo.trim() === "") return null;
  
  // Clean catalogue number - skip if it looks invalid
  const cleanSku = catalogueNo.trim();
  // Skip if it looks like a number, decimal, or invalid
  if (/^\d+\.?\d*$/.test(cleanSku) || cleanSku === ".00" || cleanSku.length < 2) {
    return null;
  }
  
  // Detect schema if not cached
  if (!schemaCache.products.idColumn) {
    await detectSchema();
  }
  
  const idCol = schemaCache.products.idColumn || "id";
  const nameCol = schemaCache.products.nameColumn || "name";
  
  // Try to find existing product by SKU (using catalogue number)
  const { data: existing, error: findError } = await admin
    .from("products")
    .select(idCol)
    .eq("sku", cleanSku)
    .maybeSingle();
  
  if (findError && findError.code !== 'PGRST116') {
    // Silently ignore
  }
  
  if (existing) return existing[idCol];
  
  // Create new product
  const productPayload = {
    [nameCol]: productData?.Product_Description || cleanSku,
    sku: cleanSku,
    unit: "unit", // Default unit
  };
  
  const { data: newProduct, error } = await admin
    .from("products")
    .insert(productPayload)
    .select(idCol)
    .single();
  
  if (error) {
    // Don't log schema cache errors
    if (!error.message.includes("schema cache")) {
      console.error(`Error creating product ${cleanSku}:`, error.message);
    }
    return null;
  }
  
  return newProduct[idCol];
}

async function importInvoices(csvPath) {
  console.log(`Reading CSV file: ${csvPath}`);
  
  // Detect schema first
  console.log("Detecting database schema...");
  await detectSchema();
  console.log(`Schema detected - Companies: ${schemaCache.companies.idColumn}/${schemaCache.companies.nameColumn}, Products: ${schemaCache.products.idColumn}/${schemaCache.products.nameColumn}`);
  
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  
  // Check if first line looks like headers
  const firstLine = csvContent.split('\n')[0];
  const hasHeaders = firstLine.includes('Invoice_ID') || firstLine.includes('Invoice_Number');
  
  const parseOptions = {
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true, // Handle BOM if present
  };
  
  if (hasHeaders) {
    parseOptions.columns = true;
  } else {
    parseOptions.columns = CSV_COLUMNS;
  }
  
  let records;
  try {
    records = parse(csvContent, parseOptions);
  } catch (parseError) {
    console.error("CSV parsing error:", parseError);
    // Try with different options
    parseOptions.relax_quotes = true;
    parseOptions.escape = '"';
    records = parse(csvContent, parseOptions);
  }
  
  // Filter out records that don't have a valid Invoice_ID (first column)
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
        orders: new Set(),
      });
    }
    
    const invoiceData = invoiceMap.get(invoiceId);
    
    // Collect invoice header data (use first record for header)
    if (!invoiceData.invoice) {
      invoiceData.invoice = {
        invoice_id: invoiceId,
        invoice_number: parseValue(record.Invoice_Number),
        invoice_date: parseValue(record.Invoice_Date, "date") || new Date().toISOString(), // Default to now if null
        prompt_1: parseValue(record.Prompt_1),
        prompt_2: parseValue(record.Prompt_2),
        prompt_3: parseValue(record.Prompt_3),
        prompt_4: parseValue(record.Prompt_4),
        prompt_5: parseValue(record.Prompt_5),
        base_amount: parseValue(record.Invoice_Base_Amount, "numeric"),
        discount_amount: parseValue(record.Invoice_Discount_Amount, "numeric"),
        excise_amount: parseValue(record.Invoice_Excise_Amount, "numeric"),
        tax_amount: parseValue(record.Invoice_Tax_Amount, "numeric"),
        item_amount: parseValue(record.Invoice_Item_Amount, "numeric"),
        invoice_total_amount: parseValue(record.Invoice_Total_Amount, "numeric"),
        confirmed: parseValue(record.Invoice_Confirmed, "boolean"),
        transport_name: parseValue(record.Transport_Name),
        vehicle_number: parseValue(record.Vehicle_Number),
        date_of_removal: parseValue(record.Date_Of_Removal, "date"),
        account_id: parseValue(record.Account_ID, "integer"),
        customer_full_name: parseValue(record.Customer_Full_Name),
        customer_short_name: parseValue(record.Customer_Short_Name),
        customer_address: parseValue(record.Customer_Address),
        customer_city: parseValue(record.Customer_City),
        customer_pincode: parseValue(record.Customer_Pincode),
        customer_telephone: parseValue(record.Customer_Telephone),
        customer_email: parseValue(record.Customer_Email),
        customer_vat_tin: parseValue(record.Customer_VAT_TIN),
        customer_cst_tin: parseValue(record.Customer_CST_TIN),
        customer_gst_number: parseValue(record.Customer_GST_Number),
        customer_contact_person: parseValue(record.Customer_Contact_Person),
        company_name: parseValue(record.Company_Name),
        company_data: record,
      };
    }
    
    // Collect order data
    const orderId = parseValue(record.Order_ID, "integer");
    if (orderId) {
      invoiceData.orders.add({
        order_id: orderId,
        order_number: parseValue(record.Order_Number),
        order_date: parseValue(record.Order_Date, "date"),
        customer_po_number: parseValue(record.Customer_PO_Number),
        customer_po_date: parseValue(record.Customer_PO_Date, "date"),
        order_total_amount: parseValue(record.Order_Total_Amount, "numeric"),
        payment_terms: parseValue(record.Payment_Terms, "integer"),
      });
    }
    
    // Collect invoice item data
    invoiceData.items.push({
      invoice_body_id: parseValue(record.Invoice_Body_ID, "integer"),
      order_body_id: parseValue(record.Order_Body_ID, "integer"),
      invoice_quantity: parseValue(record.Invoice_Quantity, "integer"),
      order_quantity: parseValue(record.Order_Quantity, "integer"),
      net_order_quantity: parseValue(record.Net_Order_Quantity, "integer"),
      order_price: parseValue(record.Order_Price, "numeric"),
      order_net_price: parseValue(record.Order_Net_Price, "numeric"),
      order_discount_percentage: parseValue(record.Order_Discount_Percentage, "numeric"),
      order_item_total_amount: parseValue(record.Order_Item_Total_Amount, "numeric"),
      invoice_line_base_amount: parseValue(record.Invoice_Line_Base_Amount, "numeric"),
      invoice_line_discount_amount: parseValue(record.Invoice_Line_Discount_Amount, "numeric"),
      invoice_line_excise_amount: parseValue(record.Invoice_Line_Excise_Amount, "numeric"),
      invoice_line_tax_amount: parseValue(record.Invoice_Line_Tax_Amount, "numeric"),
      invoice_line_item_amount: parseValue(record.Invoice_Line_Item_Amount, "numeric"),
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
  
  console.log(`Processing ${invoiceMap.size} unique invoices...`);
  
  let imported = 0;
  let errors = 0;
  
  for (const [invoiceId, data] of invoiceMap.entries()) {
    try {
      // Ensure company exists
      const companyId = await ensureCompany(data.invoice.company_name, data.invoice.company_data);
      
      // Insert invoice (remove company_name as it's not in the table schema)
      // Ensure all required NOT NULL fields have default values
      const invoicePayload = {
        invoice_id: data.invoice.invoice_id,
        invoice_number: data.invoice.invoice_number || `INV-${invoiceId}`,
        invoice_date: data.invoice.invoice_date || new Date().toISOString(),
        prompt_1: data.invoice.prompt_1,
        prompt_2: data.invoice.prompt_2,
        prompt_3: data.invoice.prompt_3,
        prompt_4: data.invoice.prompt_4,
        prompt_5: data.invoice.prompt_5,
        base_amount: data.invoice.base_amount ?? 0,
        discount_amount: data.invoice.discount_amount ?? 0,
        excise_amount: data.invoice.excise_amount ?? 0,
        tax_amount: data.invoice.tax_amount ?? 0,
        item_amount: data.invoice.item_amount ?? 0,
        invoice_total_amount: data.invoice.invoice_total_amount ?? 0,
        confirmed: data.invoice.confirmed ?? false,
        transport_name: data.invoice.transport_name,
        vehicle_number: data.invoice.vehicle_number,
        date_of_removal: data.invoice.date_of_removal,
        company_id: companyId,
        account_id: data.invoice.account_id,
        customer_full_name: data.invoice.customer_full_name,
        customer_short_name: data.invoice.customer_short_name,
        customer_address: data.invoice.customer_address,
        customer_city: data.invoice.customer_city,
        customer_pincode: data.invoice.customer_pincode,
        customer_telephone: data.invoice.customer_telephone,
        customer_email: data.invoice.customer_email,
        customer_vat_tin: data.invoice.customer_vat_tin,
        customer_cst_tin: data.invoice.customer_cst_tin,
        customer_gst_number: data.invoice.customer_gst_number,
        customer_contact_person: data.invoice.customer_contact_person,
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
        console.error(`Error inserting invoice ${invoiceId}:`, invoiceError);
        errors++;
        continue;
      }
      
      // Insert invoice orders
      if (data.orders.size > 0) {
        const orderPayloads = Array.from(data.orders).map((order) => ({
          invoice_id: invoice.id,
          order_number: order.order_number,
          order_date: order.order_date,
          customer_po_number: order.customer_po_number,
          customer_po_date: order.customer_po_date,
          order_total_amount: order.order_total_amount,
          payment_terms: order.payment_terms,
        }));
        
        await admin.from("invoice_orders").insert(orderPayloads);
      }
      
      // Insert invoice items
      for (const item of data.items) {
        const productId = await ensureProduct(item.product_data);
        
        const itemPayload = {
          invoice_id: invoice.id,
          invoice_body_id: item.invoice_body_id,
          order_body_id: item.order_body_id,
          product_id: productId,
          product_catalogue_number: parseValue(item.product_data.Product_Catalogue_Number),
          product_description: parseValue(item.product_data.Product_Description),
          product_cas_number: parseValue(item.product_data.Product_CAS_Number),
          packing_id: parseValue(item.product_data.Packing_ID, "integer"),
          pack_quantity: parseValue(item.product_data.Pack_Quantity, "numeric"),
          product_catalogue_price: parseValue(item.product_data.Product_Catalogue_Price, "numeric"),
          product_mrp: parseValue(item.product_data.Product_MRP, "numeric"),
          invoice_quantity: item.invoice_quantity ?? 0,
          order_quantity: item.order_quantity,
          net_order_quantity: item.net_order_quantity,
          order_price: item.order_price,
          order_net_price: item.order_net_price,
          order_discount_percentage: item.order_discount_percentage,
          order_item_total_amount: item.order_item_total_amount,
          invoice_line_base_amount: item.invoice_line_base_amount ?? 0,
          invoice_line_discount_amount: item.invoice_line_discount_amount ?? 0,
          invoice_line_excise_amount: item.invoice_line_excise_amount ?? 0,
          invoice_line_tax_amount: item.invoice_line_tax_amount ?? 0,
          invoice_line_item_amount: item.invoice_line_item_amount ?? 0,
          sgst_percent: item.sgst_percent,
          cgst_percent: item.cgst_percent,
          igst_percent: item.igst_percent,
          sgst_amount: item.sgst_amount,
          cgst_amount: item.cgst_amount,
          igst_amount: item.igst_amount,
          order_product_printing_name: item.order_product_printing_name,
          order_remarks: item.order_remarks,
        };
        
        await admin.from("invoice_items").insert(itemPayload);
      }
      
      imported++;
      if (imported % 10 === 0) {
        console.log(`Imported ${imported} invoices...`);
      }
    } catch (error) {
      console.error(`Error processing invoice ${invoiceId}:`, error.message);
      errors++;
    }
  }
  
  console.log(`\nImport complete!`);
  console.log(`Successfully imported: ${imported} invoices`);
  console.log(`Errors: ${errors}`);
}

// Main execution
const csvPath = process.argv[2] || path.join(__dirname, "..", "..", "latest_20_invoices.csv");

if (!fs.existsSync(csvPath)) {
  console.error(`CSV file not found: ${csvPath}`);
  console.error(`Usage: node scripts/import-invoices.mjs [path-to-csv]`);
  process.exit(1);
}

importInvoices(csvPath).catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
