import { isDemoProjectId, isDemoShareToken, getDemoProjectMeta, getDemoKnowledgeSources, getDemoDashboardData, getDemoIntegrations, getDemoNotifications, getDemoFeedback, getDemoWidgetSettings } from "../services/demo-project.js";
import { executeServerTool } from "../services/tool-execution.js";

async function main() {
  console.log("================================================================================");
  console.log("🧪 TESTING DEMO PROJECT FIXTURES & FAIL-CLOSED SECURITY GUARANTEES");
  console.log("================================================================================");

  // 1. Identification
  const demoId = "00000000-0000-4000-8000-000000000000";
  const regularId = "12345678-1234-1234-1234-123456789abc";

  if (!isDemoProjectId(demoId) || !isDemoProjectId("demo")) {
    throw new Error("Failed demo ID identification");
  }
  if (isDemoProjectId(regularId)) {
    throw new Error("Regular ID falsely identified as demo");
  }
  console.log("✅ 1. Demo ID identification verified.");

  // 2. Share token check
  if (!isDemoShareToken("demo_share_token_apex_dynamics") || !isDemoShareToken("demo")) {
    throw new Error("Failed demo share token identification");
  }
  console.log("✅ 2. Demo share token identification verified.");

  // 3. Metadata and fixture checks
  const meta = getDemoProjectMeta();
  if (meta.name !== "Apex Dynamics — Demo") {
    throw new Error("Unexpected demo project name: " + meta.name);
  }
  const sources = getDemoKnowledgeSources();
  if (sources.length !== 5) {
    throw new Error("Expected 5 demo knowledge sources, got: " + sources.length);
  }
  const dashboard = getDemoDashboardData();
  if (dashboard.conversations.total !== 342) {
    throw new Error("Expected 342 total conversations in demo dashboard");
  }
  const integrations = getDemoIntegrations();
  if (integrations.length !== 2) {
    throw new Error("Expected 2 demo integrations");
  }
  const notifs = getDemoNotifications();
  if (notifs.notifications.length !== 3) {
    throw new Error("Expected 3 demo notifications");
  }
  const feedback = getDemoFeedback();
  if (feedback.breakdown[5] !== 78 || feedback.averageRating !== 4.9) {
    throw new Error("Expected 78 5-star feedback and 4.9 average rating in demo feedback");
  }
  const widget = getDemoWidgetSettings();
  if (widget.launcherTitle !== "Chat with Apex AI") {
    throw new Error("Expected launcherTitle Chat with Apex AI in demo widget");
  }
  console.log("✅ 3. Deterministic fixtures verified (Metadata, 5 Sources, Dashboard KPIs, Integrations, Notifications, Feedback, Widget Settings).");

  // 4. Server-Side Execution Blocker (Fail-closed)
  const execResult = await executeServerTool({
    toolId: "demo_shopify_tool",
    projectId: demoId,
    userId: "usr_test_123",
    input: { query: "orders" },
  });
  if (execResult.success || execResult.status !== "FORBIDDEN" || !execResult.error?.includes("This is a demo project")) {
    throw new Error("Server-side tool execution was not properly blocked in demo project: " + JSON.stringify(execResult));
  }
  console.log("✅ 4. Server-side fail-closed execution verified: Live tool execution strictly blocked in demo mode.");

  console.log("================================================================================");
  console.log("🏁 ALL DEMO PROJECT TESTS PASSED WITH 100% SUCCESS!");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Demo project test failed:", err);
  process.exit(1);
});
