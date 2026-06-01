require('dotenv').config({path: '.env.local'});
const sql = require('mssql');
const fs = require('fs');
(async () => {
  try {
    const pool = await sql.connect({
      server: process.env.SQL_SERVER_HOST || '98.82.2.100',
      user: process.env.SQL_SERVER_USER || 'sa',
      password: process.env.SQL_SERVER_PASSWORD || 'StrongPassword123',
      database: process.env.SQL_SERVER_DATABASE || 'SiscoERP',
      options: { encrypt: true, trustServerCertificate: true }
    });
    
    const res = await pool.request().query("SELECT TOP 1 * FROM dbo.Sales_Invoice_Header");
    const cols = Object.keys(res.recordset[0] || {});
    fs.writeFileSync('z:/opsmind-operations-ai/invoice_cols.txt', JSON.stringify(cols, null, 2));
    
    // Also check sales_order_header just in case
    const res2 = await pool.request().query("SELECT TOP 1 * FROM dbo.sales_order_header");
    const cols2 = Object.keys(res2.recordset[0] || {});
    fs.writeFileSync('z:/opsmind-operations-ai/order_cols.txt', JSON.stringify(cols2, null, 2));

    process.exit(0);
  } catch (err) {
    fs.writeFileSync('z:/opsmind-operations-ai/invoice_cols_error.txt', String(err));
    process.exit(1);
  }
})();
