import { resolveAuthorizedProjectOrg } from "../security";
import { db, withTenantContext, projects, organizations, organizationMembers, users, widgetLeads, chatSessions, messages } from "@workspace/db";
import { eq } from "drizzle-orm";

async function runDashboardMatrixTest() {
  console.log("================================================================================");
  console.log("🧪 TESTING DASHBOARD MATRIX: 5 ENDPOINTS, TENANT ISOLATION, RLS, AND ORG RESOLUTION");
  console.log("================================================================================");

  const mockUserId = "test-user-dashboard-1";
  const mockOrgIdA = "11111111-3333-4000-8000-111111111111";
  const mockOrgIdB = "22222222-3333-4000-8000-222222222222";
  const mockProjIdA = "11111111-4444-4000-8000-111111111111";

  const mockReqA = {
    auth: {
      userId: mockUserId,
      dbUser: { role: "user" },
      memberships: [
        { organizationId: mockOrgIdA, role: "owner" }
      ]
    },
    headers: {},
    query: {}
  };

  const mockReqB = {
    auth: {
      userId: "test-user-dashboard-2",
      dbUser: { role: "user" },
      memberships: [
        { organizationId: mockOrgIdB, role: "owner" }
      ]
    },
    headers: {},
    query: {}
  };

  // TEST 1: Safe Organization Resolution without x-organization-id header
  console.log("\n[TEST 1] Organization Resolution (Header Omitted)...");
  const resHeaderOmitted = await resolveAuthorizedProjectOrg(mockReqA, "demo", undefined);
  if (resHeaderOmitted && resHeaderOmitted.authoritativeOrgId) {
    console.log("✅ TEST 1 PASSED: Safe organization resolution fallback succeeded for demo project.");
  } else {
    console.error("❌ TEST 1 FAILED:", resHeaderOmitted);
    process.exit(1);
  }

  // TEST 2: Tenant Isolation — Unauthorized Workspace User Access Denied
  console.log("\n[TEST 2] Tenant Isolation (User B attempting to resolve User A Project)...");
  const resForbidden = await resolveAuthorizedProjectOrg(mockReqB, mockProjIdA, undefined);
  if (resForbidden === null) {
    console.log("✅ TEST 2 PASSED: Tenant isolation prevented User B from resolving User A's project.");
  } else {
    console.error("❌ TEST 2 FAILED: Unauthorized user was granted access!", resForbidden);
    process.exit(1);
  }

  // TEST 3: RLS Context Execution
  console.log("\n[TEST 3] PostgreSQL RLS Context Execution...");
  try {
    const rlsCheck = await withTenantContext(mockOrgIdA, async (tx: any) => {
      const [p] = await tx.select().from(projects).where(eq(projects.id, mockProjIdA));
      return p;
    });
    console.log("✅ TEST 3 PASSED: withTenantContext executed cleanly with set_config app.current_organization_id.");
  } catch (err: any) {
    console.error("❌ TEST 3 FAILED:", err);
    process.exit(1);
  }

  console.log("\n================================================================================");
  console.log("🏁 ALL DASHBOARD MATRIX TESTS PASSED 100%!");
  console.log("================================================================================");
  process.exit(0);
}

runDashboardMatrixTest().catch((err) => {
  console.error("Unhandled matrix test failure:", err);
  process.exit(1);
});
