const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hyjtguabepsmcxknzpwm.supabase.co';
const supabaseKey = 'sb_publishable_Onea3OjCQeqV-xtGsQVJbA_kADLrmoc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLogin() {
  console.log("Attempting to login...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@opsmind.ai',
    password: 'password123',
  });

  if (error) {
    console.error("Login failed:", error.message);
  } else {
    console.log("Login successful!");
    console.log("User ID:", data.user?.id);
    console.log("Access Token:", data.session?.access_token ? "Exists (JWT valid)" : "Missing");
    
    // Now test if we can get the user using the token
    const { data: userData, error: userError } = await supabase.auth.getUser(data.session.access_token);
    
    if (userError) {
      console.error("getUser failed:", userError.message);
    } else {
      console.log("getUser successful! Role:", userData.user?.role);
    }
  }
}

testLogin();
