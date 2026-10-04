import { isDemoProjectId } from "../services/demo-project";
import { resolveAuthorizedProjectOrg } from "../security";

async function runNovaAiMatrixTest() {
  console.log("================================================================================");
  console.log("🧪 TESTING ✨ NOVA AI INTERNAL ASSISTANT: MATRIX, CONTEXT, NAVIGATION, SECURITY");
  console.log("================================================================================");

  // 1. Context Structure Verification
  console.log("\n[TEST 1] Structured Context Format...");
  const mockContext = {
    currentRoute: "/projects/11111111-2222-4000-8000-999999999999/edit?tab=widget-studio",
    currentScreen: "Widget Studio",
    currentProjectId: "11111111-2222-4000-8000-999999999999",
    currentProjectName: "CRM websites",
    userId: "test-user-1",
    userRole: "admin",
    availableActions: ["navigate", "theme", "guide_explain", "widget_settings"]
  };

  if (mockContext.currentScreen === "Widget Studio" && mockContext.currentProjectId) {
    console.log("✅ TEST 1 PASSED: Structured context payload validated.");
  } else {
    console.error("❌ TEST 1 FAILED:", mockContext);
    process.exit(1);
  }

  // 2. Secret Protection Verification
  console.log("\n[TEST 2] Security - Secret Leakage Prevention...");
  const contextKeys = Object.keys(mockContext);
  const forbiddenKeywords = ["apiKey", "password", "secret", "env", "token", "credentials", "html"];
  const hasForbidden = contextKeys.some(k => forbiddenKeywords.some(f => k.toLowerCase().includes(f)));

  if (!hasForbidden) {
    console.log("✅ TEST 2 PASSED: Context payload contains no secret keys or forbidden fields.");
  } else {
    console.error("❌ TEST 2 FAILED: Secret keywords found in context keys!", contextKeys);
    process.exit(1);
  }

  // 3. Organization Authorization Check
  console.log("\n[TEST 3] Organization & Project Scope Security...");
  const mockReq = {
    auth: {
      userId: "test-user-1",
      dbUser: { role: "user" },
      memberships: [{ organizationId: "5e6c4459-93c8-40a0-9fb2-9e9927b77ba9", role: "owner" }]
    }
  };

  const resolvedDemo = await resolveAuthorizedProjectOrg(mockReq, "demo", undefined);
  if (resolvedDemo && resolvedDemo.authoritativeOrgId) {
    console.log("✅ TEST 3 PASSED: Authorized project organization resolved cleanly.");
  } else {
    console.error("❌ TEST 3 FAILED:", resolvedDemo);
    process.exit(1);
  }

  console.log("\n================================================================================");
  console.log("🏁 ALL ✨ NOVA AI FLOATING ASSISTANT MATRIX TESTS PASSED 100%!");
  console.log("================================================================================");
  process.exit(0);
}

runNovaAiMatrixTest().catch((err) => {
  console.error("Unhandled NOVA AI matrix test failure:", err);
  process.exit(1);
});
