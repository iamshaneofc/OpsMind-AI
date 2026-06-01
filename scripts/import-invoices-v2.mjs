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

// Expected column count (based on SQL query)
const EXPECTED_COLUMNS = 83;

// CSV column mapping
const CSV_COLUMNS = [
  "Invoice_ID", "Invoice_Number", "Invoice_Date", "Prompt_1", "Prompt_2", "Prompt_3", "Prompt_4", "Prompt_5",
  "Invoice_Base_Amount", "Invoice_Discount_Amount", "Invoice_Excise_Amount", "Invoice_Tax_Amount", 
  "Invoice_Item_Amount", "Invoice_Total_Amount", "Invoice_Confirmed", "Transport_Name", "Vehicle_Number", 
  "Date_Of_Removal", "Order_ID", "Order_Number", "Order_Date", "Customer_PO_Number", "Customer_PO_Date",
  "Order_Total_Amount", "Payment_Terms", "Order_Body_ID", "Order_Quantity", "Net_Order_Quantity",
  "Order_Price", "Order_Net_Price", "Order_Discount_Percentage", "Order_Item_Total_Amount",
  "Order_Product_Printing_Name", "Order_Remarks", "Invoice_Body_ID", "Invoice_Quantity",
  "Invoice_Line_Base_Amount", "Invoice_Line_Discount_Amount", "Invoice_Line_Excise_Amount",
  "Invoice_Line_Tax_Amount", "Invoice_Line_Item_Amount", "Invoice_SGST_Percent", "Invoice_CGST_Percent",
  "Invoice_IGST_Percent", "Invoice_SGST_Amount", "Invoice_CGST_Amount", "Invoice_IGST_Amount",
  "Product_ID", "Product_Catalogue_Number", "Product_Description", "Product_CAS_Number",
  "Packing_ID", "Pack_Quantity", "Product_Catalogue_Price", "Product_MRP", "Company_ID", "Company_Name",
  "Company_Prefix", "Company_Address", "Company_Telephone", "Company_Fax", "Company_Email",
  "Company_Authorised_Signatory", "Company_Designation", "Company_VAT_TIN", "Company_CST_TIN",
  "Company_PANGIR", "Account_ID", "Customer_Full_Name", "Customer_Short_Name", "Customer_Address",
  "Customer_City", "Customer_State_ID", "Customer_Pincode", "Customer_Telephone", "Customer_Email",
  "Customer_VAT_TIN", "Customer_CST_TIN", "Customer_GST_Number", "Customer_Contact_Person"
];

function parseValue(value, type = "text") {
  if (!value || value === "NULL" || value === "" || value.trim() === "") {
    return type === "numeric" || type === "integer" ? 0 : null;
  }
  
  switch (type) {
    case "integer":
      const intVal = parseInt(value, 10);
      return isNaN(intVal) ? 0 : intVal;
    case "decimal":
    case "numeric":
      const numVal = parseFloat(value);
      return isNaN(numVal) ? 0 : numVal;
    case "boolean":
      return value === "1" || value === "true" || value === "True" || value.toLowerCase() === "true";
    case "date":
      if (!value) return null;
      try {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date.toISOString();
      } catch {
        return null;
      }
    default:
      return value.trim();
  }
}

function cleanText(value) {
  if (!value) return null;
  return value
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Intelligent CSV parser that handles multi-line records
function parseCSVIntelligently(csvContent) {
  const lines = csvContent.split(/\r?\n/);
  const records = [];
  let currentRecord = null;
  let expectedColumnCount = EXPECTED_COLUMNS;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Count commas to estimate column count
    const commaCount = (line.match(/,/g) || []).length;
    
    // If this looks like a continuation line (fewer columns, starts with data)
    if (currentRecord && commaCount < expectedColumnCount - 5) {
      // Merge with previous record - append to last field
      const lastFieldIndex = currentRecord.length - 1;
      if (lastFieldIndex >= 0) {
        currentRecord[lastFieldIndex] = (currentRecord[lastFieldIndex] || "") + " " + line;
      }
      continue;
    }
    
    // Try to parse as CSV
    try {
      const parsed = parse(line, {
        columns: false,
        skip_empty_lines: false,
        relax_column_count: true,
        trim: true,
      })[0];
      
      if (parsed && parsed.length > 0) {
        // If we have a partial record, merge it
        if (currentRecord && parsed.length < expectedColumnCount) {
          // Merge fields
          for (let j = 0; j < parsed.length && j < currentRecord.length; j++) {
            if (parsed[j] && parsed[j].trim()) {
              currentRecord[j] = (currentRecord[j] || "") + " " + parsed[j];
            }
          }
          // Add new fields if any
          for (let j = currentRecord.length; j < parsed.length; j++) {
            currentRecord.push(parsed[j] || "");
          }
        } else {
          // Save previous record if exists
          if (currentRecord && currentRecord.length >= expectedColumnCount - 5) {
            // Pad or trim to expected length
            while (currentRecord.length < expectedColumnCount) {
              currentRecord.push("");
            }
            if (currentRecord.length > expectedColumnCount) {
              currentRecord = currentRecord.slice(0, expectedColumnCount);
            }
            records.push(currentRecord);
          }
          // Start new record
          currentRecord = [...parsed];
          expectedColumnCount = Math.max(expectedColumnCount, parsed.length);
        }
      }
    } catch (e) {
      // If parsing fails, treat as continuation
      if (currentRecord) {
        const lastFieldIndex = currentRecord.length - 1;
        if (lastFieldIndex >= 0) {
          currentRecord[lastFieldIndex] = (currentRecord[lastFieldIndex] || "") + " " + line;
        }
      }
    }
  }
  
  // Don't forget the last record
  if (currentRecord && currentRecord.length >= expectedColumnCount - 5) {
    while (currentRecord.length < expectedColumnCount) {
      currentRecord.push("");
    }
    if (currentRecord.length > expectedColumnCount) {
      currentRecord = currentRecord.slice(0, expectedColumnCount);
    }
    records.push(currentRecord);
  }
  
  // Convert to objects with column names
  return records.map(record => {
    const obj = {};
    CSV_COLUMNS.forEach((col, idx) => {
      obj[col] = record[idx] || "";
    });
    return obj;
  });
}

