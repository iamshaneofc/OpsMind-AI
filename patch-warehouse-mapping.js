/**
 * Add base_warehouse_id column to companies table and populate it.
 * Run: node patch-warehouse-mapping.js
 */
const fs = require('fs');
const env = {};
fs.readFileSync('.env', 'utf-8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)/);
  if (m) env[m[1]] = m[2].trim().replace(/\r$/, '');
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// Extract project ref from URL: https://etisrxhknydtcspgufjk.supabase.co
const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
console.log('Project ref:', projectRef);

const restHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
};

async function supabaseFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: restHeaders });
  const text = await res.text();
  try { return JSON.parse(text); } catch(e) { console.error('Parse error:', text); return null; }
}

async function supabasePatch(filter, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?${filter}`, {
    method: 'PATCH', headers: restHeaders, body: JSON.stringify(body)
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch(e) { return text; }
}

// Use Supabase Management API to run DDL SQL
async function runMgmtSQL(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ query: sql })
  });
  const text = await res.text();
  console.log('Mgmt API response:', text);
  try { return JSON.parse(text); } catch(e) { return text; }
}

async function run() {
  console.log('\nStep 1: Add base_warehouse_id column to companies table...');
  const addCol = await runMgmtSQL(`
    ALTER TABLE public.companies 
    ADD COLUMN IF NOT EXISTS base_warehouse_id integer DEFAULT NULL;
  `);
  console.log('Add column result:', JSON.stringify(addCol));

  // Small delay to let schema change propagate
  await new Promise(r => setTimeout(r, 2000));

  console.log('\nStep 2: Set base_warehouse_id=1 (HeadOffice) for all companies...');
  const setAll = await runMgmtSQL(`
    UPDATE public.companies SET base_warehouse_id = 1 WHERE base_warehouse_id IS NULL;
  `);
  console.log('Update result:', JSON.stringify(setAll));

  await new Promise(r => setTimeout(r, 1000));

  console.log('\nStep 3: Verify final state...');
  const final = await supabaseFetch('companies?select=company_id,company_name,erp_account_id,base_warehouse_id&order=company_id.asc');
  if (Array.isArray(final)) {
    final.forEach(c => console.log(`  ID:${c.company_id} | ${c.company_name} | erp_acct=${c.erp_account_id ?? 'null'} | base_wh=${c.base_warehouse_id ?? 'null'}`));
  } else {
    console.log('Final state response:', JSON.stringify(final));
  }

  console.log('\nDone!');
}

run().catch(err => { console.error(err); process.exit(1); });
