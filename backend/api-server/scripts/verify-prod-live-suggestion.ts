import { db } from "@workspace/db";
import { projectWidgetSettings, projects, notifications, projectFeedback } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

async function verifyLiveProductionSuggestion() {
  console.log("=================================================================");
  console.log("  LIVE PRODUCTION SUGGESTION → NOTIFICATION VERIFICATION");
  console.log("=================================================================");

  const PROD_URL = "https://chat-bot-api-ns81.onrender.com";

  // 1. Check healthz
  console.log("\n1. Testing Production GET /api/healthz...");
  const healthRes = await fetch(`${PROD_URL}/api/healthz`);
  console.log(`Health Status: ${healthRes.status}`);
  const healthData = await healthRes.json();
  console.log("Health Data:", healthData);
  if (healthRes.status !== 200) {
    throw new Error(`Production healthz returned status ${healthRes.status}`);
  }

  // 2. Query a project with widget token from DB
  const [projSetting] = await db
    .select({
      projectId: projectWidgetSettings.projectId,
      widgetToken: projectWidgetSettings.widgetToken,
      botName: projectWidgetSettings.botName,
      allowedDomains: projectWidgetSettings.allowedDomains,
    })
    .from(projectWidgetSettings)
    .limit(1);

  if (!projSetting || !projSetting.widgetToken) {
    throw new Error("No existing project with widgetToken found to test");
  }

  const { projectId, widgetToken, allowedDomains } = projSetting;
  console.log(`\n2. Using real project: ${projectId}, widgetToken: ${widgetToken}`);
  console.log(`Allowed domains: ${JSON.stringify(allowedDomains)}`);

  const originHeader = (allowedDomains && allowedDomains.length > 0 && allowedDomains[0] !== "*")
    ? (allowedDomains[0].startsWith("http") ? allowedDomains[0] : `https://${allowedDomains[0]}`)
    : "http://localhost:5173";

  // 3. Send a test suggestion via live Render production endpoint
  const testSuggestionText = `User Note: Live Production Suggestion Test - Please add dark mode support | AI Context: None`;
  console.log(`\n3. Sending suggestion via POST ${PROD_URL}/api/widget/${widgetToken}/feedback... with Origin: ${originHeader}`);

  const feedbackRes = await fetch(`${PROD_URL}/api/widget/${widgetToken}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ProductionVerification/1.0",
      "Origin": originHeader,
    },
    body: JSON.stringify({
      type: "SUGGESTION",
      text: testSuggestionText,
      sessionId: "anonymous-session-prod-test",
    }),
  });

  console.log(`Feedback Response Status: ${feedbackRes.status}`);
  const feedbackData = await feedbackRes.json();
  console.log("Feedback Response Data:", feedbackData);

  if (feedbackRes.status !== 200 || !feedbackData.success) {
    throw new Error(`Production feedback endpoint failed with status ${feedbackRes.status}`);
  }

  // 4. Wait 1 second for async notification creation
  await new Promise((r) => setTimeout(r, 1500));

  // 5. Verify that the suggestion feedback row exists in database
  console.log("\n4. Verifying project_feedback row in database...");
  const [savedFb] = await db
    .select()
    .from(projectFeedback)
    .where(eq(projectFeedback.projectId, projectId))
    .orderBy(desc(projectFeedback.createdAt))
    .limit(1);

  console.log("Saved Feedback Row:", savedFb);
  if (!savedFb || savedFb.category !== "SUGGESTION") {
    throw new Error("Feedback record was not found or category is not SUGGESTION");
  }

  // 6. Verify that the notification was generated in the database
  console.log("\n5. Verifying notification generated for project in notifications table...");
  const [notif] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.projectId, projectId))
    .orderBy(desc(notifications.createdAt))
    .limit(1);

  console.log("Latest Notification:", notif);
  if (!notif) {
    throw new Error("No notification found for the project");
  }

  console.log("\nNotification Details:");
  console.log(`- ID: ${notif.id}`);
  console.log(`- Type: ${notif.type}`);
  console.log(`- Title: ${notif.title}`);
  console.log(`- Message: ${notif.message}`);
  console.log(`- Severity: ${notif.severity}`);
  console.log(`- Scoped Org ID: ${notif.organizationId}`);
  console.log(`- Scoped Project ID: ${notif.projectId}`);
  console.log(`- Reference ID: ${notif.referenceId}`);
  console.log(`- Read At: ${notif.readAt}`);

  if (notif.type !== "SUGGESTION") {
    throw new Error(`Expected notification type 'SUGGESTION', got '${notif.type}'`);
  }
  if (notif.title !== "New website suggestion") {
    throw new Error(`Expected notification title 'New website suggestion', got '${notif.title}'`);
  }

  // 7. Clean up test notification and feedback if desired or leave as live test record
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  LIVE PRODUCTION VERIFICATION PASSED SUCCESSFULLY! ✅");
  console.log("═══════════════════════════════════════════════════════════════\n");

  process.exit(0);
}

verifyLiveProductionSuggestion().catch((err) => {
  console.error("Live verification failed:", err);
  process.exit(1);
});
