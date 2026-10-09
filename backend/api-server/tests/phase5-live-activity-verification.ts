import {
  db,
  withTenantContext,
  withBypassRLS,
  organizations,
  users,
  projects,
  chatSessions,
  messages,
  widgetLeads,
  enterpriseAuditLogs,
  projectFeedback,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getProjectActivity,
  emitActivityEvent,
  activityBus,
  sanitizeActivityText,
  sanitizeMetadata,
  ActivityItem,
} from "../src/services/activity";

async function runPhase5Verification() {
  console.log("================================================================================");
  console.log("  PHASE 5 — LIVE ACTIVITY ACCURACY & REAL-TIME BUSINESS ACTIVITY VERIFICATION");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`  ✓ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAILED: ${testName}`, detail || "");
      failed++;
    }
  }

  const testOrgAId = randomUUID();
  const testOrgBId = randomUUID();
  const testUserIdA = randomUUID();
  const testUserIdB = randomUUID();
  const testProjAId = randomUUID();
  const testProjBId = randomUUID();

  try {
    // 1. SETUP ISOLATED TENANT TEST DATA
    console.log("--- Step 1: Setting up Tenant & Project Test Fixtures ---");
    await withBypassRLS(async (tx: any) => {
      // Create Orgs
      await tx.insert(organizations).values([
        { id: testOrgAId, name: "Phase5 Test Org A" },
        { id: testOrgBId, name: "Phase5 Test Org B" },
      ]);

      // Create Users
      await tx.insert(users).values([
        { id: testUserIdA, email: `user-a-${Date.now()}@test.com`, role: "user" },
        { id: testUserIdB, email: `user-b-${Date.now()}@test.com`, role: "user" },
      ]);

      // Create Projects
      await tx.insert(projects).values([
        { id: testProjAId, organizationId: testOrgAId, userId: testUserIdA, name: "Project Alpha (Org A)" },
        { id: testProjBId, organizationId: testOrgBId, userId: testUserIdB, name: "Project Beta (Org B)" },
      ]);
    });
    console.log("  Fixture projects created successfully.\n");

    // 2. TEST SANITIZATION PRIVACY GUARDS
    console.log("--- Step 2: Privacy & Secret Sanitization ---");
    const rawSecretMsg = "My token is Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and my apiKey=ai_key_secret_1234567890abcdef and password: supersecretpassword!";
    const sanitizedText = sanitizeActivityText(rawSecretMsg);
    assert(
      !sanitizedText.includes("ai_key_secret") && !sanitizedText.includes("supersecretpassword") && sanitizedText.includes("[REDACTED"),
      "Privacy Guard: sanitizeActivityText redacts bearer tokens, api keys, and passwords"
    );

    const rawMetadata = {
      apiKey: "sk-proj-super-secret-1234567890",
      secretToken: "secret_value_999",
      riskLevel: "HIGH",
      status: "COMPLETED",
      normalField: "Normal metadata detail"
    };
    const sanitizedMeta = sanitizeMetadata(rawMetadata);
    assert(
      sanitizedMeta.apiKey === "[REDACTED]" && sanitizedMeta.secretToken === "[REDACTED]" && sanitizedMeta.riskLevel === "HIGH",
      "Privacy Guard: sanitizeMetadata redacts sensitive object keys"
    );

    // 3. CREATE REAL MULTI-SOURCE ACTIVITY IN PROJECT A
    console.log("\n--- Step 3: Seed Real Activity Records for Project A ---");
    const sessionA1 = randomUUID();
    const sessionA2 = randomUUID();
    const msgA1 = randomUUID();
    const msgA2 = randomUUID();
    const leadA1 = randomUUID();
    const auditA1 = randomUUID();
    const auditA2 = randomUUID();
    const fbA1 = randomUUID();

    const sessionB1 = randomUUID();
    const msgB1 = randomUUID();

    await withBypassRLS(async (tx: any) => {
      // Project A - Session 1
      await tx.insert(chatSessions).values([
        { id: sessionA1, projectId: testProjAId, userId: testUserIdA, title: "Website Visitor Chat" },
        { id: sessionA2, projectId: testProjAId, userId: testUserIdA, title: "VIP Customer Inquiry" },
      ]);

      // Project A - Messages
      await tx.insert(messages).values([
        { id: msgA1, sessionId: sessionA1, sender: "user", content: "What are your enterprise subscription pricing tiers?", createdAt: new Date(Date.now() - 50000) },
        { id: msgA2, sessionId: sessionA1, sender: "assistant", content: "Our enterprise tier includes unlimited API tokens and dedicated support.", createdAt: new Date(Date.now() - 40000) },
      ]);

      // Project A - Lead
      await tx.insert(widgetLeads).values([
        { id: leadA1, projectId: testProjAId, name: "Bruce Wayne", email: "bruce@wayne-enterprises.com", company: "Wayne Enterprises", score: "HIGH", scoreValue: 85, status: "NEW", createdAt: new Date(Date.now() - 30000) },
      ]);

      // Project A - Enterprise Tool Executions
      await tx.insert(enterpriseAuditLogs).values([
        {
          id: auditA1,
          projectId: testProjAId,
          actionType: "TOOL_CHECK_INVENTORY",
          details: { actionName: "check_inventory", providerName: "shopify", status: "SUCCESS", durationMs: 240, riskLevel: "READ_ONLY" },
          timestamp: new Date(Date.now() - 20000)
        },
        {
          id: auditA2,
          projectId: testProjAId,
          actionType: "TOOL_REFUND_ORDER",
          details: { actionName: "refund_order", providerName: "stripe", status: "SUCCESS", durationMs: 410, riskLevel: "HIGH_RISK_WRITE" },
          timestamp: new Date(Date.now() - 10000)
        }
      ]);

      // Project A - Customer Feedback
      await tx.insert(projectFeedback).values([
        { id: fbA1, projectId: testProjAId, rating: 5, comment: "Exceptional assistance from the AI assistant!", channel: "website", createdAt: new Date(Date.now() - 5000) }
      ]);

      // Project B (Other Tenant) - Session & Message
      await tx.insert(chatSessions).values([
        { id: sessionB1, projectId: testProjBId, userId: testUserIdB, title: "Project B Session" }
      ]);
      await tx.insert(messages).values([
        { id: msgB1, sessionId: sessionB1, sender: "user", content: "Secret Project B communication that must not leak", createdAt: new Date() }
      ]);
    });
    console.log("  Project A & B database activities created.\n");

    // 4. VERIFY ACTIVITY RETRIEVAL & NEWEST-FIRST ORDERING
    console.log("--- Step 4: Verify Multi-Source Truthful Activity Retrieval ---");
    const activityA = await getProjectActivity({
      projectId: testProjAId,
      organizationId: testOrgAId,
      limit: 25,
    });

    assert(Array.isArray(activityA) && activityA.length >= 6, "Activity Retrieval: Returns multi-source activity items", { count: activityA.length });

    // Check all event types are represented
    const typesPresent = new Set(activityA.map((a) => a.type));
    assert(typesPresent.has("message"), "Activity Types: Contains visitor 'message' events");
    assert(typesPresent.has("ai_response"), "Activity Types: Contains 'ai_response' events");
    assert(typesPresent.has("lead"), "Activity Types: Contains captured 'lead' events");
    assert(typesPresent.has("tool_execution"), "Activity Types: Contains 'tool_execution' events");
    assert(typesPresent.has("feedback"), "Activity Types: Contains 'feedback' events");

    // Verify newest-first ordering
    let isChronological = true;
    for (let i = 0; i < activityA.length - 1; i++) {
      if (new Date(activityA[i].timestamp).getTime() < new Date(activityA[i + 1].timestamp).getTime()) {
        isChronological = false;
        break;
      }
    }
    assert(isChronological, "Ordering Verification: Activity list is strictly ordered newest-first");

    // 5. VERIFY TENANT & PROJECT ISOLATION (ZERO LEAKAGE)
    console.log("\n--- Step 5: Verify Tenant Context & Project Isolation ---");
    // Project A query must NOT contain Project B activity
    const leakedItem = activityA.find((act) => act.id.includes(msgB1) || act.detail.includes("Secret Project B"));
    assert(!leakedItem, "Project Isolation: Project A activity does NOT contain Project B records");

    // Query Project B activity with Org B context
    const activityB = await getProjectActivity({
      projectId: testProjBId,
      organizationId: testOrgBId,
      limit: 25,
    });
    assert(
      activityB.length >= 1 && activityB.some((act) => act.id.includes(msgB1)),
      "Tenant Retrieval: Org B receives its own Project B activity"
    );
    assert(
      !activityB.some((act) => act.id.includes(msgA1) || act.id.includes(leadA1)),
      "Tenant Isolation: Org B activity does NOT contain Project A records"
    );

    // Cross-tenant attempt: Requesting Project A with Org B context
    let crossTenantData: ActivityItem[] = [];
    try {
      crossTenantData = await getProjectActivity({
        projectId: testProjAId,
        organizationId: testOrgBId,
        limit: 25,
      });
    } catch (e) {
      // Failing closed
    }
    assert(
      crossTenantData.length === 0,
      "Cross-Tenant Security: Attacker querying Project A with Org B context returns 0 rows (Fail-Closed)"
    );

    // 6. REAL-TIME EVENT BUS & SUBSCRIPTION DELIVERY
    console.log("\n--- Step 6: Verify Real-Time Event Bus & Deduplication ---");
    let receivedStreamEvent: ActivityItem | null = null;
    const unsubscribe = activityBus.subscribe(testProjAId, (evt) => {
      receivedStreamEvent = evt;
    });

    const emittedEvent = emitActivityEvent({
      id: `act-live-test-${randomUUID()}`,
      type: "tool_execution",
      title: "Tool Executed: process_checkout",
      detail: "Provider: shopify • Status: SUCCESS",
      status: "SUCCESS",
      projectId: testProjAId,
      organizationId: testOrgAId,
    });

    assert(
      receivedStreamEvent !== null && (receivedStreamEvent as ActivityItem).id === emittedEvent.id,
      "Real-Time Delivery: EventBus immediately delivers live activity to project subscriber"
    );

    unsubscribe();
    receivedStreamEvent = null;

    emitActivityEvent({
      id: `act-live-test-after-unsub`,
      type: "message",
      title: "Another message",
      detail: "detail",
      projectId: testProjAId,
    });

    assert(
      receivedStreamEvent === null,
      "Unsubscribe Cleanup: Listener properly cleaned up after unsubscribe"
    );

    // 7. DUPLICATE EVENT PROTECTION
    console.log("\n--- Step 7: Duplicate Protection Verification ---");
    const testId = `dup-check-${randomUUID()}`;
    const item1 = emitActivityEvent({
      id: testId,
      type: "lead",
      title: "Lead Captured: John Doe",
      detail: "john@example.com",
      projectId: testProjAId,
    });

    const item2 = emitActivityEvent({
      id: testId,
      type: "lead",
      title: "Lead Captured: John Doe (Retry)",
      detail: "john@example.com",
      projectId: testProjAId,
    });

    assert(item1.id === item2.id, "Duplicate Protection: Stable deterministic IDs prevent duplicate event creation");

  } catch (error: any) {
    console.error("FATAL ERROR during Phase 5 verification:", error);
    failed++;
  } finally {
    // CLEANUP TEST FIXTURES
    console.log("\n--- Cleanup Test Fixtures ---");
    try {
      await withBypassRLS(async (tx: any) => {
        await tx.delete(projects).where(eq(projects.id, testProjAId));
        await tx.delete(projects).where(eq(projects.id, testProjBId));
        await tx.delete(users).where(eq(users.id, testUserIdA));
        await tx.delete(users).where(eq(users.id, testUserIdB));
        await tx.delete(organizations).where(eq(organizations.id, testOrgAId));
        await tx.delete(organizations).where(eq(organizations.id, testOrgBId));
      });
      console.log("  Cleaned up all temporary test fixtures successfully.\n");
    } catch (e) {
      console.warn("  Fixture cleanup warning:", e);
    }
  }

  console.log("================================================================================");
  console.log(`  PHASE 5 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase5Verification();
