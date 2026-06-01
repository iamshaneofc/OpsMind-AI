import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function testCompanies() {
  console.log("Testing companies table access...");
  
  // Try to get all companies
  const { data, error } = await admin.from("companies").select("*").limit(5);
  
  if (error) {
    console.error("Error querying companies:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    console.error("Error details:", error.details);
    return;
  }
  
  console.log("Companies found:", data?.length || 0);
  if (data && data.length > 0) {
    console.log("First company:", JSON.stringify(data[0], null, 2));
  }
  
  // Try to insert a test company
  console.log("\nTrying to insert test company...");
  const { data: newCompany, error: insertError } = await admin
    .from("companies")
    .insert({ name: "TEST COMPANY" })
    .select("id, name")
    .single();
  
  if (insertError) {
    console.error("Error inserting company:", insertError);
    console.error("Error code:", insertError.code);
    console.error("Error message:", insertError.message);
  } else {
    console.log("Successfully inserted:", newCompany);
    
    // Clean up - delete test company
    await admin.from("companies").delete().eq("id", newCompany.id);
    console.log("Test company deleted");
  }
}

testCompanies().catch(console.error);
