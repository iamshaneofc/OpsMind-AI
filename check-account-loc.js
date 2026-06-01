const fs = require('fs');
const sql = require('mssql');
const env = {};
fs.readFileSync('.env', 'utf-8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)/);
  if (m) env[m[1]] = m[2].trim().replace(/\r$/, '');
});

const sqlConfig = {
  server: env.SQL_SERVER_HOST,
  port: Number(env.SQL_SERVER_PORT) || 1433,
  user: env.SQL_SERVER_USER,
  password: env.SQL_SERVER_PASSWORD,
  database: env.SQL_SERVER_DATABASE,
  options: { encrypt: true, trustServerCertificate: true }
};

async function check() {
  const pool = await sql.connect(sqlConfig);

  // Check which Location_id Krisshna Enterprise orders go to (account_id=396)
  const krishnaOrders = await pool.request().query(`
    SELECT TOP 5 h.voucher_number, h.analysis_id, l.Description as Location
    FROM dbo.sales_order_header h
    LEFT JOIN dbo.Location l ON l.Location_id = h.analysis_id
    WHERE h.account_id = 396
    ORDER BY h.voucher_date DESC
  `);
  
  // Check which Location_id Viraj Life Science orders go to (account_id=38085)
  const virajOrders = await pool.request().query(`
    SELECT TOP 5 h.voucher_number, h.analysis_id, l.Description as Location
    FROM dbo.sales_order_header h
    LEFT JOIN dbo.Location l ON l.Location_id = h.analysis_id
    WHERE h.account_id = 38085
    ORDER BY h.voucher_date DESC
  `);

  const result = {
    krishna_enterprise_orders: krishnaOrders.recordset,
    viraj_life_science_orders: virajOrders.recordset
  };
  fs.writeFileSync('account-location.txt', JSON.stringify(result, null, 2));
  await pool.close();
}
check().catch(e => { fs.writeFileSync('account-location.txt', String(e)); });
