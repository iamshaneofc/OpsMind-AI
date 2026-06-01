require('dotenv').config({path: '.env'});
const sql = require('mssql');

async function run() {
  const config = {
    user: 'sa',
    password: 'StrongPassword123',
    server: '98.82.2.100',
    database: process.env.SQL_SERVER_DATABASE || 'SiscoERP',
    options: { encrypt: true, trustServerCertificate: true }
  };
  try {
    const pool = await sql.connect(config);
    const orderVoucher = '11.105.260129.34';
    const res = await pool.request().query(`
      SELECT DISTINCT h.voucher_number, h.voucher_date, h.INVOICE_AMOUNT 
      FROM dbo.Sales_Invoice_Header h
      JOIN dbo.Sales_Invoice_Body b ON b.sales_invoice_header_id = h.sales_invoice_header_id
      JOIN dbo.sales_order_body sob ON sob.sales_order_body_id = b.sales_order_body_id
      JOIN dbo.sales_order_header soh ON soh.sales_order_id = sob.sales_order_id
      WHERE LTRIM(RTRIM(CAST(soh.voucher_number AS NVARCHAR(200)))) = '${orderVoucher}'
      ORDER BY h.voucher_date DESC
    `);
    console.log(JSON.stringify(res.recordset, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
