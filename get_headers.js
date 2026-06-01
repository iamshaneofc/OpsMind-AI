const sql = require('mssql');
const fs = require('fs');

async function run() {
  const config = {
    user: 'sa',
    password: 'StrongPassword123',
    server: '98.82.2.100',
    database: process.env.SQL_SERVER_DATABASE || 'SiscoERP',
    options: { encrypt: true, trustServerCertificate: true, connectTimeout: 3000 }
  };
  try {
    const pool = await sql.connect(config);
    const res = await pool.request().query("SELECT TOP 1 * FROM dbo.Sales_Invoice_Header");
    const cols = Object.keys(res.recordset[0] || {});
    fs.writeFileSync('z:/srl-operations-ai/actual_cols.json', JSON.stringify(cols, null, 2));
    process.exit(0);
  } catch (err) {
    fs.writeFileSync('z:/srl-operations-ai/actual_cols_err.txt', String(err));
    process.exit(1);
  }
}
run();
