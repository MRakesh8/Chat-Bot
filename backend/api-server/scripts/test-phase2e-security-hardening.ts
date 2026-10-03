import { providerRegistry } from "../src/services/integrations/provider-registry";
import { ShopifyProvider } from "../src/services/integrations/providers/shopify";
import { executeServerTool } from "../src/services/tool-execution";
import { db, crypto } from "@workspace/db";
import {
  projects,
  organizations,
  organizationMembers,
  projectIntegrations,
  integrationTools,
  users,
  enterpriseAuditLogs,
  projectEntitlements,
  projectQuotas
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

if (!providerRegistry.hasProvider("shopify")) {
  providerRegistry.register(new ShopifyProvider());
}

async function runSecurityHardeningTests() {
  console.log("=================================================");
  console.log("  PHASE 2E SECURITY HARDENING & AUDIT TEST SUITE ");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`, detail || "");
      failed++;
    }
  }

  try {
    // ─── SETUP FIXTURES FOR ORG A AND ORG B ───────────────────────────────────
    const [userA] = await db.insert(users).values({ email: `userA-${Date.now()}@example.com`, role: "user" }).returning();
    const [userB] = await db.insert(users).values({ email: `userB-${Date.now()}@example.com`, role: "user" }).returning();

    const [orgA] = await db.insert(organizations).values({ name: "Org A" }).returning();
    const [orgB] = await db.insert(organizations).values({ name: "Org B" }).returning();

    await db.insert(organizationMembers).values([
      { organizationId: orgA.id, userId: userA.id, role: "owner" },
      { organizationId: orgB.id, userId: userB.id, role: "owner" }
    ]);

    const [projA] = await db.insert(projects).values({ userId: userA.id, organizationId: orgA.id, name: "Project A" }).returning();
    const [projB] = await db.insert(projects).values({ userId: userB.id, organizationId: orgB.id, name: "Project B" }).returning();

    // 1. Create Integration & Tool for Org A
    const encryptedCredsA = crypto.encrypt(JSON.stringify({ shop: "store-a.myshopify.com", accessToken: "shpat_test_a" }));
    const [integA] = await db.insert(projectIntegrations).values({
      projectId: projA.id,
      provider: "shopify",
      status: "AUTHORIZED",
      encryptedCredentials: encryptedCredsA
    }).returning();

    const [toolA] = await db.insert(integrationTools).values({
      integrationId: integA.id,
      projectId: projA.id,
      actionName: "shopify_get_products",
      description: "Get products for store A",
      riskLevel: "READ_ONLY",
      isEnabled: true,
      status: "EXECUTABLE"
    }).returning();

    // 2. Create Integration & Tool for Org B
    const encryptedCredsB = crypto.encrypt(JSON.stringify({ shop: "store-b.myshopify.com", accessToken: "shpat_test_b" }));
    const [integB] = await db.insert(projectIntegrations).values({
      projectId: projB.id,
      provider: "shopify",
      status: "AUTHORIZED",
      encryptedCredentials: encryptedCredsB
    }).returning();

    const [toolB] = await db.insert(integrationTools).values({
      integrationId: integB.id,
      projectId: projB.id,
      actionName: "shopify_get_products",
      description: "Get products for store B",
      riskLevel: "READ_ONLY",
      isEnabled: true,
      status: "EXECUTABLE"
    }).returning();

    // ─── TEST 1: LEGITIMATE OWNER EXECUTION ──────────────────────────────────
    console.log("[SECURITY TEST 1] User A executing Tool A in Project A...");
    const resLegit = await executeServerTool({
      projectId: projA.id,
      orgId: orgA.id,
      userId: userA.id,
      toolId: toolA.id,
      input: { limit: 10 }
    });
    assert(resLegit.toolExecuted === "shopify_get_products", "User A successfully executed Tool A in Project A");

    // ─── TEST 2: CROSS-TENANT USER EXECUTION (USER A -> PROJECT B) ────────────
    console.log("\n[SECURITY TEST 2] Cross-Tenant Execution (User A -> Project B / Tool B)...");
    const resCrossUser = await executeServerTool({
      projectId: projB.id,
      orgId: orgB.id,
      userId: userA.id,
      toolId: toolB.id,
      input: { limit: 10 }
    });
    assert(!resCrossUser.success && resCrossUser.status === "FORBIDDEN", "User A execution in Project B blocked with FORBIDDEN", resCrossUser);

    // ─── TEST 3: PROJECT MISMATCH (PROJECT A -> TOOL B) ──────────────────────
    console.log("\n[SECURITY TEST 3] Tool Mismatch (Project A requesting Tool B)...");
    const resToolMismatch = await executeServerTool({
      projectId: projA.id,
      orgId: orgA.id,
      userId: userA.id,
      toolId: toolB.id,
      input: { limit: 10 }
    });
    assert(!resToolMismatch.success && resToolMismatch.status === "FORBIDDEN", "Executing Tool B under Project A blocked with FORBIDDEN", resToolMismatch);

    // ─── TEST 4: EXPIRED ENTITLEMENT BLOCKS EXECUTION ─────────────────────────
    console.log("\n[SECURITY TEST 4] Expired Entitlement Block...");
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await db.insert(projectEntitlements).values({
      projectId: projA.id,
      trialStartedAt: pastDate,
      trialEndsAt: pastDate,
      entitlementStatus: "TRIAL_EXPIRED"
    }).onConflictDoUpdate({
      target: projectEntitlements.projectId,
      set: { entitlementStatus: "TRIAL_EXPIRED", trialEndsAt: pastDate }
    });

    const resExpired = await executeServerTool({
      projectId: projA.id,
      orgId: orgA.id,
      userId: userA.id,
      toolId: toolA.id,
      input: { limit: 10 }
    });
    assert(!resExpired.success && resExpired.status === "ENTITLEMENT_EXPIRED", "Tool execution blocked when entitlement expired", resExpired);

    // Reset entitlement to active for remaining tests
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await db.update(projectEntitlements).set({
      entitlementStatus: "TRIAL_ACTIVE",
      trialEndsAt: futureDate
    }).where(eq(projectEntitlements.projectId, projA.id));

    // ─── TEST 5: CREDENTIAL SECURITY & MASKING ──────────────────────────────
    console.log("\n[SECURITY TEST 5] Credential Encryption & Masking Verification...");
    const integInDb = await db.query.projectIntegrations.findFirst({ where: eq(projectIntegrations.id, integA.id) });
    const isEncrypted = integInDb?.encryptedCredentials !== null && integInDb?.encryptedCredentials !== JSON.stringify({ shop: "store-a.myshopify.com", accessToken: "shpat_test_a" });
    const decrypted = JSON.parse(crypto.decrypt(integInDb!.encryptedCredentials!));
    assert(isEncrypted && decrypted.accessToken === "shpat_test_a", "Credentials are encrypted at rest and decrypt correctly server-side");

    // ─── TEST 6: AUDIT LOG CREATION ──────────────────────────────────────────
    console.log("\n[SECURITY TEST 6] Enterprise Audit Logging Verification...");
    const logs = await db.select().from(enterpriseAuditLogs).where(eq(enterpriseAuditLogs.projectId, projA.id));
    const hasLogEntry = logs.length > 0;
    const logNoSecrets = logs.every((l: any) => !JSON.stringify(l.details).includes("shpat_"));
    assert(hasLogEntry && logNoSecrets, "Audit log created without leaking access tokens", logs);

    // ─── CLEANUP ─────────────────────────────────────────────────────────────
    await db.delete(enterpriseAuditLogs).where(eq(enterpriseAuditLogs.projectId, projA.id));
    await db.delete(projectEntitlements).where(eq(projectEntitlements.projectId, projA.id));
    await db.delete(projectEntitlements).where(eq(projectEntitlements.projectId, projB.id));
    await db.delete(integrationTools).where(eq(integrationTools.projectId, projA.id));
    await db.delete(integrationTools).where(eq(integrationTools.projectId, projB.id));
    await db.delete(projectIntegrations).where(eq(projectIntegrations.projectId, projA.id));
    await db.delete(projectIntegrations).where(eq(projectIntegrations.projectId, projB.id));
    await db.delete(projects).where(eq(projects.id, projA.id));
    await db.delete(projects).where(eq(projects.id, projB.id));
    await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, orgA.id));
    await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, orgB.id));
    await db.delete(organizations).where(eq(organizations.id, orgA.id));
    await db.delete(organizations).where(eq(organizations.id, orgB.id));
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));

  } catch (err: any) {
    console.error("❌ Exception during security hardening tests:", err);
    failed++;
  }

  console.log("\n=================================================");
  console.log(`SECURITY HARDENING TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityHardeningTests().catch(console.error);
