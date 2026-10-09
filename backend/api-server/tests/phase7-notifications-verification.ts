import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
import { db, notifications, notificationSettings, projects, organizations, users, withTenantContext } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  createNotification,
  getProjectNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearReadNotifications,
  getUnreadCount
} from "../src/services/notifications";
import { sanitizeActivityText } from "../src/services/activity";

async function runPhase7Tests() {
  console.log("================================================================================");
  console.log("  PHASE 7 — SMART NOTIFICATION CENTER & EVENT VERIFICATION TEST SUITE");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASSED: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${name} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  // --- Section 1: Secret Redaction & Payload Sanitization ---
  console.log("\n--- Section 1: Secret Redaction & Payload Sanitization ---");
  {
    const sanitizedKey = sanitizeActivityText("User key=AIzaSyD1234567890abcdef-secret entered");
    assert(!sanitizedKey.includes("AIzaSyD1234567890abcdef"), "Redact API key from payload");
    assert(sanitizedKey.includes("[REDACTED_SECRET]"), "Replace API key with redaction marker");

    const sanitizedBearer = sanitizeActivityText("Header Authorization: Bearer sk-ant-api03-abcdef1234567890");
    assert(!sanitizedBearer.includes("sk-ant-api03"), "Redact Bearer token from payload");

    const sanitizedPass = sanitizeActivityText("DB connection password=supersecretpass123 failed");
    assert(!sanitizedPass.includes("supersecretpass123"), "Redact password from payload");
    assert(sanitizedPass.includes("password=[REDACTED]"), "Replace password with redaction token");

    const sanitizedPostgres = sanitizeActivityText("Error connecting to postgresql://user:mysecret@db.supabase.co:5432/postgres");
    assert(!sanitizedPostgres.includes("user:mysecret"), "Redact database connection credentials");
  }

  // Set up test organization & projects
  console.log("\n--- Setting Up Test Fixtures ---");
  const testOrgA = crypto.randomUUID();
  const testOrgB = crypto.randomUUID();
  const testUserA = crypto.randomUUID();
  const testUserB = crypto.randomUUID();
  let testProjectA: string | null = null;
  let testProjectB: string | null = null;

  try {
    await db.insert(users).values([
      { id: testUserA, email: `user-a-${Date.now()}@example.com`, role: "user" },
      { id: testUserB, email: `user-b-${Date.now()}@example.com`, role: "user" },
    ]);

    const [insertedOrgA] = await db.insert(organizations).values({
      id: testOrgA,
      name: "Phase 7 Test Org A",
    }).returning();

    const [insertedOrgB] = await db.insert(organizations).values({
      id: testOrgB,
      name: "Phase 7 Test Org B",
    }).returning();

    const [projA] = await db.insert(projects).values({
      name: "Project Alpha",
      organizationId: testOrgA,
      userId: testUserA,
    }).returning();
    testProjectA = projA.id;

    const [projB] = await db.insert(projects).values({
      name: "Project Beta",
      organizationId: testOrgB,
      userId: testUserB,
    }).returning();
    testProjectB = projB.id;

    console.log(`  ✓ Test Fixtures Created: OrgA (${testOrgA}), OrgB (${testOrgB}), ProjA (${testProjectA}), ProjB (${testProjectB})`);

    // --- Section 2: Real Event Notification Generation ---
    console.log("\n--- Section 2: Real Event Notification Generation ---");
    {
      // 1. Lead captured notification
      const leadNotif = await createNotification({
        projectId: testProjectA,
        organizationId: testOrgA,
        type: "LEAD_CAPTURED",
        severity: "warning",
        title: "High Intent Lead: Alice Smith",
        message: "alice@example.com • +1-555-0199 • Acme Corp • Requesting enterprise demo",
        dedupeKey: `lead_${Date.now()}_1`,
      });
      assert(leadNotif !== null, "Create LEAD_CAPTURED notification");
      assert(leadNotif?.title === "High Intent Lead: Alice Smith", "Verify notification title");
      assert(leadNotif?.severity === "warning", "Verify severity set to warning");

      // 2. Tool failure notification
      const toolNotif = await createNotification({
        projectId: testProjectA,
        organizationId: testOrgA,
        type: "TOOL_FAILED",
        severity: "error",
        title: "Tool Failed: shopify_check_order",
        message: "Tool execution on provider shopify failed. Order ID not found.",
        dedupeKey: `tool_fail_${Date.now()}_1`,
      });
      assert(toolNotif !== null, "Create TOOL_FAILED notification");
      assert(toolNotif?.severity === "error", "Verify error severity for tool failure");

      // 3. User suggestion notification
      const suggestionNotif = await createNotification({
        projectId: testProjectA,
        organizationId: testOrgA,
        type: "SUGGESTION",
        severity: "info",
        title: "New website suggestion",
        message: "Visitor suggested adding pricing calculator widget.",
        dedupeKey: `sugg_${Date.now()}_1`,
      });
      assert(suggestionNotif !== null, "Create SUGGESTION notification");

      // 4. Quality alert notification
      const qualityNotif = await createNotification({
        projectId: testProjectA,
        organizationId: testOrgA,
        type: "QUALITY_ALERT",
        severity: "high",
        title: "Negative feedback threshold reached",
        message: "Received 3 dislikes in the last 24 hours.",
        dedupeKey: `quality_${Date.now()}_1`,
      });
      assert(qualityNotif !== null, "Create QUALITY_ALERT notification");
    }

    // --- Section 3: Deduplication & Storm Prevention ---
    console.log("\n--- Section 3: Deduplication & Storm Prevention ---");
    {
      const staticDedupeKey = `dedupe_test_${Date.now()}`;
      
      const first = await createNotification({
        projectId: testProjectA,
        organizationId: testOrgA,
        type: "SYSTEM_ALERT",
        severity: "info",
        title: "System sync initiated",
        message: "First sync event",
        dedupeKey: staticDedupeKey,
      });
      assert(first !== null, "First notification with dedupe key created");

      const duplicate = await createNotification({
        projectId: testProjectA,
        organizationId: testOrgA,
        type: "SYSTEM_ALERT",
        severity: "info",
        title: "System sync initiated (Duplicate)",
        message: "Second duplicate sync event",
        dedupeKey: staticDedupeKey,
      });
      assert(duplicate === null, "Duplicate notification with same dedupeKey is safely suppressed");
    }

    // --- Section 4: Read State Transitions & Unread Counts ---
    console.log("\n--- Section 4: Read State Transitions & Unread Counts ---");
    {
      const initialUnread = await getUnreadCount(testProjectA, testOrgA);
      assert(initialUnread >= 4, `Initial unread count accurate (got ${initialUnread})`);

      const listResult = await getProjectNotifications({
        projectId: testProjectA,
        organizationId: testOrgA,
      });
      assert(listResult.notifications.length >= 4, "Retrieve project notifications list");
      assert(listResult.unreadCount === initialUnread, "Unread count in list matches helper");

      // Mark one as read
      const firstItem = listResult.notifications[0];
      const readResult = await markNotificationAsRead(testProjectA, testOrgA, firstItem.id);
      assert(readResult !== null && readResult.readAt !== null, "Mark single notification as read");

      const afterOneRead = await getUnreadCount(testProjectA, testOrgA);
      assert(afterOneRead === initialUnread - 1, "Unread count decremented by 1");

      // Mark all as read
      const markAllRes = await markAllNotificationsAsRead(testProjectA, testOrgA);
      assert(markAllRes.count >= 3, `Mark all as read updated remaining unread items (count: ${markAllRes.count})`);

      const finalUnread = await getUnreadCount(testProjectA, testOrgA);
      assert(finalUnread === 0, "Unread count is exactly 0 after markAllNotificationsAsRead");
    }

    // --- Section 5: Filtering & Pagination ---
    console.log("\n--- Section 5: Filtering & Pagination ---");
    {
      // Create a fresh unread lead
      await createNotification({
        projectId: testProjectA,
        organizationId: testOrgA,
        type: "LEAD_CAPTURED",
        severity: "info",
        title: "New Lead for Filtering Test",
        message: "filter_test@example.com",
        dedupeKey: `filter_lead_${Date.now()}`,
      });

      const unreadFiltered = await getProjectNotifications({
        projectId: testProjectA,
        organizationId: testOrgA,
        filter: "unread",
      });
      assert(unreadFiltered.notifications.length === 1, "Filter 'unread' returns only unread items");
      assert(unreadFiltered.notifications[0].readAt === null, "Verified unread item has null readAt");

      const leadsFiltered = await getProjectNotifications({
        projectId: testProjectA,
        organizationId: testOrgA,
        filter: "leads",
      });
      assert(leadsFiltered.notifications.length >= 2, "Filter 'leads' returns lead notifications");
      assert(leadsFiltered.notifications.every(n => n.type === "LEAD_CAPTURED" || n.type === "lead"), "All items match lead type");

      const paginated = await getProjectNotifications({
        projectId: testProjectA,
        organizationId: testOrgA,
        limit: 2,
        offset: 0,
      });
      assert(paginated.notifications.length === 2, "Pagination limit respected (limit=2)");
    }

    // --- Section 6: Deletion & Clear Read ---
    console.log("\n--- Section 6: Deletion & Clear Read ---");
    {
      const beforeDeleteList = await getProjectNotifications({
        projectId: testProjectA,
        organizationId: testOrgA,
      });
      const itemToDelete = beforeDeleteList.notifications[0];

      const deleted = await deleteNotification(testProjectA, testOrgA, itemToDelete.id);
      assert(deleted !== null && deleted.id === itemToDelete.id, "Delete single notification");

      // Clear read notifications
      const cleared = await clearReadNotifications(testProjectA, testOrgA);
      assert(cleared.count >= 1, `Clear read notifications removed read items (count: ${cleared.count})`);

      const remainingList = await getProjectNotifications({
        projectId: testProjectA,
        organizationId: testOrgA,
      });
      assert(remainingList.notifications.every(n => n.readAt === null), "All remaining notifications are unread");
    }

    // --- Section 7: Preferences & Settings Enforcement ---
    console.log("\n--- Section 7: Preferences & Settings Enforcement ---");
    {
      // Disable notifications in settings
      await db.insert(notificationSettings).values({
        projectId: testProjectA,
        enabled: false,
        notifyOnDislikes: 5,
        notifyOnLikes: 5,
      }).onConflictDoUpdate({
        target: notificationSettings.projectId,
        set: { enabled: false }
      });

      // Try creating notification when disabled
      const suppressed = await createNotification({
        projectId: testProjectA,
        organizationId: testOrgA,
        type: "LEAD_CAPTURED",
        title: "Suppressed Lead",
        message: "Should not be created because notifications are disabled",
        dedupeKey: `suppressed_${Date.now()}`,
      });
      assert(suppressed === null, "Notification creation is suppressed when project notifications are disabled");

      // Re-enable notifications
      await db.update(notificationSettings)
        .set({ enabled: true })
        .where(eq(notificationSettings.projectId, testProjectA));

      const reEnabled = await createNotification({
        projectId: testProjectA,
        organizationId: testOrgA,
        type: "LEAD_CAPTURED",
        title: "Re-enabled Lead",
        message: "Successfully created after re-enabling",
        dedupeKey: `reenabled_${Date.now()}`,
      });
      assert(reEnabled !== null, "Notification created successfully after re-enabling");
    }

    // --- Section 8: Cross-Tenant & IDOR Protection ---
    console.log("\n--- Section 8: Cross-Tenant & IDOR Protection ---");
    {
      // Org B attempts to read Org A's notifications
      let crossTenantReadBlocked = false;
      try {
        await getProjectNotifications({
          projectId: testProjectA,
          organizationId: testOrgB, // Org B requesting Org A project
        });
      } catch (err: any) {
        crossTenantReadBlocked = true;
      }
      assert(crossTenantReadBlocked, "Fail-closed: Org B cannot access Org A's notifications");

      // Org B attempts to delete Org A's notification
      const orgANotif = (await getProjectNotifications({ projectId: testProjectA, organizationId: testOrgA })).notifications[0];
      if (orgANotif) {
        const crossDelete = await deleteNotification(testProjectB, testOrgB, orgANotif.id);
        assert(crossDelete === null, "IDOR protection: Org B cannot delete Org A's notification");
      }
    }

  } finally {
    // Cleanup test fixtures
    console.log("\n--- Cleaning Up Test Fixtures ---");
    if (testProjectA) {
      await db.delete(notifications).where(eq(notifications.projectId, testProjectA));
      await db.delete(notificationSettings).where(eq(notificationSettings.projectId, testProjectA));
      await db.delete(projects).where(eq(projects.id, testProjectA));
    }
    if (testProjectB) {
      await db.delete(notifications).where(eq(notifications.projectId, testProjectB));
      await db.delete(notificationSettings).where(eq(notificationSettings.projectId, testProjectB));
      await db.delete(projects).where(eq(projects.id, testProjectB));
    }
    await db.delete(organizations).where(eq(organizations.id, testOrgA));
    await db.delete(organizations).where(eq(organizations.id, testOrgB));
    await db.delete(users).where(eq(users.id, testUserA));
    await db.delete(users).where(eq(users.id, testUserB));
    console.log("  ✓ Test Fixtures Cleaned Up Successfully");
  }

  console.log("\n================================================================================");
  console.log(`  PHASE 7 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase7Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
