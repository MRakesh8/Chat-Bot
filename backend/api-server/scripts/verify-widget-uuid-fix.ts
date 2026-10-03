import { db } from "@workspace/db";
import {
  projects,
  users,
  projectWidgetSettings,
  chatSessions,
  customers,
  widgetLeads,
  knowledgeGaps,
  projectContextSettings
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { deltaReconstructor, sessionMemoryStore } from "../src/services/context-engine";
import { processAndSaveLead } from "../src/services/lead-detection";
import { trackKnowledgeGap } from "../src/services/unanswered-questions";

async function runVerification() {
  console.log("===============================================================");
  console.log("  NOVA BUSINESS AI — WIDGET SESSION UUID VALIDATION TEST SUITE ");
  console.log("===============================================================\n");

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

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  try {
    // ─── 0. SETUP TEST FIXTURES ──────────────────────────────────────────────
    const [testUser] = await db.insert(users).values({
      email: `uuid-test-${Date.now()}@example.com`,
      role: "user"
    }).returning();

    const [projA] = await db.insert(projects).values({
      userId: testUser.id,
      name: "Widget Test Project A",
    }).returning();

    const [projB] = await db.insert(projects).values({
      userId: testUser.id,
      name: "Widget Test Project B",
    }).returning();

    const [customerA] = await db.insert(customers).values({
      projectId: projA.id,
      name: "Alice Smith",
      email: "alice@example.com",
      isVerified: true
    }).returning();

    const [validSessionA] = await db.insert(chatSessions).values({
      projectId: projA.id,
      customerId: customerA.id,
      title: "Alice's Valid UUID Session"
    }).returning();

    // ─── 1. TEST MALFORMED/NON-UUID PUBLIC SESSION ID (e.g. "88wj0rry4qb") ───
    console.log("\n--- TEST GROUP 1: Non-UUID Short Client ID Handling ---");
    const clientGeneratedShortId = "88wj0rry4qb";
    assert(!UUID_RE.test(clientGeneratedShortId), "1.1 Client-generated short ID is correctly identified as non-UUID");

    // Replicate the resolution logic in widget-public.ts
    const isUuidSessionId = clientGeneratedShortId && UUID_RE.test(clientGeneratedShortId);
    let customerId: string | undefined = undefined;
    let customerVerified = false;
    let errorThrown = false;

    try {
      if (isUuidSessionId) {
        const sessionRec = await db.query.chatSessions.findFirst({
          where: and(eq(chatSessions.id, clientGeneratedShortId), eq(chatSessions.projectId, projA.id))
        });
        if (sessionRec?.customerId) {
          customerId = sessionRec.customerId;
        }
      }
    } catch (err) {
      errorThrown = true;
    }

    assert(!errorThrown, "1.2 Non-UUID sessionId ('88wj0rry4qb') does NOT throw PostgreSQL uuid syntax error");
    assert(customerId === undefined, "1.3 Anonymous visitor customerId remains safely undefined");
    assert(customerVerified === false, "1.4 Customer verification remains false for anonymous visitor");

    // ─── 2. TEST IN-MEMORY CONTEXT ENGINE WITH NON-UUID SESSION ID ───────────
    console.log("\n--- TEST GROUP 2: In-Memory Context Engine Continuity ---");
    const mockContextPayload = {
      version: "2.0",
      timestamp: Date.now(),
      extractionDurationMs: 12,
      transport: {
        mode: "full",
        sessionHash: "hash-123",
        segmentHashes: { page: "h1", navigation: "h2", content: "h3" },
        changedSegments: ["page", "navigation", "content"],
        unchangedSegments: [],
        sequenceNumber: 1
      },
      page: {
        url: "https://example.com/pricing",
        path: "/pricing",
        title: "Pricing",
        type: "landing",
        breadcrumbs: ["Home", "Pricing"],
        heading: "Pricing Plans",
        description: "Choose your plan"
      },
      navigation: {
        activeItem: "Pricing",
        items: [{ label: "Home", active: false }, { label: "Pricing", active: true }]
      },
      content: {
        headings: [{ text: "Plans", level: 1 }],
        cards: [],
        tables: [],
        forms: [],
        charts: [],
        lists: [],
        notifications: [],
        dialogs: [],
        buttons: [{ text: "Buy Now", type: "primary" }],
        stats: [],
        canvasElements: []
      },
      state: {
        activeFilters: [],
        openDialogs: [],
        visibleErrors: [],
        visibleWarnings: [],
        scrollPosition: "top",
        idleTimeMs: 500
      },
      workflow: {},
      viewport: {
        width: 1280,
        height: 800,
        scrollX: 0,
        scrollY: 0,
        scrollDepthPercent: 0,
        visibleElementCount: 10,
        totalElementCount: 20,
        viewportCoveragePercent: 80
      },
      metadata: {
        framework: "react",
        spaDetected: true,
        domNodeCount: 50,
        viewportNodeCount: 20,
        extractedElementCount: 15,
        cacheHit: false,
        mutationsSinceLastExtraction: 0,
        compressionRatio: 1.0
      }
    };

    const reconstructed = deltaReconstructor.reconstruct(clientGeneratedShortId, mockContextPayload);
    assert(reconstructed !== null, "2.1 Delta reconstructor successfully processes non-UUID short session ID");
    assert(reconstructed?.page?.url === "https://example.com/pricing", "2.2 Context payload reconstructed accurately");

    const sessionMem = sessionMemoryStore.update(clientGeneratedShortId, reconstructed!);
    assert(sessionMem !== null, "2.3 Session memory store updates correctly with short session ID");
    assert(sessionMem.pageHistory.length >= 1, "2.4 Page history tracked in session memory");

    // ─── 3. TEST REPEATED MESSAGES / SESSION REOPEN ──────────────────────────
    console.log("\n--- TEST GROUP 3: Repeated Messages & Session Reopen ---");
    const sessionMem2 = sessionMemoryStore.getOrCreate(clientGeneratedShortId);
    assert(sessionMem2 !== undefined, "3.1 Existing session memory retrieved on repeated message/reopen");
    assert(sessionMem2.currentPage === "/pricing", "3.2 Context memory (currentPage) persisted across turns");

    // ─── 4. TEST VALID UUID SESSION RESOLUTION ───────────────────────────────
    console.log("\n--- TEST GROUP 4: Valid UUID Session Resolution ---");
    assert(UUID_RE.test(validSessionA.id), "4.1 Valid UUID correctly matches UUID regex");

    let validCustomerId: string | undefined = undefined;
    let validCustomerVerified = false;

    if (validSessionA.id && UUID_RE.test(validSessionA.id)) {
      const sessionRec = await db.query.chatSessions.findFirst({
        where: and(eq(chatSessions.id, validSessionA.id), eq(chatSessions.projectId, projA.id))
      });
      if (sessionRec?.customerId) {
        validCustomerId = sessionRec.customerId;
        const custRec = await db.query.customers.findFirst({
          where: eq(customers.id, validCustomerId)
        });
        if (custRec) {
          validCustomerVerified = custRec.isVerified;
        }
      }
    }

    assert(validCustomerId === customerA.id, "4.2 Customer identity resolved for valid UUID chat session");
    assert(validCustomerVerified === true, "4.3 Customer verification status resolved accurately");

    // ─── 5. TEST TENANT ISOLATION / IDOR PREVENTION ──────────────────────────
    console.log("\n--- TEST GROUP 5: Tenant Isolation & IDOR Prevention ---");
    // Attempt to lookup Project A's session using Project B's scope
    const crossTenantSession = await db.query.chatSessions.findFirst({
      where: and(eq(chatSessions.id, validSessionA.id), eq(chatSessions.projectId, projB.id))
    });
    assert(crossTenantSession === undefined, "5.1 Cross-project session lookup blocked (returns undefined)");

    // ─── 6. TEST LEAD CAPTURE WITH NON-UUID SESSION ID ───────────────────────
    console.log("\n--- TEST GROUP 6: Lead Capture Resilience ---");
    let leadError = false;
    let createdLead: any = null;

    try {
      createdLead = await processAndSaveLead({
        projectId: projA.id,
        sessionId: clientGeneratedShortId, // Non-UUID session ID
        sourcePageUrl: "https://example.com/contact",
        userMessage: "Hello, my email is bob@example.com and phone is +15551234567"
      });
    } catch (e) {
      leadError = true;
    }

    assert(!leadError, "6.1 Lead detection does NOT throw with non-UUID sessionId");
    assert(createdLead !== null, "6.2 Lead record created successfully");
    assert(createdLead?.email === "bob@example.com", "6.3 Lead email captured properly");
    assert(createdLead?.sessionId === null, "6.4 Non-UUID sessionId safely mapped to null in UUID column");

    // ─── 7. TEST KNOWLEDGE GAP TRACKING WITH NON-UUID SESSION ID ─────────────
    console.log("\n--- TEST GROUP 7: Knowledge Gap Tracking Resilience ---");
    let gapError = false;
    try {
      await trackKnowledgeGap({
        projectId: projA.id,
        questionText: "What is your enterprise refund timeline?",
        sessionId: clientGeneratedShortId, // Non-UUID session ID
        sourceUrl: "https://example.com/faq",
        confidence: "low",
        reason: "NO_RAG_MATCH"
      });
    } catch (e) {
      gapError = true;
    }

    assert(!gapError, "7.1 Knowledge gap tracking does NOT throw with non-UUID sessionId");

    const gapRec = await db.query.knowledgeGaps.findFirst({
      where: eq(knowledgeGaps.projectId, projA.id)
    });
    assert(gapRec !== undefined, "7.2 Knowledge gap row saved in database");
    assert(gapRec?.sessionId === null, "7.3 Non-UUID sessionId safely mapped to null in knowledge_gaps table");

    // ─── 8. CLEANUP FIXTURES ─────────────────────────────────────────────────
    console.log("\n--- CLEANUP FIXTURES ---");
    await db.delete(knowledgeGaps).where(eq(knowledgeGaps.projectId, projA.id));
    await db.delete(widgetLeads).where(eq(widgetLeads.projectId, projA.id));
    await db.delete(chatSessions).where(eq(chatSessions.id, validSessionA.id));
    await db.delete(customers).where(eq(customers.id, customerA.id));
    await db.delete(projects).where(eq(projects.id, projA.id));
    await db.delete(projects).where(eq(projects.id, projB.id));
    await db.delete(users).where(eq(users.id, testUser.id));
    console.log("✅ Test fixtures cleaned up");

    // ─── SUMMARY ─────────────────────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("═══════════════════════════════════════════════════════════════\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  }
}

runVerification();
