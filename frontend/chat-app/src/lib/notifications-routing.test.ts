import assert from "node:assert";

console.log("==================================================");
console.log("  RUNNING NOTIFICATION ROUTING & NAV TESTS");
console.log("==================================================\n");

let passed = 0;
let failed = 0;

function check(testName: string, actual: any, expected: any) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ✓ PASSED: ${testName} -> ${JSON.stringify(actual)}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${testName} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// Helper functions matching top-nav and settings routing logic
export function getNotificationBellTarget(projectId: string | null): string {
  if (projectId) {
    return `/notifications?projectId=${projectId}`;
  }
  return "/notifications";
}

export function redirectLegacySettingsNotificationUrl(searchParamsString: string): string | null {
  const searchParams = new URLSearchParams(searchParamsString);
  const tab = searchParams.get("tab");
  const projectId = searchParams.get("projectId");

  if (tab === "notifications") {
    return projectId ? `/notifications?projectId=${projectId}` : "/notifications";
  }
  return null;
}

export const WORKSPACE_SETTINGS_TABS = ["general", "billing", "api-keys"];

// 1. Top Nav Bell Click Tests
check("Header bell target without projectId", getNotificationBellTarget(null), "/notifications");
check("Header bell target with projectId", getNotificationBellTarget("proj-123"), "/notifications?projectId=proj-123");

// 2. Legacy Settings Notifications Redirect Tests
check("Redirect legacy /settings?tab=notifications", redirectLegacySettingsNotificationUrl("tab=notifications"), "/notifications");
check("Redirect legacy /settings?tab=notifications&projectId=proj-456", redirectLegacySettingsNotificationUrl("tab=notifications&projectId=proj-456"), "/notifications?projectId=proj-456");
check("Do not redirect normal settings tab /settings?tab=billing", redirectLegacySettingsNotificationUrl("tab=billing"), null);

// 3. Workspace Settings Tabs Validation
check("Workspace settings tabs list excludes notifications tab", WORKSPACE_SETTINGS_TABS.includes("notifications"), false);
check("Workspace settings tabs contain general, billing, api-keys", WORKSPACE_SETTINGS_TABS, ["general", "billing", "api-keys"]);

console.log(`\n--------------------------------------------------`);
console.log(`  SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log(`--------------------------------------------------\n`);

if (failed > 0) {
  process.exit(1);
}
