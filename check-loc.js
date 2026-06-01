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
  const wRes = await pool.request().query('SELECT Location_id, Description FROM dbo.Location');
  fs.writeFileSync('location-result.txt', JSON.stringify(wRes.recordset, null, 2));
  await pool.close();
}
check().catch(e => console.log(e));
