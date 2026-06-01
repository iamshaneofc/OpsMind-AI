require('dotenv').config({path: '.env'});
const sql = require('mssql');

async function run() {
  const config = {
    user: 'sa',
    password: 'StrongPassword123',
    server: '98.82.2.100',
    database: process.env.SQL_SERVER_DATABASE || 'SiscoERP',
    options: { encrypt: false, trustServerCertificate: true } // Some DBs fail with encrypt:true if not configured
  };
  try {
    const pool = await sql.connect(config);
    const res = await pool.request().query(`
      WITH OrderSignals AS (
        SELECT TOP 1000
          h.sales_order_id,
          inv.DATE_OF_REMOVAL,
          inv.confirmed,
          CASE WHEN inv.has_invoice = 1 THEN 1 ELSE 0 END AS has_invoice,
          ISNULL(b.Order_Forwarded, 0) AS Order_Forwarded,
          ISNULL(b.request_initialised, 0) AS request_initialised,
          ISNULL(b.request_processed, 0) AS request_processed
        FROM dbo.sales_order_header h
        OUTER APPLY (
          SELECT TOP 1 
            sh.DATE_OF_REMOVAL, 
            sh.confirmed,
            1 AS has_invoice
          FROM dbo.Sales_Invoice_Header sh
          JOIN dbo.Sales_Invoice_Body sib ON sib.sales_invoice_header_id = sh.sales_invoice_header_id
          JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = sib.sales_order_body_id
          WHERE sob.sales_order_id = h.sales_order_id
          ORDER BY sh.voucher_date DESC, sh.sales_invoice_header_id DESC
        ) inv
        OUTER APPLY (
          SELECT TOP 1
            CAST(MAX(CAST(Order_Forwarded AS int)) AS bit) AS Order_Forwarded,
            CAST(MAX(CAST(request_initialised AS int)) AS bit) AS request_initialised,
            CAST(MAX(CAST(request_processed AS int)) AS bit) AS request_processed
          FROM dbo.sales_order_body
          WHERE sales_order_id = h.sales_order_id
        ) b
        ORDER BY h.voucher_date DESC
      ),
      DerivedStatus AS (
        SELECT 
          sales_order_id,
          CASE
            WHEN has_invoice = 0 THEN
              CASE 
                WHEN Order_Forwarded = 1 THEN 'ALLOCATED_CENTRAL_WAREHOUSE'
                WHEN request_initialised = 1 AND request_processed = 0 THEN 'AWAITING_FACTORY'
                ELSE 'ORDER_RECEIVED'
              END
            ELSE
              CASE
                WHEN DATE_OF_REMOVAL IS NOT NULL THEN 'DELIVERED'
                WHEN confirmed = 1 THEN 'DISPATCH_READY'
                WHEN Order_Forwarded = 1 THEN 'ALLOCATED_CENTRAL_WAREHOUSE'
                WHEN request_initialised = 1 AND request_processed = 0 THEN 'AWAITING_FACTORY'
                ELSE 'IN_PREPARATION'
              END
          END AS status
        FROM OrderSignals
      )
      SELECT status, COUNT(*) AS status_count
      FROM DerivedStatus
      GROUP BY status
      ORDER BY status_count DESC;
    `);
    
    console.table(res.recordset);
    process.exit(0);
  } catch (err) {
    console.error("SQL Error:", err.message);
    process.exit(1);
  }
}

run();
