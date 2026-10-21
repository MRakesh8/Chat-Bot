import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatAppDir = path.resolve(__dirname, "..");
const repoRootDir = path.resolve(chatAppDir, "../..");

console.log("=================================================================");
console.log("RUNNING PROJECT HEADER NOTIFICATION BELL REGRESSION AUDIT SUITE");
console.log("=================================================================\n");

const projectEditTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/project-edit.tsx"), "utf8");
const notificationsTsx = fs.readFileSync(path.resolve(chatAppDir, "src/components/project/notifications.tsx"), "utf8");
const backendNotifRoutes = fs.readFileSync(path.resolve(repoRootDir, "backend/api-server/src/routes/projects/notifications.ts"), "utf8");

let passed = 0;
let failed = 0;

function runCheck(testNum, testName, fn) {
  try {
    fn();
    console.log(`✓ Test ${testNum}: ${testName}`);
    passed++;
  } catch (err) {
    console.error(`✗ Test ${testNum} FAILED: ${testName}\n  Error: ${err.message}`);
    failed++;
  }
}

// 1. The project header renders the notification bell in the intended location.
runCheck(1, "The project header renders the notification bell beside Live and Visit Site controls", () => {
  assert(projectEditTsx.includes('data-testid="project-header-notification-bell"'), "Must include project header notification bell test ID");
  assert(projectEditTsx.includes('<Bell className="w-4 h-4" />'), "Must render Bell icon inside header button");

  // Verify bell is positioned in the header right action controls alongside Live / Visit Site
  const headerActionBlock = projectEditTsx.match(/Right Action Controls:[\s\S]*?\{isLive \? \([\s\S]*?Visit Site[\s\S]*?project-header-notification-bell[\s\S]*?<\/div>/);
  assert(headerActionBlock, "Notification bell must be placed in the header right action controls alongside Live and Visit Site");
});

// 2. Clicking the bell opens the existing Smart Notification Center.
runCheck(2, "Clicking the bell invokes handleTabChange('notifications') to display Smart Notification Center", () => {
  assert(
    projectEditTsx.includes('onClick={() => handleTabChange("notifications")}') &&
    projectEditTsx.includes('<TabsContent value="notifications">') &&
    projectEditTsx.includes('<Notifications key={projectId} projectId={projectId} onSelectTab={handleTabChange} />'),
    "Bell click must call handleTabChange('notifications') and render Notifications component"
  );
  assert(
    notificationsTsx.includes("Smart Notification Center"),
    "The mounted component must be the existing Smart Notification Center"
  );
});

// 3. The Notifications tab no longer appears in Operations navigation.
runCheck(3, "The Notifications tab is removed from Operations navigation", () => {
  const opsGroupMatch = projectEditTsx.match(/id:\s*"operations"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
  assert(opsGroupMatch, "Operations nav group must exist");
  const opsItems = opsGroupMatch[1];
  assert(!opsItems.includes('"notifications"'), "Operations nav group items must NOT contain 'notifications'");
});

// 4. Reports, Analytics, Integrations, Agent Control, and Settings remain accessible.
runCheck(4, "Reports, Analytics, Integrations, Agent Control, and Settings remain intact in Operations", () => {
  const opsGroupMatch = projectEditTsx.match(/id:\s*"operations"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
  const opsItems = opsGroupMatch[1];
  assert(opsItems.includes('"reports"'), "Operations must include reports");
  assert(opsItems.includes('"analytics"'), "Operations must include analytics");
  assert(opsItems.includes('"integrations"'), "Operations must include integrations");
  assert(opsItems.includes('"agent-control"'), "Operations must include agent-control");
  assert(opsItems.includes('"settings"'), "Operations must include settings");

  assert(projectEditTsx.includes('<TabsContent value="reports">'), "TabsContent reports must exist");
  assert(projectEditTsx.includes('<TabsContent value="analytics">'), "TabsContent analytics must exist");
  assert(projectEditTsx.includes('<TabsContent value="integrations">'), "TabsContent integrations must exist");
  assert(projectEditTsx.includes('<TabsContent value="agent-control">'), "TabsContent agent-control must exist");
  assert(projectEditTsx.includes('<TabsContent value="settings">'), "TabsContent settings must exist");
});

// 5. Unread counts are preserved and displayed correctly.
runCheck(5, "Unread counts are queried and displayed on the project header bell with badge overflow handling", () => {
  assert(
    projectEditTsx.includes('queryKey: ["project-notifications-unread", projectId]'),
    "project-edit.tsx must query project-notifications-unread"
  );
  assert(
    projectEditTsx.includes('/api/projects/${projectId}/notifications/unread-count'),
    "Must fetch unread count from /api/projects/:projectId/notifications/unread-count"
  );
  assert(
    projectEditTsx.includes('{projectUnreadCount > 0 && (') &&
    projectEditTsx.includes('{projectUnreadCount > 99 ? "99+" : projectUnreadCount}'),
    "Must render unread count badge on bell with 99+ overflow"
  );
});

// 6. Existing filters, search, refresh, preferences, and read-state actions still work.
runCheck(6, "Smart Notification Center retains filters, search, refresh, preferences, and mutations", () => {
  assert(notificationsTsx.includes('NotificationFilter = "all" | "unread" | "leads" | "tools" | "feedback" | "system"'), "All notification filters supported");
  assert(notificationsTsx.includes("searchQuery"), "Search query filter supported");
  assert(notificationsTsx.includes("refetch"), "Refresh functionality supported");
  assert(notificationsTsx.includes("saveSettingsMutation"), "Notification preferences settings supported");
  assert(notificationsTsx.includes("markAsReadMutation"), "Mark as read mutation supported");
  assert(notificationsTsx.includes("markAllReadMutation"), "Mark all as read mutation supported");
  assert(notificationsTsx.includes("clearReadMutation"), "Clear read mutation supported");

  // Invalidation keeps header bell unread count in sync
  assert(
    notificationsTsx.includes('queryClient.invalidateQueries({ queryKey: ["project-notifications-unread", projectId] });'),
    "Notification mutations must invalidate project-notifications-unread to sync header bell count"
  );
});

// 7. Switching projects displays the correct project's notifications.
runCheck(7, "Switching projects correctly resets tab state and re-keys Notifications component", () => {
  assert(
    projectEditTsx.includes('<Notifications key={projectId} projectId={projectId}'),
    "Notifications must be keyed by projectId to prevent stale notification state across projects"
  );
  assert(
    projectEditTsx.includes('useEffect(() => {\n    const tabToSet = getInitialTab();\n    setActiveTab(tabToSet);'),
    "Tab state must be re-evaluated when projectId changes"
  );
});

// 8. Existing authorization and tenant isolation remain enforced.
runCheck(8, "Tenant isolation and authorization checks are enforced on project notifications API", () => {
  assert(
    backendNotifRoutes.includes("resolveAuthorizedProjectOrg(req, projectId, rawOrgId)"),
    "Notifications routes must verify authorized project organization"
  );
  assert(
    backendNotifRoutes.includes('return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });'),
    "Cross-tenant notification access must return 403 Forbidden"
  );
});

// 9. Refresh and browser navigation do not produce a blank screen or stale notification context.
runCheck(9, "URL tab param ?tab=notifications and localStorage continuity preserve notification route", () => {
  assert(
    projectEditTsx.includes('const urlTab = searchParams.get("tab");') &&
    projectEditTsx.includes('if (urlTab) return urlTab;'),
    "getInitialTab must parse ?tab=notifications on reload"
  );
  assert(
    projectEditTsx.includes('url.searchParams.set("tab", tab);') &&
    projectEditTsx.includes('window.history.replaceState(null, "", url.toString());'),
    "handleTabChange must synchronize tab into URL search params"
  );
  assert(
    projectEditTsx.includes('saveProjectTab(projectId, tab)'),
    "handleTabChange must persist tab to workspace continuity store"
  );
});

// 10. No duplicate notification page or redundant API request implementation is introduced.
runCheck(10, "Existing Smart Notification Center component and routes are reused without duplication", () => {
  const notifImports = [...projectEditTsx.matchAll(/import\s*\{[^}]*Notifications[^}]*\}\s*from/g)];
  assert.strictEqual(notifImports.length, 1, "Must have exactly ONE import of Notifications in project-edit.tsx");

  const notifTabsContent = [...projectEditTsx.matchAll(/<TabsContent\s+value="notifications">/g)];
  assert.strictEqual(notifTabsContent.length, 1, "Must have exactly ONE TabsContent for notifications");
});

console.log("\n=================================================================");
console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("=================================================================\n");

if (failed > 0) {
  process.exit(1);
}
