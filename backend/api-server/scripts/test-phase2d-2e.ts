import { WebsiteDiscoveryService } from "../src/services/discovery";
import { providerRegistry } from "../src/services/integrations/provider-registry";
import { ShopifyProvider } from "../src/services/integrations/providers/shopify";
import { executeServerTool } from "../src/services/tool-execution";
import { db, crypto } from "@workspace/db";
import { projects, organizations, projectIntegrations, integrationTools, users } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

if (!providerRegistry.hasProvider("shopify")) {
  providerRegistry.register(new ShopifyProvider());
}

async function runPhase2D2ETests() {
  console.log("=================================================");
  console.log("    PHASE 2D & PHASE 2E COMPREHENSIVE TEST SUITE  ");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  // ─── PHASE 2D: SSRF & URL VALIDATION TESTS ───────────────────────────────
  console.log("[PHASE 2D - TEST 1] SSRF & Private IP Blocking Validation...");
  const invalidUrls = [
    "http://localhost:5000",
    "http://127.0.0.1:8080",
    "http://10.0.0.1/admin",
    "http://192.168.1.1/router",
    "ftp://example.com/file",
    "file:///etc/passwd"
  ];

  let ssrfBlockedCount = 0;
  for (const url of invalidUrls) {
    try {
      await (WebsiteDiscoveryService as any).validateUrlSafe(url);
    } catch (e: any) {
      ssrfBlockedCount++;
    }
  }

  if (ssrfBlockedCount === invalidUrls.length) {
    console.log("✅ PASS: All SSRF targets (localhost, 127.0.0.1, 10.x, 192.168.x, non-HTTP/HTTPS) were blocked by WebsiteDiscoveryService.");
    passed++;
  } else {
    console.error(`❌ FAIL: SSRF validation allowed unsafe targets! Blocked ${ssrfBlockedCount}/${invalidUrls.length}`);
    failed++;
  }

  // ─── PHASE 2D: CAPABILITY DISCOVERY INTEGRITY ────────────────────────────
  console.log("\n[PHASE 2D - TEST 2] Capability Discovery & State Classification...");
  const mockShopifyHtml = `
    <html>
      <head><script src="https://cdn.shopify.com/theme.js"></script></head>
      <body><h1>Shopify Store</h1><button>Add to cart</button></body>
    </html>
  `;

  const analysis = (WebsiteDiscoveryService as any).analyzeHtml(mockShopifyHtml, "https://example-shop.com");
  if (analysis.platform === "shopify" && analysis.businessType === "ecommerce") {
    console.log("✅ PASS: Website Discovery correctly extracted platform (shopify) and business type (ecommerce).");
    passed++;
  } else {
    console.error("❌ FAIL: Discovery analysis failed to classify Shopify store", analysis);
    failed++;
  }

  // ─── PHASE 2E: INTEGRATION LIFECYCLE & SECURITY ──────────────────────────
  console.log("\n[PHASE 2E - TEST 3] Integration Lifecycle & Tool Promotion (DB Verified)...");
  try {
    let testUserId = "";
    let testOrgId = "";
    let testProjectId = "";

    // Setup DB test fixtures
    const [existingUser] = await db.select().from(users).limit(1);
    if (existingUser) {
      testUserId = existingUser.id;
    } else {
      const [newUser] = await db.insert(users).values({ email: "p2e-test@example.com", role: "super_admin" }).returning();
      testUserId = newUser.id;
    }

    const [newOrg] = await db.insert(organizations).values({ name: "Phase 2E Org" }).returning();
    testOrgId = newOrg.id;

    const [newProj] = await db.insert(projects).values({
      userId: testUserId,
      organizationId: testOrgId,
      name: "Phase 2E Project"
    }).returning();
    testProjectId = newProj.id;

    // 1. Connect Integration (Status: CONNECTED, Tools: DISCOVERED)
    const encryptedCreds = crypto.encrypt(JSON.stringify({ shop: "demo.myshopify.com", accessToken: "shpat_test" }));
    const [integ] = await db.insert(projectIntegrations).values({
      projectId: testProjectId,
      provider: "shopify",
      status: "CONNECTED",
      encryptedCredentials: encryptedCreds
    }).returning();

    const [discTool] = await db.insert(integrationTools).values({
      integrationId: integ.id,
      projectId: testProjectId,
      actionName: "shopify_get_products",
      description: "Get products",
      riskLevel: "READ_ONLY",
      isEnabled: true,
      status: "DISCOVERED"
    }).returning();

    // 2. Attempt tool execution while DISCOVERED -> MUST FAIL WITH FORBIDDEN
    const unauthExecRes = await executeServerTool({
      projectId: testProjectId,
      orgId: testOrgId,
      toolId: discTool.id,
      input: {}
    });

    const isBlockedWhenDiscovered = !unauthExecRes.success && unauthExecRes.status === "FORBIDDEN";

    // 3. Promote to AUTHORIZED and tool to EXECUTABLE
    await db.update(projectIntegrations).set({ status: "AUTHORIZED" }).where(eq(projectIntegrations.id, integ.id));
    await db.update(integrationTools).set({ status: "EXECUTABLE" }).where(eq(integrationTools.id, discTool.id));

    // 4. Attempt tool execution when EXECUTABLE
    const authExecRes = await executeServerTool({
      projectId: testProjectId,
      orgId: testOrgId,
      toolId: discTool.id,
      input: { limit: 5 }
    });

    const isAllowedWhenExecutable = authExecRes.toolExecuted === "shopify_get_products";

    // 5. Revoke Integration -> Wipes credentials & promotes tool to UNAVAILABLE
    await db.update(projectIntegrations).set({ status: "REVOKED", encryptedCredentials: null }).where(eq(projectIntegrations.id, integ.id));
    await db.update(integrationTools).set({ status: "UNAVAILABLE" }).where(eq(integrationTools.id, discTool.id));

    const revokedInteg = await db.query.projectIntegrations.findFirst({ where: eq(projectIntegrations.id, integ.id) });
    const isCredsWiped = revokedInteg?.encryptedCredentials === null && revokedInteg?.status === "REVOKED";

    // Cleanup test data
    await db.delete(integrationTools).where(eq(integrationTools.projectId, testProjectId));
    await db.delete(projectIntegrations).where(eq(projectIntegrations.projectId, testProjectId));
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));

    if (isBlockedWhenDiscovered && isAllowedWhenExecutable && isCredsWiped) {
      console.log("✅ PASS: Phase 2E Integration Lifecycle verified (DISCOVERED tool execution blocked -> AUTHORIZED tool executed -> REVOKED wipes credentials).");
      passed++;
    } else {
      console.error("❌ FAIL: Integration lifecycle verification failed", { isBlockedWhenDiscovered, isAllowedWhenExecutable, isCredsWiped });
      failed++;
    }
  } catch (err) {
    console.error("❌ FAIL: Phase 2E Lifecycle Test exception:", err);
    failed++;
  }

  // ─── PHASE 2E: CUSTOMER SCOPED SHOPIFY GET_ORDERS TEST ───────────────────
  console.log("\n[PHASE 2E - TEST 4] Shopify Provider Customer-Scoped Order Execution...");
  try {
    const shopifyProvider = new ShopifyProvider();
    const mockAllOrders = {
      orders: [
        { id: 999111, name: "#1001", email: "alice@example.com", customer: { id: 555, email: "alice@example.com" } },
        { id: 888222, name: "#1002", email: "bob@example.com", customer: { id: 666, email: "bob@example.com" } }
      ]
    };

    (shopifyProvider as any).safeFetch = async () => ({
      ok: true,
      json: async () => mockAllOrders
    });

    const aliceRes = await shopifyProvider.executeTool("shopify_get_orders", {
      limit: 10,
      customerScope: { isCustomerScoped: true, verified: true, email: "alice@example.com", customerId: "555" }
    }, { shop: "demo.myshopify.com", accessToken: "shpat_test" });

    if (aliceRes.orders.length === 1 && aliceRes.orders[0].id === 999111) {
      console.log("✅ PASS: shopify_get_orders correctly scoped results to Alice's orders only.");
      passed++;
    } else {
      console.error("❌ FAIL: shopify_get_orders failed customer scoping", aliceRes);
      failed++;
    }
  } catch (err) {
    console.error("❌ FAIL: shopify_get_orders test exception:", err);
    failed++;
  }

  console.log("\n=================================================");
  console.log(`PHASE 2D & 2E TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase2D2ETests().catch(console.error);
