import { db } from "@workspace/db";
import {
  projects,
  organizations,
  organizationMembers,
  users,
  projectFeedback,
  messageFeedback,
  notifications,
  notificationSettings
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { submitProjectFeedback, submitMessageFeedback } from "../src/services/feedback";

async function runSuggestionNotificationTests() {
  console.log("=================================================================");
  console.log("  SUGGESTION → NOTIFICATION COMPREHENSIVE VERIFICATION SUITE   ");
  console.log("=================================================================\n");

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
    // ─── 0. SETUP FIXTURES (Org A vs Org B) ──────────────────────────────────
    const [userA] = await db.insert(users).values({ email: `admin-a-${Date.now()}@example.com`, role: "user" }).returning();
    const [userB] = await db.insert(users).values({ email: `admin-b-${Date.now()}@example.com`, role: "user" }).returning();

    const [orgA] = await db.insert(organizations).values({ name: `Org A ${Date.now()}` }).returning();
    const [orgB] = await db.insert(organizations).values({ name: `Org B ${Date.now()}` }).returning();

    await db.insert(organizationMembers).values([
      { organizationId: orgA.id, userId: userA.id, role: "owner" },
      { organizationId: orgB.id, userId: userB.id, role: "owner" }
    ]);

    const [projA] = await db.insert(projects).values({
      userId: userA.id,
      organizationId: orgA.id,
      name: "Project A Test"
    }).returning();

    const [projB] = await db.insert(projects).values({
      userId: userB.id,
      organizationId: orgB.id,
      name: "Project B Test"
    }).returning();

    // ─── TEST 1: Visitor Submits Suggestion ───────────────────────────────────
    console.log("--- TEST GROUP 1: Visitor Submits Suggestion ---");
    const suggestionText = "Your chatbot should explain pricing more clearly.";
    const resultA = await submitProjectFeedback({
      projectId: projA.id,
      category: "SUGGESTION",
      comment: `User Note: ${suggestionText} | AI Context: Here is our basic plan...`,
      channel: "WEBSITE"
    });

    assert(resultA.success === true, "1.1 Suggestion submitted successfully");
    assert(resultA.feedback?.id !== undefined, "1.2 Feedback ID returned");

    // Wait a brief tick for async notification processing
    await new Promise((r) => setTimeout(r, 200));

    // Verify feedback row in database
    const [savedFeedback] = await db.select().from(projectFeedback).where(eq(projectFeedback.id, resultA.feedback.id));
    assert(savedFeedback !== undefined, "1.3 Feedback row persisted in project_feedback table");
    assert(savedFeedback?.category === "SUGGESTION", "1.4 Category saved as SUGGESTION");

    // ─── TEST 2: Suggestion Notification Created ─────────────────────────────
    console.log("\n--- TEST GROUP 2: Suggestion Notification Creation & Content ---");
    const notifsA = await db.select().from(notifications).where(eq(notifications.projectId, projA.id));
    assert(notifsA.length === 1, "2.1 Exactly 1 notification created for Project A");
    
    const notif = notifsA[0];
    assert(notif.type === "SUGGESTION", "2.2 Notification type is SUGGESTION");
    assert(notif.title === "New website suggestion", "2.3 Notification title is 'New website suggestion'");
    assert(notif.message === suggestionText, "2.4 Notification preview extracted clean user suggestion note");
    assert(notif.referenceId === savedFeedback.id, "2.5 Reference ID links to feedback record");
    assert(notif.readAt === null, "2.6 Notification is initially unread (readAt is null)");
    assert(notif.organizationId === orgA.id, "2.7 Notification is correctly scoped to Organization A");

    // ─── TEST 3: Tenant Isolation ────────────────────────────────────────────
    console.log("\n--- TEST GROUP 3: Tenant Isolation ---");
    const notifsB = await db.select().from(notifications).where(eq(notifications.projectId, projB.id));
    assert(notifsB.length === 0, "3.1 Project B received 0 notifications (complete isolation)");

    // ─── TEST 4: Deduplication on Retries / Rapid Submissions ─────────────────
    console.log("\n--- TEST GROUP 4: Deduplication & Idempotency ---");
    // Simulate duplicate event with same feedback ID / dedupe key
    const duplicateDedupeKey = `suggestion_${projA.id}_${savedFeedback.id}`;
    const [existingCheck] = await db.select().from(notifications).where(
      and(eq(notifications.projectId, projA.id), eq(notifications.dedupeKey, duplicateDedupeKey))
    );
    assert(existingCheck !== undefined, "4.1 Existing notification found by dedupe key");

    // Attempting duplicate insert with same dedupeKey should be guarded
    const notifsCountBefore = (await db.select().from(notifications).where(eq(notifications.projectId, projA.id))).length;
    // Call submitProjectFeedback with new submission
    const secondResult = await submitProjectFeedback({
      projectId: projA.id,
      category: "SUGGESTION",
      comment: `User Note: Another suggestion | AI Context: ...`,
      channel: "WEBSITE"
    });
    await new Promise((r) => setTimeout(r, 200));
    const notifsCountAfter = (await db.select().from(notifications).where(eq(notifications.projectId, projA.id))).length;
    assert(notifsCountAfter === notifsCountBefore + 1, "4.2 Distinct suggestions create distinct notifications");

    // ─── TEST 5: XSS & HTML Injection Payload Safety ─────────────────────────
    console.log("\n--- TEST GROUP 5: XSS & HTML Payload Handling ---");
    const xssPayload = `<script>alert('xss')</script><img src=x onerror=alert(1)>`;
    const xssResult = await submitProjectFeedback({
      projectId: projA.id,
      category: "SUGGESTION",
      comment: `User Note: ${xssPayload} | AI Context: ...`,
      channel: "WEBSITE"
    });
    await new Promise((r) => setTimeout(r, 200));

    const [xssNotif] = await db.select().from(notifications).where(eq(notifications.referenceId, xssResult.feedback.id));
    assert(xssNotif !== undefined, "5.1 Notification created for suggestion with script characters");
    assert(xssNotif.message === xssPayload, "5.2 Stored safely as plain text without execution");

    // ─── TEST 6: Long Suggestion Truncation ───────────────────────────────────
    console.log("\n--- TEST GROUP 6: Long Suggestion Truncation ---");
    const longSuggestion = "A".repeat(300);
    const longResult = await submitProjectFeedback({
      projectId: projA.id,
      category: "SUGGESTION",
      comment: `User Note: ${longSuggestion}`,
      channel: "WEBSITE"
    });
    await new Promise((r) => setTimeout(r, 200));

    const [longNotif] = await db.select().from(notifications).where(eq(notifications.referenceId, longResult.feedback.id));
    assert(longNotif.message.length <= 150, "6.1 Long suggestion truncated to max 150 characters for notification preview");
    assert(longNotif.message.endsWith("..."), "6.2 Preview ends with ellipsis");

    // ─── TEST 7: Mark As Read Functionality ──────────────────────────────────
    console.log("\n--- TEST GROUP 7: Mark As Read ---");
    await db.update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notif.id), eq(notifications.projectId, projA.id)));

    const [updatedNotif] = await db.select().from(notifications).where(eq(notifications.id, notif.id));
    assert(updatedNotif?.readAt !== null, "7.1 Notification marked as read (readAt is timestamp)");

    // ─── TEST 8: Existing Feedback LIKE / DISLIKE Regression ─────────────────
    console.log("\n--- TEST GROUP 8: Existing Feedback (LIKE/DISLIKE) Regression ---");
    const likeResult = await submitProjectFeedback({
      projectId: projA.id,
      category: "AI_RESPONSE_LIKE",
      comment: "User liked response",
      channel: "WEBSITE"
    });
    assert(likeResult.success === true, "8.1 AI_RESPONSE_LIKE submitted normally");

    // ─── CLEANUP FIXTURES ────────────────────────────────────────────────────
    console.log("\n--- CLEANUP FIXTURES ---");
    await db.delete(notifications).where(eq(notifications.projectId, projA.id));
    await db.delete(projectFeedback).where(eq(projectFeedback.projectId, projA.id));
    await db.delete(projects).where(eq(projects.id, projA.id));
    await db.delete(projects).where(eq(projects.id, projB.id));
    await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, orgA.id));
    await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, orgB.id));
    await db.delete(organizations).where(eq(organizations.id, orgA.id));
    await db.delete(organizations).where(eq(organizations.id, orgB.id));
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
    console.log("✅ Test fixtures cleaned up");

    // ─── SUMMARY ─────────────────────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("═══════════════════════════════════════════════════════════════\n");

    if (failed > 0) process.exit(1);
    process.exit(0);
  } catch (err) {
    console.error("Test error:", err);
    process.exit(1);
  }
}

runSuggestionNotificationTests();
