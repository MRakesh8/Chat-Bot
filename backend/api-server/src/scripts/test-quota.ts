import { db, projects, users, organizationUsage, organizations, withBypassRLS } from "@workspace/db";
import { eq } from "drizzle-orm";
import { checkAndIncrementUsage } from "../security/quota";
import crypto from "crypto";

async function runTests() {
  console.log("=== STARTING QUOTA TESTS ===");
  const testUserId = crypto.randomUUID();
  const testOrgId = crypto.randomUUID();
  const testProjectId = crypto.randomUUID();

  try {
    await withBypassRLS(async (tx: any) => {
      await tx.insert(users).values({ id: testUserId, email: `test-quota-${Date.now()}@example.com`, role: "user" });
      await tx.insert(organizations).values({ id: testOrgId, name: "Quota Org" });
      await tx.insert(projects).values({ id: testProjectId, userId: testUserId, organizationId: testOrgId, name: "Quota Test" });
    });
    console.log("✓ Setup complete");

    // 1. Initial increment
    const check1 = await checkAndIncrementUsage(testProjectId, "action", 1);
    console.log("1. First usage:", check1);
    if (!check1.allowed) throw new Error("Fail: Initial usage should be allowed");

    // 2. Consume almost all (Trial limits 50 for actions)
    const consume = await checkAndIncrementUsage(testProjectId, "action", 49);
    console.log("2. Consume 49:", consume);
    if (!consume.allowed) throw new Error("Fail: Should allow 49 actions");

    // 3. Exceed quota
    const exceed = await checkAndIncrementUsage(testProjectId, "action", 1);
    console.log("3. Exceed limit:", exceed);
    if (exceed.allowed) throw new Error("Fail: Should exceed quota (limit is 50)");

    // 4. Super Admin Bypass
    const superBypass = await checkAndIncrementUsage(testProjectId, "action", 100, true);
    console.log("4. Super Admin Bypass:", superBypass);
    if (!superBypass.allowed) throw new Error("Fail: Super Admin should bypass quota");

    console.log("=== ALL QUOTA TESTS PASSED ===");
  } catch (err) {
    console.error("Test Failed:", err);
    process.exit(1);
  } finally {
    await withBypassRLS(async (tx: any) => {
      await tx.delete(projects).where(eq(projects.id, testProjectId));
      await tx.delete(organizationUsage).where(eq(organizationUsage.organizationId, testOrgId));
      await tx.delete(organizations).where(eq(organizations.id, testOrgId));
      await tx.delete(users).where(eq(users.id, testUserId));
    });
    process.exit(0);
  }
}
runTests();
