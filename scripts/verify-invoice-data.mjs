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

// CSV column mapping
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

function normalizeValue(value) {
  if (value === null || value === undefined || value === "NULL" || value === "" || value === ".") {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed === "NULL" || trimmed === ".") return null;
    return trimmed;
  }
  return value;
}

function compareValues(csvVal, dbVal, fieldName) {
  const csvNorm = normalizeValue(csvVal);
  const dbNorm = normalizeValue(dbVal);
  
  if (csvNorm === null && dbNorm === null) return { match: true, issue: null };
  if (csvNorm === null && dbNorm !== null) return { match: false, issue: "CSV_NULL_BUT_DB_HAS_VALUE", csv: csvNorm, db: dbNorm };
  if (csvNorm !== null && dbNorm === null) return { match: false, issue: "CSV_HAS_VALUE_BUT_DB_NULL", csv: csvNorm, db: dbNorm };
  
  // For numeric fields, compare as numbers
  if (typeof csvNorm === "string" && !isNaN(parseFloat(csvNorm)) && !isNaN(parseFloat(dbNorm))) {
    const csvNum = parseFloat(csvNorm);
    const dbNum = parseFloat(dbNorm);
    if (Math.abs(csvNum - dbNum) < 0.01) return { match: true, issue: null };
    return { match: false, issue: "VALUE_MISMATCH", csv: csvNorm, db: dbNorm };
  }
  
  // For string fields, compare as strings (case-insensitive, trimmed)
  if (String(csvNorm).toLowerCase().trim() === String(dbNorm).toLowerCase().trim()) {
    return { match: true, issue: null };
  }
  
  return { match: false, issue: "VALUE_MISMATCH", csv: csvNorm, db: dbNorm };
}

async function fetchAllSupabaseData() {
  console.log("Fetching data from Supabase...");
  
  const [invoices, invoiceItems, invoiceOrders, customers, companies, products] = await Promise.all([
    admin.from("invoices").select("*").order("invoice_id"),
    admin.from("invoice_items").select("*").order("invoice_body_id"),
    admin.from("invoice_orders").select("*").order("order_number"),
    admin.from("customers").select("*").order("account_id"),
    admin.from("companies").select("*"), // Don't order by name as column might be company_name
    admin.from("products").select("*").order("catalogue_number"),
  ]);
  
  return {
    invoices: invoices.data || [],
    invoiceItems: invoiceItems.data || [],
    invoiceOrders: invoiceOrders.data || [],
    customers: customers.data || [],
    companies: companies.data || [],
    products: products.data || [],
  };
}