async function ensureCompany(companyData) {
  const companyName = cleanText(companyData.Company_Name);
  if (!companyName || companyName.length < 2) return null;
  
  // Try to find existing
  const { data: existing } = await admin
    .from("companies")
    .select("id")
    .eq("name", companyName)
    .maybeSingle();
  
  if (existing) return existing.id;
  
  // Create new
  const payload = {
    name: companyName,
  };
  
  const prefix = cleanText(companyData.Company_Prefix);
  if (prefix && prefix !== ".") {
    payload.code = prefix;
  }
  
  const { data: newCompany, error } = await admin
    .from("companies")
    .insert(payload)
    .select("id")
    .single();
  
  if (error) {
    console.error(`Error creating company ${companyName}:`, error.message);
    return null;
  }
  
  return newCompany.id;
}

async function ensureCustomer(accountData, companyId) {
  const accountId = parseValue(accountData.Account_ID, "integer");
  if (!accountId) return null;
  
  // Try to find existing
  const { data: existing } = await admin
    .from("customers")
    .select("id")
    .eq("account_id", accountId)
    .maybeSingle();
  
  if (existing) return existing.id;
  
  // Create new
  const fullName = cleanText(accountData.Customer_Full_Name);
  if (!fullName) return null;
  
  const payload = {
    account_id: accountId,
    company_id: companyId,
    full_name: fullName,
    short_name: cleanText(accountData.Customer_Short_Name),
    address: cleanText(accountData.Customer_Address),
    city: cleanText(accountData.Customer_City),
    state_id: parseValue(accountData.Customer_State_ID, "integer"),
    pincode: cleanText(accountData.Customer_Pincode),
    telephone: cleanText(accountData.Customer_Telephone),
    email: cleanText(accountData.Customer_Email),
    vat_tin: cleanText(accountData.Customer_VAT_TIN),
    cst_tin: cleanText(accountData.Customer_CST_TIN),
    gst_number: cleanText(accountData.Customer_GST_Number),
    contact_person: cleanText(accountData.Customer_Contact_Person),
  };
  
  const { data: newCustomer, error } = await admin
    .from("customers")
    .insert(payload)
    .select("id")
    .single();
  
  if (error) {
    console.error(`Error creating customer ${fullName}:`, error.message);
    return null;
  }
  
  return newCustomer.id;
}

async function ensureProduct(productData) {
  const catalogueNo = cleanText(productData.Product_Catalogue_Number);
  if (!catalogueNo || catalogueNo.length < 2) return null;
  
  // Skip if looks like invalid data
  if (/^\d+\.?\d*$/.test(catalogueNo) || catalogueNo === ".00") return null;
  
  // Try to find existing
  const { data: existing } = await admin
    .from("products")
    .select("id")
    .eq("catalogue_number", catalogueNo)
    .maybeSingle();
  
  if (existing) return existing.id;
  
  // Create new
  const payload = {
    product_id: parseValue(productData.Product_ID, "integer"),
    catalogue_number: catalogueNo,
    description: cleanText(productData.Product_Description) || catalogueNo,
    cas_number: cleanText(productData.Product_CAS_Number),
    packing_id: parseValue(productData.Packing_ID, "integer"),
    pack_quantity: parseValue(productData.Pack_Quantity, "numeric"),
    catalogue_price: parseValue(productData.Product_Catalogue_Price, "numeric"),
    mrp: parseValue(productData.Product_MRP, "numeric"),
    unit: "unit",
  };
  
  const { data: newProduct, error } = await admin
    .from("products")
    .insert(payload)
    .select("id")
    .single();
  
  if (error) {
    console.error(`Error creating product ${catalogueNo}:`, error.message);
    return null;
  }
  
  return newProduct.id;
}

