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
    console.log("Setup complete");

    // Limit is 50 for trial actions. We will try to do 100 concurrent requests of 1 action each.
    console.log("Starting concurrency test (100 parallel requests)...");
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(checkAndIncrementUsage(testProjectId, "action", 1));
    }
    const results = await Promise.all(promises);
    const successCount = results.filter((r) => r.allowed).length;
    const failCount = results.filter((r) => !r.allowed).length;
    console.log(`Success: ${successCount}, Fail: ${failCount}`);
    
    if (successCount !== 50) {
      throw new Error(`Fail: Expected exactly 50 allowed requests, got ${successCount}`);
    }
    
    // Verify usage doesn't go above 50
    const [usage] = await db.select().from(organizationUsage).where(eq(organizationUsage.organizationId, testOrgId));
    console.log("Final Action Count in DB:", usage.actionCount);
    if (usage.actionCount > 50) {
      throw new Error("Fail: DB action count exceeded 50!");
    }
    
    // Verify negative doesn't happen (it shouldn't here)

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