function parseCSV(csvPath) {
  console.log(`Reading CSV file: ${csvPath}`);
  const content = fs.readFileSync(csvPath, "utf-8");
  
  const records = parse(content, {
    columns: CSV_COLUMNS,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
  
  return records;
}

function groupCSVByInvoice(csvRecords) {
  const invoiceMap = new Map();
  
  for (const record of csvRecords) {
    const invoiceId = parseInt(record.Invoice_ID);
    if (!invoiceId) continue;
    
    if (!invoiceMap.has(invoiceId)) {
      invoiceMap.set(invoiceId, {
        invoice: {
          invoice_id: invoiceId,
          invoice_number: record.Invoice_Number,
          invoice_date: record.Invoice_Date,
          prompt_1: record.Prompt_1,
          prompt_2: record.Prompt_2,
          prompt_3: record.Prompt_3,
          prompt_4: record.Prompt_4,
          prompt_5: record.Prompt_5,
          base_amount: parseFloat(record.Invoice_Base_Amount) || 0,
          discount_amount: parseFloat(record.Invoice_Discount_Amount) || 0,
          excise_amount: parseFloat(record.Invoice_Excise_Amount) || 0,
          tax_amount: parseFloat(record.Invoice_Tax_Amount) || 0,
          item_amount: parseFloat(record.Invoice_Item_Amount) || 0,
          invoice_total_amount: parseFloat(record.Invoice_Total_Amount) || 0,
          confirmed: record.Invoice_Confirmed === "1" || record.Invoice_Confirmed === "true",
          transport_name: record.Transport_Name,
          vehicle_number: record.Vehicle_Number,
          date_of_removal: record.Date_Of_Removal,
          account_id: parseInt(record.Account_ID),
          company_name: record.Company_Name,
          company_data: {
            company_id: parseInt(record.Company_ID),
            name: record.Company_Name,
            prefix: record.Company_Prefix,
            address: record.Company_Address,
            telephone: record.Company_Telephone,
            fax: record.Company_Fax,
            email: record.Company_Email,
            authorised_signatory: record.Company_Authorised_Signatory,
            designation: record.Company_Designation,
            vat_tin: record.Company_VAT_TIN,
            cst_tin: record.Company_CST_TIN,
            pangir: record.Company_PANGIR,
          },
          customer_data: {
            account_id: parseInt(record.Account_ID),
            full_name: record.Customer_Full_Name,
            short_name: record.Customer_Short_Name,
            address: record.Customer_Address,
            city: record.Customer_City,
            state_id: parseInt(record.Customer_State_ID),
            pincode: record.Customer_Pincode,
            telephone: record.Customer_Telephone,
            email: record.Customer_Email,
            vat_tin: record.Customer_VAT_TIN,
            cst_tin: record.Customer_CST_TIN,
            gst_number: record.Customer_GST_Number,
            contact_person: record.Customer_Contact_Person,
          },
        },
        orders: new Map(),
        items: [],
      });
    }
    
    const invoice = invoiceMap.get(invoiceId);
    
    // Add order if not exists
    const orderId = parseInt(record.Order_ID);
    if (orderId && !invoice.orders.has(orderId)) {
      invoice.orders.set(orderId, {
        order_id: orderId,
        order_number: record.Order_Number,
        order_date: record.Order_Date,
        customer_po_number: record.Customer_PO_Number,
        customer_po_date: record.Customer_PO_Date,
        order_total_amount: parseFloat(record.Order_Total_Amount) || 0,
        payment_terms: record.Payment_Terms,
      });
    }
    
    // Add item
    invoice.items.push({
      invoice_body_id: parseInt(record.Invoice_Body_ID),
      order_body_id: parseInt(record.Order_Body_ID),
      invoice_quantity: parseFloat(record.Invoice_Quantity) || 0,
      invoice_line_base_amount: parseFloat(record.Invoice_Line_Base_Amount) || 0,
      invoice_line_discount_amount: parseFloat(record.Invoice_Line_Discount_Amount) || 0,
      invoice_line_excise_amount: parseFloat(record.Invoice_Line_Excise_Amount) || 0,
      invoice_line_tax_amount: parseFloat(record.Invoice_Line_Tax_Amount) || 0,
      invoice_line_item_amount: parseFloat(record.Invoice_Line_Item_Amount) || 0,
      sgst_percent: parseFloat(record.Invoice_SGST_Percent) || 0,
      cgst_percent: parseFloat(record.Invoice_CGST_Percent) || 0,
      igst_percent: parseFloat(record.Invoice_IGST_Percent) || 0,
      sgst_amount: parseFloat(record.Invoice_SGST_Amount) || 0,
      cgst_amount: parseFloat(record.Invoice_CGST_Amount) || 0,
      igst_amount: parseFloat(record.Invoice_IGST_Amount) || 0,
      order_product_printing_name: record.Order_Product_Printing_Name,
      order_remarks: record.Order_Remarks,
      product_data: {
        product_id: parseInt(record.Product_ID),
        catalogue_number: record.Product_Catalogue_Number,
        description: record.Product_Description,
        cas_number: record.Product_CAS_Number,
        packing_id: parseInt(record.Packing_ID),
        pack_quantity: parseFloat(record.Pack_Quantity) || 0,
        catalogue_price: parseFloat(record.Product_Catalogue_Price) || 0,
        mrp: parseFloat(record.Product_MRP) || 0,
      },
    });
  }
  
  // Sort items by invoice_body_id for each invoice
  for (const invoice of invoiceMap.values()) {
    invoice.items.sort((a, b) => (a.invoice_body_id || 0) - (b.invoice_body_id || 0));
  }
  
  return invoiceMap;
}

async function verifyData(csvPath) {
  console.log("=".repeat(80));
  console.log("INVOICE DATA VERIFICATION REPORT");
  console.log("=".repeat(80));
  console.log();
  
  // Parse CSV
  const csvRecords = parseCSV(csvPath);
  console.log(`CSV Records: ${csvRecords.length}`);
  
  // Group CSV by invoice
  const csvInvoices = groupCSVByInvoice(csvRecords);
  console.log(`Unique Invoices in CSV: ${csvInvoices.size}`);
  
  // Fetch Supabase data
  const dbData = await fetchAllSupabaseData();
  console.log(`Invoices in DB: ${dbData.invoices.length}`);
  console.log(`Invoice Items in DB: ${dbData.invoiceItems.length}`);
  console.log(`Invoice Orders in DB: ${dbData.invoiceOrders.length}`);
  console.log(`Customers in DB: ${dbData.customers.length}`);
  console.log(`Companies in DB: ${dbData.companies.length}`);
  console.log(`Products in DB: ${dbData.products.length}`);
  console.log();
  
  // Create lookup maps
  const dbInvoicesByInvoiceId = new Map();
  for (const inv of dbData.invoices) {
    if (inv.invoice_id) {
      dbInvoicesByInvoiceId.set(inv.invoice_id, inv);
    }
  }
  
  const dbItemsByInvoiceId = new Map();
  for (const item of dbData.invoiceItems) {
    // Find the invoice this item belongs to
    let invoiceId = null;
    if (typeof item.invoice_id === "string") {
      // UUID - need to find invoice by UUID
      const invoice = dbData.invoices.find(inv => inv.id === item.invoice_id);
      invoiceId = invoice?.invoice_id;
    } else if (typeof item.invoice_id === "object" && item.invoice_id?.invoice_id) {
      invoiceId = item.invoice_id.invoice_id;
    }
    
    if (!invoiceId) continue;
    
    if (!dbItemsByInvoiceId.has(invoiceId)) {
      dbItemsByInvoiceId.set(invoiceId, new Map()); // Use Map keyed by invoice_body_id
    }
    // Store items by invoice_body_id for easy lookup
    if (item.invoice_body_id) {
      dbItemsByInvoiceId.get(invoiceId).set(item.invoice_body_id, item);
    }
  }
  
  const dbOrdersByInvoiceId = new Map();
  for (const order of dbData.invoiceOrders) {
    // Find the invoice this order belongs to
    let invoiceId = null;
    if (typeof order.invoice_id === "string") {
      // UUID - need to find invoice by UUID
      const invoice = dbData.invoices.find(inv => inv.id === order.invoice_id);
      invoiceId = invoice?.invoice_id;
    } else if (typeof order.invoice_id === "object" && order.invoice_id?.invoice_id) {
      invoiceId = order.invoice_id.invoice_id;
    }
    
    if (!invoiceId) continue;
    
    if (!dbOrdersByInvoiceId.has(invoiceId)) {
      dbOrdersByInvoiceId.set(invoiceId, []);
    }
    dbOrdersByInvoiceId.get(invoiceId).push(order);
  }
  
  const dbCustomersByAccountId = new Map();
  for (const cust of dbData.customers) {
    if (cust.account_id) {
      dbCustomersByAccountId.set(cust.account_id, cust);
    }
  }
  
  const dbCompaniesByName = new Map();
  for (const comp of dbData.companies) {
    const name = comp.company_name || comp.name; // Prefer company_name as that's what exists
    if (name) {
      // Store with multiple variations for better matching
      const normalizedName = name.toLowerCase().trim();
      dbCompaniesByName.set(normalizedName, comp);
      // Also store without extra spaces
      dbCompaniesByName.set(normalizedName.replace(/\s+/g, " "), comp);
      // Store exact match
      dbCompaniesByName.set(name.trim(), comp);
    }
  }
  
  const dbProductsByCatalogue = new Map();
  for (const prod of dbData.products) {
    const cat = prod.catalogue_number || prod.sku || prod.product_catalogue_number;
    if (cat) {
      dbProductsByCatalogue.set(String(cat).toLowerCase().trim(), prod);
    }
  }
  
  // Verification results
  const report = {
    summary: {
      csvInvoices: csvInvoices.size,
      dbInvoices: dbData.invoices.length,
      missingInvoices: [],
      extraInvoices: [],
      verifiedInvoices: 0,
      totalIssues: 0,
    },
    invoices: [],
    customers: [],
    companies: [],
    products: [],
  };
  
  // Verify each CSV invoice
  for (const [invoiceId, csvInvoice] of csvInvoices.entries()) {
    const dbInvoice = dbInvoicesByInvoiceId.get(invoiceId);
    
    if (!dbInvoice) {
      report.summary.missingInvoices.push(invoiceId);
      report.invoices.push({
        invoice_id: invoiceId,
        status: "MISSING",
        issues: [`Invoice ${invoiceId} not found in database`],
      });
      continue;
    }
    
    // Verify invoice fields
    const invoiceIssues = [];
    const invoiceFields = [
      { csv: "invoice_number", db: "invoice_number", csvVal: csvInvoice.invoice.invoice_number },
      { csv: "invoice_date", db: "invoice_date", csvVal: csvInvoice.invoice.invoice_date },
      { csv: "base_amount", db: "base_amount", csvVal: csvInvoice.invoice.base_amount },
      { csv: "discount_amount", db: "discount_amount", csvVal: csvInvoice.invoice.discount_amount },
      { csv: "excise_amount", db: "excise_amount", csvVal: csvInvoice.invoice.excise_amount },
      { csv: "tax_amount", db: "tax_amount", csvVal: csvInvoice.invoice.tax_amount },
      { csv: "item_amount", db: "item_amount", csvVal: csvInvoice.invoice.item_amount },
      { csv: "invoice_total_amount", db: "invoice_total_amount", csvVal: csvInvoice.invoice.invoice_total_amount },
      { csv: "confirmed", db: "confirmed", csvVal: csvInvoice.invoice.confirmed },
      { csv: "transport_name", db: "transport_name", csvVal: csvInvoice.invoice.transport_name },
      { csv: "vehicle_number", db: "vehicle_number", csvVal: csvInvoice.invoice.vehicle_number },
    ];
    
    for (const field of invoiceFields) {
      const comparison = compareValues(field.csvVal, dbInvoice[field.db], field.csv);
      if (!comparison.match) {
        invoiceIssues.push({
          field: field.csv,
          issue: comparison.issue,
          csv_value: comparison.csv,
          db_value: comparison.db,
        });
      }
    }
    
    // Verify customer
    const csvCustomer = csvInvoice.invoice.customer_data;
    const dbCustomer = dbCustomersByAccountId.get(csvCustomer.account_id);
    const customerIssues = [];
    
    if (!dbCustomer) {
      customerIssues.push({ field: "customer", issue: "CUSTOMER_NOT_FOUND", account_id: csvCustomer.account_id });
    } else {
      const customerFields = [
        { csv: "full_name", db: "full_name", csvVal: csvCustomer.full_name },
        { csv: "short_name", db: "short_name", csvVal: csvCustomer.short_name },
        { csv: "address", db: "address", csvVal: csvCustomer.address },
        { csv: "city", db: "city", csvVal: csvCustomer.city },
        { csv: "pincode", db: "pincode", csvVal: csvCustomer.pincode },
        { csv: "telephone", db: "telephone", csvVal: csvCustomer.telephone },
        { csv: "email", db: "email", csvVal: csvCustomer.email },
        { csv: "gst_number", db: "gst_number", csvVal: csvCustomer.gst_number },
      ];
      
      for (const field of customerFields) {
        const comparison = compareValues(field.csvVal, dbCustomer[field.db], field.csv);
        if (!comparison.match) {
          customerIssues.push({
            field: field.csv,
            issue: comparison.issue,
            csv_value: comparison.csv,
            db_value: comparison.db,
          });
        }
      }
    }
    
    // Verify company - try multiple matching strategies
    const csvCompany = csvInvoice.invoice.company_data;
    let dbCompany = null;
    const companyName = csvCompany.name?.trim();
    
    if (companyName) {
      const searchName = companyName.toLowerCase().trim();
      
      // Try exact match
      dbCompany = dbCompaniesByName.get(searchName);
      
      // Try normalized match (remove extra spaces)
      if (!dbCompany) {
        const normalized = searchName.replace(/\s+/g, " ");
        dbCompany = dbCompaniesByName.get(normalized);
      }
      
      // Try partial match (for cases like "SISCO" vs "SISCO, Mumbai")
      if (!dbCompany) {
        for (const [key, comp] of dbCompaniesByName.entries()) {
          if (key.includes(searchName) || searchName.includes(key)) {
            dbCompany = comp;
            break;
          }
        }
      }
      
      // Try matching just the first word (for "SISCO" matching)
      if (!dbCompany && searchName.split(/\s+/).length > 0) {
        const firstWord = searchName.split(/\s+/)[0];
        for (const [key, comp] of dbCompaniesByName.entries()) {
          if (key.startsWith(firstWord) || firstWord === key) {
            dbCompany = comp;
            break;
          }
        }
      }
    }
    
    const companyIssues = [];
    
    if (!dbCompany) {
      companyIssues.push({ 
        field: "company", 
        issue: "COMPANY_NOT_FOUND", 
        name: companyName,
        available_companies: Array.from(dbCompaniesByName.keys()).slice(0, 5) // Show first 5 for debugging
      });
    } else {
      const companyFields = [
        { csv: "name", db: "company_name", csvVal: csvCompany.name },
        { csv: "address", db: "address", csvVal: csvCompany.address },
        { csv: "telephone", db: "telephone", csvVal: csvCompany.telephone },
        { csv: "email", db: "email", csvVal: csvCompany.email },
      ];
      
      for (const field of companyFields) {
        const comparison = compareValues(field.csvVal, dbCompany[field.db], field.csv);
        if (!comparison.match) {
          companyIssues.push({
            field: field.csv,
            issue: comparison.issue,
            csv_value: comparison.csv,
            db_value: comparison.db,
          });
        }
      }
    }
    
    // Verify items - match by invoice_body_id
    const dbItemsMap = dbItemsByInvoiceId.get(invoiceId) || new Map();
    const itemIssues = [];
    
    // Sort CSV items by invoice_body_id for consistent reporting
    const csvItemsSorted = [...csvInvoice.items].sort((a, b) => (a.invoice_body_id || 0) - (b.invoice_body_id || 0));
    const dbItemsArray = Array.from(dbItemsMap.values()).sort((a, b) => (a.invoice_body_id || 0) - (b.invoice_body_id || 0));
    
    if (csvItemsSorted.length !== dbItemsArray.length) {
      itemIssues.push({
        field: "item_count",
        issue: "COUNT_MISMATCH",
        csv_count: csvItemsSorted.length,
        db_count: dbItemsArray.length,
      });
    }
    
    // Create a set of all invoice_body_ids for tracking
    const csvBodyIds = new Set(csvItemsSorted.map(item => item.invoice_body_id).filter(Boolean));
    const dbBodyIds = new Set(dbItemsArray.map(item => item.invoice_body_id).filter(Boolean));
    
    // Find missing items
    for (const bodyId of csvBodyIds) {
      if (!dbBodyIds.has(bodyId)) {
        itemIssues.push({ 
          field: `item_body_id_${bodyId}`, 
          issue: "MISSING_ITEM_IN_DB",
          invoice_body_id: bodyId 
        });
      }
    }
    
    // Find extra items
    for (const bodyId of dbBodyIds) {
      if (!csvBodyIds.has(bodyId)) {
        itemIssues.push({ 
          field: `item_body_id_${bodyId}`, 
          issue: "EXTRA_ITEM_IN_DB",
          invoice_body_id: bodyId 
        });
      }
    }
    
    // Verify each item by matching invoice_body_id
    for (const csvItem of csvItemsSorted) {
      if (!csvItem.invoice_body_id) continue;
      
      const dbItem = dbItemsMap.get(csvItem.invoice_body_id);
      
      if (!dbItem) {
        itemIssues.push({ 
          field: `item_body_id_${csvItem.invoice_body_id}`, 
          issue: "MISSING_ITEM_IN_DB" 
        });
        continue;
      }
      
      // Compare item fields
      const itemFields = [
        { csv: "invoice_quantity", db: "invoice_quantity", csvVal: csvItem.invoice_quantity },
        { csv: "invoice_line_base_amount", db: "invoice_line_base_amount", csvVal: csvItem.invoice_line_base_amount },
        { csv: "invoice_line_discount_amount", db: "invoice_line_discount_amount", csvVal: csvItem.invoice_line_discount_amount },
        { csv: "invoice_line_excise_amount", db: "invoice_line_excise_amount", csvVal: csvItem.invoice_line_excise_amount },
        { csv: "invoice_line_tax_amount", db: "invoice_line_tax_amount", csvVal: csvItem.invoice_line_tax_amount },
        { csv: "invoice_line_item_amount", db: "invoice_line_item_amount", csvVal: csvItem.invoice_line_item_amount },
        { csv: "order_product_printing_name", db: "order_product_printing_name", csvVal: csvItem.order_product_printing_name },
      ];
      
      for (const field of itemFields) {
        const comparison = compareValues(field.csvVal, dbItem[field.db], field.csv);
        if (!comparison.match) {
          itemIssues.push({
            field: `item_body_id_${csvItem.invoice_body_id}_${field.csv}`,
            issue: comparison.issue,
            csv_value: comparison.csv,
            db_value: comparison.db,
          });
        }
      }
    }
    
    const totalIssues = invoiceIssues.length + customerIssues.length + companyIssues.length + itemIssues.length;
    
    if (totalIssues > 0) {
      report.invoices.push({
        invoice_id: invoiceId,
        status: "HAS_ISSUES",
        invoice_issues: invoiceIssues,
        customer_issues: customerIssues,
        company_issues: companyIssues,
        item_issues: itemIssues,
        total_issues: totalIssues,
      });
      report.summary.totalIssues += totalIssues;
    } else {
      report.summary.verifiedInvoices++;
    }
  }
  
  // Find extra invoices in DB
  for (const dbInvoice of dbData.invoices) {
    if (dbInvoice.invoice_id && !csvInvoices.has(dbInvoice.invoice_id)) {
      report.summary.extraInvoices.push(dbInvoice.invoice_id);
    }
  }
  
  // Generate report
  console.log("=".repeat(80));
  console.log("VERIFICATION SUMMARY");
  console.log("=".repeat(80));
  console.log(`CSV Invoices: ${report.summary.csvInvoices}`);
  console.log(`DB Invoices: ${report.summary.dbInvoices}`);
  console.log(`Verified (No Issues): ${report.summary.verifiedInvoices}`);
  console.log(`Missing Invoices: ${report.summary.missingInvoices.length}`);
  console.log(`Extra Invoices in DB: ${report.summary.extraInvoices.length}`);
  console.log(`Total Issues Found: ${report.summary.totalIssues}`);
  console.log();
  
  if (report.summary.missingInvoices.length > 0) {
    console.log("MISSING INVOICES:");
    report.summary.missingInvoices.forEach(id => console.log(`  - Invoice ID: ${id}`));
    console.log();
  }
  
  if (report.summary.extraInvoices.length > 0) {
    console.log("EXTRA INVOICES IN DB (not in CSV):");
    report.summary.extraInvoices.slice(0, 10).forEach(id => console.log(`  - Invoice ID: ${id}`));
    if (report.summary.extraInvoices.length > 10) {
      console.log(`  ... and ${report.summary.extraInvoices.length - 10} more`);
    }
    console.log();
  }
  
  // Detailed issues
  if (report.invoices.length > 0) {
    console.log("=".repeat(80));
    console.log("DETAILED ISSUES");
    console.log("=".repeat(80));
    
    for (const invoiceReport of report.invoices.slice(0, 20)) {
      console.log(`\nInvoice ID: ${invoiceReport.invoice_id} - ${invoiceReport.status}`);
      
      if (invoiceReport.invoice_issues?.length > 0) {
        console.log("  Invoice Field Issues:");
        invoiceReport.invoice_issues.forEach(issue => {
          console.log(`    - ${issue.field}: ${issue.issue} (CSV: ${issue.csv_value}, DB: ${issue.db_value})`);
        });
      }
      
      if (invoiceReport.customer_issues?.length > 0) {
        console.log("  Customer Issues:");
        invoiceReport.customer_issues.forEach(issue => {
          console.log(`    - ${issue.field}: ${issue.issue} (CSV: ${issue.csv_value || "N/A"}, DB: ${issue.db_value || "N/A"})`);
        });
      }
      
      if (invoiceReport.company_issues?.length > 0) {
        console.log("  Company Issues:");
        invoiceReport.company_issues.forEach(issue => {
          console.log(`    - ${issue.field}: ${issue.issue} (CSV: ${issue.csv_value || "N/A"}, DB: ${issue.db_value || "N/A"})`);
        });
      }
      
      if (invoiceReport.item_issues?.length > 0) {
        console.log("  Item Issues:");
        invoiceReport.item_issues.forEach(issue => {
          console.log(`    - ${issue.field}: ${issue.issue} (CSV: ${issue.csv_value || "N/A"}, DB: ${issue.db_value || "N/A"})`);
        });
      }
    }
    
    if (report.invoices.length > 20) {
      console.log(`\n... and ${report.invoices.length - 20} more invoices with issues`);
    }
  }
  
  // Save detailed report to file
  const reportPath = path.join(__dirname, "..", "..", "VERIFICATION_REPORT.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nDetailed report saved to: ${reportPath}`);
  
  return report;
}

// Main execution
const csvPath = process.argv[2] || path.join(__dirname, "..", "..", "Invoice-data.csv");

if (!fs.existsSync(csvPath)) {
  console.error(`CSV file not found: ${csvPath}`);
  process.exit(1);
}

verifyData(csvPath)
  .then(() => {
    console.log("\nVerification complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error during verification:", error);
    process.exit(1);
  });
