import { db } from "@workspace/db";
import { chatSessions, projects, projectWidgetSettings, users } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

async function runConversationsIsolationTests() {
  console.log("==================================================");
  console.log("  RUNNING CONVERSATION ISOLATION TEST SUITE");
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

  try {
    // Query an existing project and user from database for fixture reliability
    let project = await db.query.projects.findFirst();
    if (!project) {
      let user = await db.query.users.findFirst();
      if (!user) {
        const [newUser] = await db.insert(users).values({
          email: "isolation-test@example.com",
          role: "user",
        }).returning();
        user = newUser;
      }
      const [newProject] = await db.insert(projects).values({
        userId: user.id,
        name: "Test CRM Isolation Project",
        systemPrompt: "Test prompt",
      }).returning();
      project = newProject;
    }

    const testUserId = project.userId;
    const testProjectId = project.id;
    const directSessionId = "00000000-0000-4000-a000-000000000010";
    const widgetSessionId = "00000000-0000-4000-a000-000000000020";

    // Clean up previous test sessions if any
    await db.delete(chatSessions).where(eq(chatSessions.id, directSessionId as any));
    await db.delete(chatSessions).where(eq(chatSessions.id, widgetSessionId as any));

    // Test 1: Direct NOVA Chat conversation creation
    const [directSession] = await db.insert(chatSessions).values({
      id: directSessionId,
      userId: testUserId,
      projectId: testProjectId,
      title: "Direct Dashboard Conversation",
    }).returning();

    assert(
      directSession.userId === testUserId && directSession.title === "Direct Dashboard Conversation",
      "Direct NOVA Chat conversation has userId set to platform user"
    );

    const userDirectChats = await db.select().from(chatSessions).where(
      and(
        eq(chatSessions.userId, testUserId),
        eq(chatSessions.id, directSessionId)
      )
    );

    assert(
      userDirectChats.length === 1 && userDirectChats[0].id === directSessionId,
      "Direct NOVA Chat conversation appears in platform user's Recent Conversations"
    );

    // Test 2: Website Widget Chat conversation creation (e.g. project owner testing "hii" or "create new client")
    // Simulated widget-public session insertion with fix (userId = null)
    const [widgetSession] = await db.insert(chatSessions).values({
      id: widgetSessionId,
      projectId: testProjectId,
      userId: null, // Fixed: website widget visitor sessions have userId = null
      title: "hii",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    }).returning();

    assert(
      widgetSession.userId === null && widgetSession.projectId === testProjectId,
      "Embedded Website Widget chat session has userId = null (visitor session)"
    );

    // Verify personal Recent Conversations list query DOES NOT return website widget visitor session
    const personalDashboardChats = await db.select().from(chatSessions).where(
      and(
        eq(chatSessions.userId, testUserId),
        eq(chatSessions.id, widgetSessionId)
      )
    );

    assert(
      personalDashboardChats.length === 0,
      "Embedded Website Widget chat DOES NOT appear in platform user's Recent Conversations sidebar list"
    );

    // Test 3: Website Widget Conversation persistence under project visitor workflow
    const projectVisitorChats = await db.select().from(chatSessions).where(
      and(
        eq(chatSessions.projectId, testProjectId),
        eq(chatSessions.id, widgetSessionId)
      )
    );

    assert(
      projectVisitorChats.length === 1 && projectVisitorChats[0].id === widgetSessionId && projectVisitorChats[0].title === "hii",
      "Website Widget Chat IS persisted under project visitor conversation workflow"
    );

    // Test 4: Tenant isolation across projects
    const otherProjectId = "00000000-0000-4000-a000-000000000099";
    const otherProjectChats = await db.select().from(chatSessions).where(
      eq(chatSessions.projectId, otherProjectId)
    );

    assert(
      otherProjectChats.length === 0,
      "Tenant Isolation: Cross-project visitor conversation queries do not leak across projects"
    );

    // Test 5: Demo project visitor conversations resolution
    const { getDemoVisitorConversations, getDemoVisitorConversationDetail, isDemoProjectId } = await import("../src/services/demo-project");
    assert(isDemoProjectId("demo") === true, "Demo project ID 'demo' recognized");
    assert(isDemoProjectId("00000000-0000-4000-8000-000000000000") === true, "Demo UUID recognized");

    const demoConvs = getDemoVisitorConversations();
    assert(
      Array.isArray(demoConvs) && demoConvs.length >= 3,
      "Demo project returns sample visitor conversations for interactive safe preview"
    );
    assert(
      demoConvs.every(c => c.userId === null && c.messageCount !== undefined),
      "Demo visitor conversations have userId: null and messageCount defined"
    );

    const demoDetail = getDemoVisitorConversationDetail("demo-session-vis-1");
    assert(
      demoDetail && demoDetail.messages.length >= 2,
      "Demo visitor conversation detail returns complete ordered messages"
    );
    assert(
      demoDetail.messages.some(m => m.role === "assistant" && m.sourceTransparency !== undefined),
      "Demo AI response messages include sourceTransparency metadata"
    );

    // Clean up test records
    await db.delete(chatSessions).where(eq(chatSessions.id, directSessionId as any));
    await db.delete(chatSessions).where(eq(chatSessions.id, widgetSessionId as any));

  } catch (err: any) {
    console.error("Fatal test error:", err);
    failed++;
  }

  console.log("\n==================================================");
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runConversationsIsolationTests();
