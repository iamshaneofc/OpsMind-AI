import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createUsers() {
  const usersToCreate = [
    { email: 'admin@opsmindai.com', password: 'opsmind123' },
    { email: 'user@opsmindai.com', password: 'opsmind123' }
  ];

  for (const user of usersToCreate) {
    console.log(`Creating user ${user.email}...`);
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true
    });

    if (error) {
      console.error(`Failed to create ${user.email}:`, error.message);
    } else {
      console.log(`Successfully created user ${user.email} (ID: ${data.user.id})`);
    }
  }
}

createUsers().catch(console.error);
