import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireEnv } from "./_env.mjs";

loadLocalEnv();

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Link invoices to companies based on customer name matching
 */
async function linkInvoicesToCompanies() {
  console.log("=".repeat(80));
  console.log("LINKING INVOICES TO COMPANIES");
  console.log("=".repeat(80));
  console.log();

  try {
    // Step 1: Get all companies
    console.log("Step 1: Fetching companies...");
    const { data: companies, error: companiesError } = await admin
      .from("companies")
      .select("company_id, company_name")
      .order("company_id");

    if (companiesError) {
      throw companiesError;
    }

    console.log(`  Found ${companies?.length || 0} companies`);
    companies?.forEach((c) => {
      console.log(`    - ${c.company_name} (ID: ${c.company_id})`);
    });

    // Step 2: Get all invoices without company_id
    console.log("\nStep 2: Fetching invoices without company_id...");
    const { data: invoices, error: invoicesError } = await admin
      .from("invoices")
      .select("id, invoice_number, customer_full_name, company_id")
      .is("company_id", null)
      .limit(1000);

    if (invoicesError) {
      throw invoicesError;
    }

    console.log(`  Found ${invoices?.length || 0} invoices without company_id`);

    if (!invoices || invoices.length === 0) {
      console.log("\n✅ All invoices already have company_id!");
      return;
    }

    // Step 3: Create matching function
    function findMatchingCompany(customerName, companies) {
      if (!customerName) return null;

      // Normalize customer name for matching
      const normalizedCustomer = customerName.toLowerCase().trim();

      // Try exact match first
      let match = companies.find(
        (c) => c.company_name?.toLowerCase().trim() === normalizedCustomer
      );
      if (match) return match;

      // Try partial match (customer name contains company name or vice versa)
      match = companies.find((c) => {
        const normalizedCompany = c.company_name?.toLowerCase().trim() || "";
        return (
          normalizedCustomer.includes(normalizedCompany) ||
          normalizedCompany.includes(normalizedCustomer)
        );
      });
      if (match) return match;

      // Try keyword matching for known companies
      if (normalizedCustomer.includes("krisshna")) {
        match = companies.find((c) =>
          c.company_name?.toLowerCase().includes("krisshna")
        );
        if (match) return match;
      }

      if (normalizedCustomer.includes("viraj")) {
        match = companies.find((c) =>
          c.company_name?.toLowerCase().includes("viraj")
        );
        if (match) return match;
      }

      return null;
    }

    // Step 4: Match invoices to companies
    console.log("\nStep 3: Matching invoices to companies...");
    const matches = [];
    const unmatched = [];

    for (const invoice of invoices) {
      const customerName = invoice.customer_full_name;
      const matchingCompany = findMatchingCompany(customerName, companies);

      if (matchingCompany) {
        matches.push({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          customer_name: customerName,
          company_id: matchingCompany.company_id,
          company_name: matchingCompany.company_name,
        });
      } else {
        unmatched.push({
          invoice_number: invoice.invoice_number,
          customer_name: customerName,
        });
      }
    }

    console.log(`  Matched: ${matches.length} invoices`);
    console.log(`  Unmatched: ${unmatched.length} invoices`);

    if (matches.length > 0) {
      console.log("\n  Sample matches:");
      matches.slice(0, 5).forEach((m) => {
        console.log(
          `    - Invoice ${m.invoice_number} → ${m.company_name} (ID: ${m.company_id})`
        );
      });
    }

    if (unmatched.length > 0) {
      console.log("\n  Unmatched invoices (will not be updated):");
      unmatched.slice(0, 10).forEach((u) => {
        console.log(`    - ${u.invoice_number}: ${u.customer_name}`);
      });
    }

    // Step 5: Update invoices with company_id
    if (matches.length > 0) {
      console.log("\nStep 4: Updating invoices with company_id...");
      let updated = 0;
      let errors = 0;

      // Group by company_id for batch updates
      const byCompany = new Map();
      matches.forEach((m) => {
        if (!byCompany.has(m.company_id)) {
          byCompany.set(m.company_id, []);
        }
        byCompany.get(m.company_id).push(m.invoice_id);
      });

      for (const [companyIdInteger, invoiceIds] of byCompany.entries()) {
        try {
          // Since companies table uses integer company_id and invoices.company_id might be UUID or integer,
          // we'll try using the integer directly first
          // If that fails, we'll check for a UUID id column
          
          let companyIdToUse = companyIdInteger;
          
          // Try to get UUID id if it exists
          try {
            const { data: company, error: companyError } = await admin
              .from("companies")
              .select("company_id")
              .eq("company_id", companyIdInteger)
              .maybeSingle();
            
            // Check if companies table has UUID id column by trying to select it
            const { data: companyWithId } = await admin
              .from("companies")
              .select("company_id, id")
              .eq("company_id", companyIdInteger)
              .maybeSingle()
              .catch(() => ({ data: null }));
            
            if (companyWithId?.id) {
              companyIdToUse = companyWithId.id;
            }
          } catch (err) {
            // If UUID id doesn't exist, use integer
            companyIdToUse = companyIdInteger;
          }

          const { error: updateError } = await admin
            .from("invoices")
            .update({ company_id: companyIdToUse })
            .in("id", invoiceIds);

          if (updateError) {
            console.error(
              `  ❌ Error updating invoices for company ${companyIdInteger}:`,
              updateError.message
            );
            errors += invoiceIds.length;
          } else {
            updated += invoiceIds.length;
            console.log(
              `  ✓ Updated ${invoiceIds.length} invoices for company ${companyIdInteger}`
            );
          }
        } catch (err) {
          console.error(
            `  ❌ Error updating invoices for company ${companyIdInteger}:`,
            err.message
          );
          errors += invoiceIds.length;
        }
      }

      console.log(`\n  ✅ Successfully updated: ${updated} invoices`);
      if (errors > 0) {
        console.log(`  ⚠️  Errors: ${errors} invoices`);
      }
    }

    // Step 6: Summary
    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total invoices processed: ${invoices.length}`);
    console.log(`Matched and updated: ${matches.length}`);
    console.log(`Unmatched: ${unmatched.length}`);
    console.log("\n✅ Invoice linking complete!");

    // Step 7: Verify
    console.log("\nStep 5: Verifying updates...");
    const { data: invoicesWithCompany, error: verifyError } = await admin
      .from("invoices")
      .select("id, invoice_number, company_id")
      .not("company_id", "is", null)
      .limit(10);

    if (!verifyError && invoicesWithCompany) {
      console.log(`  ✓ Verified: ${invoicesWithCompany.length} invoices now have company_id`);
      invoicesWithCompany.slice(0, 5).forEach((inv) => {
        console.log(`    - ${inv.invoice_number}: company_id = ${inv.company_id}`);
      });
    }

  } catch (error) {
    console.error("\n❌ Error linking invoices to companies:", error);
    throw error;
  }
}

// Run the script
linkInvoicesToCompanies()
  .then(() => {
    console.log("\n✅ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