async function importInvoices(csvPath) {
  console.log(`Reading CSV file: ${csvPath}`);
  
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  
  // Use intelligent parser
  const records = parseCSVIntelligently(csvContent);
  console.log(`Parsed ${records.length} records from CSV`);
  
  // Filter valid records
  const validRecords = records.filter(r => {
    const invoiceId = parseValue(r.Invoice_ID, "integer");
    return invoiceId && invoiceId > 0;
  });
  
  console.log(`Found ${validRecords.length} valid records`);
  
  // Group by invoice ID
  const invoiceMap = new Map();
  
  for (const record of validRecords) {
    const invoiceId = parseValue(record.Invoice_ID, "integer");
    if (!invoiceId) continue;
    
    if (!invoiceMap.has(invoiceId)) {
      invoiceMap.set(invoiceId, {
        invoice: null,
        items: [],
        orders: new Set(),
      });
    }
    
    const data = invoiceMap.get(invoiceId);
    
    // Collect invoice header (first record)
    if (!data.invoice) {
      data.invoice = {
        invoice_id: invoiceId,
        invoice_number: cleanText(record.Invoice_Number) || `INV-${invoiceId}`,
        invoice_date: parseValue(record.Invoice_Date, "date") || new Date().toISOString(),
        prompt_1: cleanText(record.Prompt_1),
        prompt_2: cleanText(record.Prompt_2),
        prompt_3: cleanText(record.Prompt_3),
        prompt_4: cleanText(record.Prompt_4),
        prompt_5: cleanText(record.Prompt_5),
        base_amount: parseValue(record.Invoice_Base_Amount, "numeric"),
        discount_amount: parseValue(record.Invoice_Discount_Amount, "numeric"),
        excise_amount: parseValue(record.Invoice_Excise_Amount, "numeric"),
        tax_amount: parseValue(record.Invoice_Tax_Amount, "numeric"),
        item_amount: parseValue(record.Invoice_Item_Amount, "numeric"),
        invoice_total_amount: parseValue(record.Invoice_Total_Amount, "numeric"),
        confirmed: parseValue(record.Invoice_Confirmed, "boolean"),
        transport_name: cleanText(record.Transport_Name),
        vehicle_number: cleanText(record.Vehicle_Number),
        date_of_removal: parseValue(record.Date_Of_Removal, "date"),
        account_id: parseValue(record.Account_ID, "integer"),
        company_data: record,
        customer_data: record,
      };
    }
    
    // Collect order data
    const orderId = parseValue(record.Order_ID, "integer");
    if (orderId) {
      data.orders.add({
        order_id: orderId,
        order_number: cleanText(record.Order_Number),
        order_date: parseValue(record.Order_Date, "date"),
        customer_po_number: cleanText(record.Customer_PO_Number),
        customer_po_date: parseValue(record.Customer_PO_Date, "date"),
        order_total_amount: parseValue(record.Order_Total_Amount, "numeric"),
        payment_terms: parseValue(record.Payment_Terms, "integer"),
      });
    }
    
    // Collect invoice items
    data.items.push({
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
      product_data: record,
    });
  }
  
  console.log(`Processing ${invoiceMap.size} unique invoices...`);
  
  let imported = 0;
  let errors = 0;
  
  for (const [invoiceId, data] of invoiceMap.entries()) {
    try {
      // Step 1: Ensure company exists
      const companyId = await ensureCompany(data.invoice.company_data);
      
      // Step 2: Ensure customer exists
      const customerId = await ensureCustomer(data.invoice.customer_data, companyId);
      
      // Step 3: Insert invoice
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
        company_id: companyId,
        customer_id: customerId,
        account_id: data.invoice.account_id,
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
      
      // Step 4: Insert invoice items
      for (const item of data.items) {
        const productId = await ensureProduct(item.product_data);
        
        const itemPayload = {
          invoice_id: invoice.id,
          invoice_body_id: item.invoice_body_id,
          order_body_id: item.order_body_id,
          product_id: productId,
          product_catalogue_number: cleanText(item.product_data.Product_Catalogue_Number),
          product_description: cleanText(item.product_data.Product_Description),
          product_cas_number: cleanText(item.product_data.Product_CAS_Number),
          packing_id: parseValue(item.product_data.Packing_ID, "integer"),
          pack_quantity: parseValue(item.product_data.Pack_Quantity, "numeric"),
          product_catalogue_price: parseValue(item.product_data.Product_Catalogue_Price, "numeric"),
          product_mrp: parseValue(item.product_data.Product_MRP, "numeric"),
          invoice_quantity: item.invoice_quantity,
          order_quantity: item.order_quantity,
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
        };
        
        await admin.from("invoice_items").insert(itemPayload);
      }
      
      imported++;
      if (imported % 5 === 0) {
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
  process.exit(1);
}

importInvoices(csvPath).catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
