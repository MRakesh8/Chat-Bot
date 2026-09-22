/**
 * Cross-Tenant Isolation & RLS Transaction Context Verification Test Suite
 */

import { withTenantContext, withBypassRLS } from "@workspace/db";
import { projects, connectedServices } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

async function runVerification() {
  console.log("==================================================");
  console.log("  RUNNING RLS TENANT CONTEXT PROGRAMMATIC TESTS   ");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✓ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAILED: ${testName}`);
      failed++;
    }
  }

  // 1. Test fail-closed validation when orgId is empty or whitespace
  try {
    await withTenantContext("", async () => {});
    assert(false, "Fail-closed check: withTenantContext('') should throw Error");
  } catch (err: any) {
    assert(
      err.message.includes("Missing organizationId"),
      "Fail-closed check: withTenantContext('') correctly throws error on empty orgId"
    );
  }

  try {
    await withTenantContext("   ", async () => {});
    assert(false, "Fail-closed check: withTenantContext('   ') should throw Error");
  } catch (err: any) {
    assert(
      err.message.includes("Missing organizationId"),
      "Fail-closed check: withTenantContext('   ') correctly throws error on whitespace orgId"
    );
  }

  // Dummy Org IDs for isolation testing
  const dummyOrgA = "11111111-1111-1111-1111-111111111111";
  const dummyOrgB = "22222222-2222-2222-2222-222222222222";

  // 2. Test SQL set_config parameterization inside transaction
  try {
    const resA = await withTenantContext(dummyOrgA, async (tx) => {
      return await tx.select().from(projects).where(eq(projects.organizationId, dummyOrgA));
    });
    assert(Array.isArray(resA), "set_config query execution: returns valid array within withTenantContext(dummyOrgA)");
  } catch (err: any) {
    assert(false, `set_config query execution failed: ${err.message}`);
  }

  // 3. Test that Org A context cannot query Org B records
  try {
    const crossTenantProjects = await withTenantContext(dummyOrgA, async (tx) => {
      return await tx.select().from(projects).where(eq(projects.organizationId, dummyOrgB));
    });
    assert(
      crossTenantProjects.length === 0,
      "Tenant Isolation: Org A context querying Org B projects returns 0 records"
    );
  } catch (err: any) {
    assert(false, `Cross-tenant read test error: ${err.message}`);
  }

  // 4. Test Services RLS boundary
  try {
    const crossTenantServices = await withTenantContext(dummyOrgA, async (tx) => {
      return await tx.select().from(connectedServices).where(eq(connectedServices.organizationId, dummyOrgB));
    });
    assert(
      crossTenantServices.length === 0,
      "Tenant Isolation: Org A context querying Org B connected_services returns 0 records"
    );
  } catch (err: any) {
    assert(false, `Services cross-tenant read test error: ${err.message}`);
  }

  console.log("\n==================================================");
  console.log(`  VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error("Verification suite failed:", err);
  process.exit(1);
});
