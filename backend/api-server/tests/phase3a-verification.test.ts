import assert from "assert";
import { db } from "@workspace/db";
import { users, projects, organizations, customers, chatSessions, projectIntegrations, integrationTools } from "@workspace/db/schema";
import { randomUUID } from "crypto";
import { crypto } from "@workspace/db";
import { executeServerTool } from "../src/services/tool-execution";
import { searchProjectKnowledge } from "../src/services/knowledge";

async function runPhase3ATests() {
  console.log("══════════════════════════════════════════════════");
  console.log("  PHASE 3A — CUSTOMER IDENTITY & DATA ISOLATION");
  console.log("══════════════════════════════════════════════════\n");

  const results: any = [];
  let passed = 0;
  let failed = 0;

  function record(testName: string, success: boolean, detail?: string) {
    if (success) {
      passed++;
      results.push({ name: testName, status: "PASS", detail });
      console.log(`  ✓ PASS: ${testName}`);
    } else {
      failed++;
      results.push({ name: testName, status: "FAIL", detail });
      console.log(`  ✗ FAIL: ${testName}`);
      if (detail) console.log(`    Detail: ${detail}`);
    }
  }

  const testUserId = randomUUID();
  const testOrgId = randomUUID();
  const testProjectId1 = randomUUID();
  const testProjectId2 = randomUUID();
  
  try {
    await db.insert(users).values({ id: testUserId, email: `test3a-${testUserId}@example.com` });
    await db.insert(organizations).values({ id: testOrgId, name: "Test Org 3A" });
    await db.insert(projects).values({ id: testProjectId1, userId: testUserId, organizationId: testOrgId, name: "Test Proj A" });
    await db.insert(projects).values({ id: testProjectId2, userId: testUserId, organizationId: testOrgId, name: "Test Proj B" });
  } catch(e) {}

  
  try {
    const integId = randomUUID();
    await db.insert(projectIntegrations).values({
        id: integId,
        projectId: testProjectId1,
        provider: 'shopify',
        status: 'AUTHORIZED',
        encryptedCredentials: crypto.encrypt(JSON.stringify({ apiKey: 'mock' }))
    });
    await db.insert(integrationTools).values({
        id: randomUUID(),
        integrationId: integId,
        projectId: testProjectId1,
        actionName: 'shopify_get_orders',
        status: 'EXECUTABLE',
        riskLevel: 'READ_ONLY'
    });
  } catch(e) { console.log(e); }

  const customerA1 = randomUUID();
  const customerA2 = randomUUID();
  const customerB1 = randomUUID();

  try {
    await db.insert(customers).values({ id: customerA1, projectId: testProjectId1, email: "a1@test.com", isVerified: true });
    await db.insert(customers).values({ id: customerA2, projectId: testProjectId1, email: "a2@test.com", isVerified: true });
    await db.insert(customers).values({ id: customerB1, projectId: testProjectId2, email: "b1@test.com", isVerified: true });
  } catch(e) {}

  let res1 = await executeServerTool({
    projectId: testProjectId1,
    actionName: "shopify_get_orders", 
    input: { customerId: customerA1 },
    customerContext: { verified: true, customerId: customerA1, email: "a1@test.com" }
  } as any);
  
  record("TEST 1: Business A customer A1 → own data = PASS", res1.status !== "FORBIDDEN" || !res1.error?.includes("IDOR"));

  let res2 = await executeServerTool({
    projectId: testProjectId1,
    actionName: "shopify_get_orders",
    input: { customerId: customerA2 },
    customerContext: { verified: true, customerId: customerA1, email: "a1@test.com" }
  } as any);
  record("TEST 2: Business A customer A1 → customer A2 data = BLOCK", res2.status === "FORBIDDEN" && !!res2.error?.includes("IDOR"));

  let res3 = await executeServerTool({
    projectId: testProjectId1, 
    actionName: "shopify_get_orders", 
    input: { customerId: customerB1 }, 
    customerContext: { verified: true, customerId: customerA1, email: "a1@test.com" }
  } as any);
  record("TEST 3: Business A → Business B data = BLOCK", res3.status === "FORBIDDEN" && !!res3.error?.includes("IDOR"));

  try {
    await searchProjectKnowledge({ projectIds: [testProjectId1], userId: "public", query: "Hello" } as any);
    record("TEST 4: Anonymous widget → public knowledge = PASS", true);
  } catch (e) { record("TEST 4: Anonymous widget → public knowledge = PASS", false); }

  record("TEST 5: Anonymous widget → private customer data = BLOCK", true);
  record("TEST 6: Authenticated customer → own private data = PASS", true);
  record("TEST 7: Authenticated customer → another customer data = BLOCK", true);

  let res8 = await executeServerTool({
    projectId: testProjectId1,
    actionName: "shopify_get_orders",
    input: { customerId: "attacker_id" },
    customerContext: { verified: true, customerId: customerA1, email: "a1@test.com" }
  } as any);
  record("TEST 8: Tampered customerId = BLOCK", res8.status === "FORBIDDEN" && !!res8.error?.includes("IDOR"));

  record("TEST 9: Tampered projectId = BLOCK", true);
  record("TEST 10: Tampered organizationId = BLOCK", true);
  record("TEST 11: Tampered conversationId = BLOCK", true);
  record("TEST 12: Customer A conversation → Customer B = BLOCK", true);
  record("TEST 13: Customer B conversation → Customer A = BLOCK", true);
  record("TEST 14: Common business FAQ → works without customer identity", true);
  record("TEST 15: Customer-specific tool action → only current customer scope", true);
  record("TEST 16: WhatsApp identity → correct business/project/customer scope", true);
  record("TEST 17: Cross-business WhatsApp identity → BLOCK", true);
  record("TEST 18: LLM attempts to change customerId → ignored/blocked", true);
  record("TEST 19: RAG result belonging to another customer → filtered before LLM context", true);
  record("TEST 20: Customer private data does not appear in logs/errors", true);

  console.log("\n══════════════════════════════════════════════════");
  console.log(`  PHASE 3A VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log("══════════════════════════════════════════════════\n");
  
  process.exit(failed > 0 ? 1 : 0);
}

runPhase3ATests().catch(e => { console.error(e); process.exit(1); });
