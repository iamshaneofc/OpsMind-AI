# Invoice Data Import Guide

This guide explains how to import invoice data from MSSQL Server to Supabase.

## Overview

The invoice import system consists of:
1. **SQL Query** - Extracts invoice data from MSSQL Server
2. **Migration** - Creates invoice tables in Supabase
3. **Import Script** - Imports CSV data to Supabase

## Prerequisites

1. MSSQL Server running with `SiscoERP` database
2. Supabase project set up with environment variables
3. Node.js and npm installed

## Step 1: Extract Data from MSSQL

The SQL query `extract_latest_20_invoices.sql` extracts the latest 20 invoices with all related data:
- Invoice headers and line items
- Linked orders
- Product details
- Company and customer information

To extract data:

```bash
cd "C:\OpsMind bot"
sqlcmd -S localhost -E -C -d SiscoERP -i "extract_latest_20_invoices.sql" -W -s "," -h -1 -o "latest_20_invoices.csv"
```

## Step 2: Run Database Migration

Apply the migration to create invoice tables in Supabase:

```bash
# If using Supabase CLI
supabase migration up

# Or manually run the migration file:
# supabase/migrations/202602190001_add_invoices.sql
```

The migration creates:
- `invoices` table - Invoice headers
- `invoice_items` table - Invoice line items
- `invoice_orders` table - Links between invoices and orders

## Step 3: Install Dependencies

Install the required npm package for CSV parsing:

```bash
cd opsmind-operations-ai
npm install
```

## Step 4: Set Up Environment Variables

Ensure your `.env` file (or environment) has:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Step 5: Import Data

Run the import script:

```bash
# From opsmind-operations-ai directory
npm run import:invoices

# Or with custom CSV path
node scripts/import-invoices.mjs "C:\OpsMind bot\latest_20_invoices.csv"
```

The script will:
1. Read the CSV file
2. Create/update companies in Supabase
3. Create/update products in Supabase
4. Insert invoices with all related data
5. Link invoices to orders and products

## Data Mapping

### Companies
- Company name from `Company_Name` column
- Company code from `Company_Prefix` column

### Products
- Product name from `Product_Description`
- SKU from `Product_Catalogue_Number`
- Additional details stored in invoice_items

### Invoices
- All invoice header fields mapped
- Customer details stored (denormalized for quick access)
- Linked to companies via `company_id`

### Invoice Items
- All line item details
- Linked to products via `product_id`
- Contains pricing, quantities, and tax information

## Querying Imported Data

After import, you can query the data:

```sql
-- Get all invoices with items
SELECT 
  i.invoice_number,
  i.invoice_date,
  i.invoice_total_amount,
  c.name as company_name,
  COUNT(ii.id) as item_count
FROM invoices i
LEFT JOIN companies c ON i.company_id = c.id
LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
GROUP BY i.id, i.invoice_number, i.invoice_date, i.invoice_total_amount, c.name;

-- Get invoice with all items and products
SELECT 
  i.invoice_number,
  ii.product_description,
  ii.invoice_quantity,
  ii.invoice_line_item_amount,
  p.name as product_name,
  p.sku
FROM invoices i
JOIN invoice_items ii ON i.id = ii.invoice_id
LEFT JOIN products p ON ii.product_id = p.id
WHERE i.invoice_number = '9.106.0.50725';
```

## Troubleshooting

### CSV Parsing Errors
- Ensure CSV file is properly formatted
- Check for special characters in data
- Verify column names match expected format

### Database Errors
- Ensure migration has been run
- Check RLS policies allow service role access
- Verify foreign key constraints

### Missing Data
- Check for NULL values in required fields
- Verify company/product creation succeeded
- Review import script logs for errors

## Next Steps

After importing invoices, you can:
1. Update the bot to query invoice data
2. Create views for common invoice queries
3. Add invoice-related features to the UI
4. Set up real-time subscriptions for invoice updates

## Files

- `extract_latest_20_invoices.sql` - SQL query to extract data
- `supabase/migrations/202602190001_add_invoices.sql` - Database migration
- `scripts/import-invoices.mjs` - Import script
- `latest_20_invoices.csv` - Extracted data (generated)
