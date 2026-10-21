import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatAppDir = path.resolve(__dirname, "..");
const repoRootDir = path.resolve(chatAppDir, "../..");

console.log("========================================================================");
console.log("RUNNING OPERATIONS REPORTS REMOVAL & REGRESSION AUDIT SUITE");
console.log("========================================================================\n");

const projectEditTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/project-edit.tsx"), "utf8");
const backendReportsRoute = fs.readFileSync(path.resolve(repoRootDir, "backend/api-server/src/routes/reports/index.ts"), "utf8");

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

// 1. Reports is absent from the Operations navigation and All Navigation dropdown
runCheck(1, "Reports is absent from Operations navigation items and All Navigation dropdown", () => {
  const opsMatch = projectEditTsx.match(/id:\s*"operations"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
  assert(opsMatch, "Operations nav group definition must exist");
  const opsItems = opsMatch[1];
  assert(!opsItems.includes('"reports"'), "Operations nav group items must NOT contain 'reports'");

  // Verify dropdown uses PROJECT_NAV_GROUPS directly, so reports will not appear in the dropdown either
  assert(
    projectEditTsx.includes("{PROJECT_NAV_GROUPS.map((group) => (") &&
    projectEditTsx.includes("{group.items.map((item) => {"),
    "All Navigation dropdown must map over PROJECT_NAV_GROUPS items"
  );
});

// 2. Remaining Operations destinations and count badge
runCheck(2, "Operations contains exactly Analytics, Integrations, Agent Control, Settings with badge count 4", () => {
  const opsMatch = projectEditTsx.match(/id:\s*"operations"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
  const opsItems = opsMatch[1];
  const itemIds = [...opsItems.matchAll(/id:\s*"([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(
    itemIds,
    ["analytics", "integrations", "agent-control", "settings"],
    "Operations items must strictly match [analytics, integrations, agent-control, settings]"
  );

  // Verify count badge dynamically renders group.items.length (which is 4)
  assert(
    projectEditTsx.includes("{group.items.length}"),
    "Category card badge must dynamically render group.items.length"
  );
});

// 3. Analytics, Integrations, Agent Control, and Settings remain accessible
runCheck(3, "Analytics, Integrations, Agent Control, and Settings have corresponding TabsContent", () => {
  assert(projectEditTsx.includes('<TabsContent value="analytics">'), "TabsContent analytics must exist");
  assert(projectEditTsx.includes('<Analytics projectId={projectId} />'), "Analytics component must be mounted");

  assert(projectEditTsx.includes('<TabsContent value="integrations">'), "TabsContent integrations must exist");
  assert(projectEditTsx.includes('<IntegrationsList projectId={projectId} />'), "Integrations component must be mounted");

  assert(projectEditTsx.includes('<TabsContent value="agent-control">'), "TabsContent agent-control must exist");
  assert(projectEditTsx.includes('<AgentControlCenter projectId={projectId}'), "AgentControlCenter must be mounted");

  assert(projectEditTsx.includes('<TabsContent value="settings">'), "TabsContent settings must exist");
  assert(projectEditTsx.includes('<CardTitle>Project Settings</CardTitle>'), "Project Settings card must exist");
});

// 4. Notifications remains accessible through project-header bell
runCheck(4, "Notifications remains accessible through the project-header bell", () => {
  assert(
    projectEditTsx.includes('data-testid="project-header-notification-bell"'),
    "Header bell with test ID must exist"
  );
  assert(
    projectEditTsx.includes('onClick={() => handleTabChange("notifications")}'),
    "Header bell click must navigate to notifications"
  );
  assert(
    projectEditTsx.includes('<TabsContent value="notifications">'),
    "TabsContent notifications must exist"
  );
  assert(
    projectEditTsx.includes('<Notifications key={projectId} projectId={projectId}'),
    "Notifications component must be mounted"
  );
});

// 5. Overview, AI & Context, and Website Experience remain unchanged
runCheck(5, "Overview, AI & Context, and Website Experience navigation groups are intact", () => {
  const navGroupsMatch = projectEditTsx.match(/const PROJECT_NAV_GROUPS: NavGroup\[\] = (\[[\s\S]*?\n\];)/);
  assert(navGroupsMatch, "PROJECT_NAV_GROUPS definition must exist");
  const navCode = navGroupsMatch[1];

  const groupTitles = [...navCode.matchAll(/title:\s*"([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(
    groupTitles,
    ["Overview", "AI & Context", "Website Experience", "Operations"],
    "Nav groups must be Overview, AI & Context, Website Experience, Operations"
  );

  const overviewGroup = navCode.match(/id:\s*"overview"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
  assert(overviewGroup && overviewGroup[1].includes('"overview"'), "Overview item must exist");

  const aiGroup = navCode.match(/id:\s*"ai-context"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
  assert(aiGroup && !aiGroup[1].includes('"chat"') && aiGroup[1].includes('"context-engine"'), "AI & Context must contain context-engine and not chat");

  const webGroup = navCode.match(/id:\s*"website-experience"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
  assert(webGroup && webGroup[1].includes('"conversations"') && webGroup[1].includes('"channels"'), "Website Experience items intact");
});

// 6. Existing report functionality is NOT deleted
runCheck(6, "Report queries, generation logic, UI components, and backend routes are preserved", () => {
  // Frontend query & mutation preserved
  assert(projectEditTsx.includes('queryKey: ["reports", projectId]'), "Reports query must be preserved in project-edit.tsx");
  assert(projectEditTsx.includes('/api/reports/project/${projectId}'), "Reports project endpoint must be queried");
  assert(projectEditTsx.includes('generateReport = async () =>'), "generateReport handler must exist");
  assert(projectEditTsx.includes('/api/reports/generate'), "Report generation API endpoint must be called");
  assert(projectEditTsx.includes('<TabsContent value="reports">'), "TabsContent reports must exist");
  assert(projectEditTsx.includes('<CardTitle>Project Reports</CardTitle>'), "Project Reports title must exist");
  assert(projectEditTsx.includes('Generate New Report'), "Generate New Report action must exist");
  assert(projectEditTsx.includes('Past Reports'), "Past Reports section must exist");

  // Backend routes preserved
  assert(backendReportsRoute.includes('/generate'), "Backend POST /generate route must exist");
  assert(backendReportsRoute.includes('/project/:projectId'), "Backend GET /project/:projectId route must exist");
});

// 7. Direct URLs, refresh, and browser navigation preserve safe compatibility without blank screen
runCheck(7, "Direct URLs with ?tab=reports render gracefully with sub-tab indicator without blank screen", () => {
  // URL tab query parsing supports any tab including reports
  assert(
    projectEditTsx.includes('const urlTab = searchParams.get("tab");') &&
    projectEditTsx.includes('if (urlTab) return urlTab;'),
    "getInitialTab must read URL query parameter ?tab=reports"
  );

  // Sub-tab navigation bar provides dedicated pill indicator for reports
  assert(
    projectEditTsx.includes('const isReports = activeTab === "reports";'),
    "Sub-tab bar must check isReports"
  );
  assert(
    projectEditTsx.includes('<span>Project Reports</span>'),
    "Sub-tab bar must display Project Reports indicator for direct URLs"
  );

  // State synchronization
  assert(
    projectEditTsx.includes('url.searchParams.set("tab", tab);') &&
    projectEditTsx.includes('window.history.replaceState(null, "", url.toString());'),
    "Tab selection must update URL history"
  );
});

// 8. DOM-level verification: Category cards and count badges
runCheck(8, "DOM level verification: Operations category card badge displays 4 and excludes Reports", () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="nav-container"></div></body></html>`);
  const doc = dom.window.document;

  const navGroupsMatch = projectEditTsx.match(/const PROJECT_NAV_GROUPS: NavGroup\[\] = (\[[\s\S]*?\n\];)/);
  assert(navGroupsMatch, "PROJECT_NAV_GROUPS must be present");
  const rawCode = navGroupsMatch[1];
  
  const groupIds = ["overview", "ai-context", "website-experience", "operations"];
  const container = doc.getElementById("nav-container");
  
  groupIds.forEach(groupId => {
    const groupMatch = rawCode.match(new RegExp(`id:\\s*"${groupId}"[\\s\\S]*?title:\\s*"([^"]+)"[\\s\\S]*?items:\\s*\\[([\\s\\S]*?)\\]`));
    assert(groupMatch, `Group ${groupId} must exist in PROJECT_NAV_GROUPS`);

    const groupTitle = groupMatch[1];
    const itemsRaw = groupMatch[2];
    const items = [...itemsRaw.matchAll(/id:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)].map(m => ({ id: m[1], label: m[2] }));

    const card = doc.createElement("div");
    card.setAttribute("data-group-id", groupId);
    card.className = "group-card";
    
    const titleSpan = doc.createElement("span");
    titleSpan.className = "group-title";
    titleSpan.textContent = groupTitle;
    card.appendChild(titleSpan);

    const badgeSpan = doc.createElement("span");
    badgeSpan.className = "group-badge";
    badgeSpan.textContent = String(items.length);
    card.appendChild(badgeSpan);

    const subtabsList = doc.createElement("div");
    subtabsList.className = "subtabs";
    items.forEach(item => {
      const tabItem = doc.createElement("button");
      tabItem.setAttribute("data-tab-id", item.id);
      tabItem.textContent = item.label;
      subtabsList.appendChild(tabItem);
    });
    card.appendChild(subtabsList);

    container.appendChild(card);
  });

  // Verify Operations card
  const opsCard = container.querySelector('[data-group-id="operations"]');
  assert(opsCard, "Operations card must exist in DOM");
  assert.strictEqual(opsCard.querySelector(".group-badge").textContent, "4", "Operations badge must display '4'");

  const opsTabs = [...opsCard.querySelectorAll(".subtabs button")].map(btn => btn.getAttribute("data-tab-id"));
  assert.deepStrictEqual(opsTabs, ["analytics", "integrations", "agent-control", "settings"]);
  assert(!opsTabs.includes("reports"), "Operations tabs in DOM must NOT contain 'reports'");

  // Verify 'Reports' is nowhere in DOM
  const allTabLabels = [...container.querySelectorAll(".subtabs button")].map(btn => btn.textContent);
  assert(!allTabLabels.includes("Reports"), "No tab button in navigation DOM may be labeled 'Reports'");
});

console.log("\n========================================================================");
console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("========================================================================\n");

if (failed > 0) {
  process.exit(1);
}
