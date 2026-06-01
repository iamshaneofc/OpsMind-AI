const fs = require('fs');
const env = {};
fs.readFileSync('.env', 'utf-8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)/);
  if (m) env[m[1]] = m[2].trim().replace(/\r$/, '');
});
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function check() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/companies`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }});
  const data = await res.json();
  fs.writeFileSync('db-result.txt', JSON.stringify(data, null, 2));
}
check().catch(e => console.log(e));
