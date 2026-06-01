require('dotenv').config({path: '.env.local'});
const sql = require('mssql');
(async () => {
  const pool = await sql.connect({
    server: process.env.SQL_SERVER_HOST,
    user: process.env.SQL_SERVER_USER,
    password: process.env.SQL_SERVER_PASSWORD,
    database: process.env.SQL_SERVER_DATABASE,
    options: { encrypt: true, trustServerCertificate: true }
  });
  const res = await pool.request().query("SELECT TOP 1 * FROM dbo.Sales_Invoice_Header");
  console.log("Sales_Invoice_Header cols: ", Object.keys(res.recordset[0] || {}).join(', '));
  process.exit(0);
})();
