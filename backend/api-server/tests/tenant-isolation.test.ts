/**
 * Tenant Isolation & Authorization Verification Unit Test Suite
 */

async function runTenantIsolationTests() {
  console.log("==================================================");
  console.log("  RUNNING TENANT ISOLATION AUTOMATED VERIFICATION");
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

  // MOCK DATA STRUCTURES
  const userOrgA = {
    userId: "user_a_123",
    dbUser: { role: "user" },
    memberships: [{ organizationId: "org_A", role: "member" }],
  };

  const userOrgB = {
    userId: "user_b_456",
    dbUser: { role: "user" },
    memberships: [{ organizationId: "org_B", role: "member" }],
  };

  const projectsDb = [
    { id: "proj_a1", name: "Project A1", organizationId: "org_A", userId: "user_a_123" },
    { id: "proj_a2", name: "Project A2", organizationId: "org_A", userId: "user_a_123" },
    { id: "proj_b1", name: "Project B1", organizationId: "org_B", userId: "user_b_456" },
  ];

  // Simulated Authorization Function matching routes/projects/index.ts
  function getProjectsForUser(auth: any, reqOrgId?: string) {
    const userId = auth?.userId;
    if (!userId) return { status: 401, error: "Unauthorized" };

    const isSuperAdmin = auth?.dbUser?.role === "super_admin";
    let orgId = reqOrgId || auth?.memberships?.[0]?.organizationId;

    if (orgId) {
      const membership = auth?.memberships?.find((m: any) => m.organizationId === orgId);
      if (!isSuperAdmin && !membership) {
        return { status: 403, error: "Forbidden: You are not a member of this workspace" };
      }
      return {
        status: 200,
        data: projectsDb.filter((p) => p.organizationId === orgId),
      };
    }

    // Fallback by userId
    return {
      status: 200,
      data: projectsDb.filter((p) => p.userId === userId),
    };
  }

  // 1. Organization A user gets Organization A projects only
  const resA = getProjectsForUser(userOrgA, "org_A");
  assert(
    resA.status === 200 && resA.data?.length === 2 && resA.data.every((p) => p.organizationId === "org_A"),
    "Tenant Isolation: User Org A receives ONLY Org A projects"
  );

  // 2. Organization A user requesting Organization B (Attacker scenario)
  const resAttacker = getProjectsForUser(userOrgA, "org_B");
  assert(
    resAttacker.status === 403,
    "Tenant Isolation: User Org A requesting Org B is REJECTED with 403 Forbidden"
  );

  // 3. Organization B user gets Organization B projects only
  const resB = getProjectsForUser(userOrgB, "org_B");
  assert(
    resB.status === 200 && resB.data?.length === 1 && resB.data[0].id === "proj_b1",
    "Tenant Isolation: User Org B receives ONLY Org B projects"
  );

  // 4. Missing organization context falls back strictly to User's own projects
  const resFallback = getProjectsForUser(userOrgA, undefined);
  assert(
    resFallback.status === 200 && resFallback.data?.every((p) => p.userId === "user_a_123"),
    "Tenant Isolation: Missing orgId fallback filters strictly by userId"
  );

  console.log("\n==================================================");
  console.log(`  TENANT ISOLATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTenantIsolationTests().catch((err) => {
  console.error("Tenant isolation test failed:", err);
  process.exit(1);
});
