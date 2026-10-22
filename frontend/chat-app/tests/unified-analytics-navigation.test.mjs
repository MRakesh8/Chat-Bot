import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatAppDir = path.resolve(__dirname, "..");
const repoRootDir = path.resolve(chatAppDir, "../..");

console.log("========================================================================");
console.log("RUNNING UNIFIED ANALYTICS & NAVIGATION INTEGRATION AUDIT SUITE");
console.log("========================================================================\n");

const projectEditTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/project-edit.tsx"), "utf8");
const overviewTsx = fs.readFileSync(path.resolve(chatAppDir, "src/components/project/dashboard-overview.tsx"), "utf8");
const analyticsTsx = fs.readFileSync(path.resolve(chatAppDir, "src/components/project/analytics.tsx"), "utf8");

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

// 1. Operations navigation in PROJECT_NAV_GROUPS does NOT contain analytics
runCheck(1, "Analytics is removed from PROJECT_NAV_GROUPS operations items", () => {
  const opsMatch = projectEditTsx.match(/id:\s*"operations"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
  assert(opsMatch, "Operations nav group definition must exist");
  const opsItems = opsMatch[1];
  assert(!opsItems.includes('"analytics"'), "Operations nav items must NOT contain 'analytics'");
  assert(!opsItems.includes('"reports"'), "Operations nav items must NOT contain 'reports'");
  assert(!opsItems.includes('"notifications"'), "Operations nav items must NOT contain 'notifications'");
});

// 2. Operations items strictly match [integrations, agent-control, settings] (count = 3)
runCheck(2, "Operations contains exactly [integrations, agent-control, settings] with count 3", () => {
  const opsMatch = projectEditTsx.match(/id:\s*"operations"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
  const opsItems = opsMatch[1];
  const itemIds = [...opsItems.matchAll(/id:\s*"([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(
    itemIds,
    ["integrations", "agent-control", "settings"],
    "Operations items must strictly match [integrations, agent-control, settings]"
  );
  assert.strictEqual(itemIds.length, 3, "Operations items count must be exactly 3");
});

// 3. Overview Dashboard contains compact 7-day Analytics preview card
runCheck(3, "Overview Dashboard contains compact 7-day Analytics preview card", () => {
  assert(
    overviewTsx.includes("Chatbot Analytics & Intelligence Preview"),
    "Overview must render 'Chatbot Analytics & Intelligence Preview' card header"
  );
  assert(
    overviewTsx.includes('data-testid="analytics-view-more-details-btn"'),
    "Overview must render 'View More Details' button with data-testid='analytics-view-more-details-btn'"
  );
  assert(
    overviewTsx.includes('onSelectTab?.("analytics"'),
    "View More Details button must call onSelectTab with 'analytics'"
  );
  assert(
    overviewTsx.includes('queryKey: ["widget-analytics", projectId, "7d"]'),
    "Overview must query 7-day widget analytics"
  );
});

// 4. Overview preview card contains 4 compact metric tiles and sparkline chart
runCheck(4, "Overview preview card displays 4 compact metrics and sparkline trend", () => {
  assert(overviewTsx.includes("Total Messages"), "Preview must include Total Messages tile");
  assert(overviewTsx.includes("Unique Visitors"), "Preview must include Unique Visitors tile");
  assert(overviewTsx.includes("Est. AI Cost"), "Preview must include Est. AI Cost tile");
  assert(overviewTsx.includes("Avg Latency"), "Preview must include Avg Latency tile");
  assert(overviewTsx.includes("<AreaChart data={analyticsTimeSeries}"), "Preview must render sparkline AreaChart");
  assert(overviewTsx.includes("Open Full Analytics"), "Preview must render link to Open Full Analytics");
});

// 5. Full Analytics component includes Back to Overview top bar
runCheck(5, "Full Analytics component provides 'Back to Overview' navigation", () => {
  assert(
    analyticsTsx.includes('data-testid="analytics-back-to-overview-btn"'),
    "Analytics must render 'Back to Overview' button with data-testid='analytics-back-to-overview-btn'"
  );
  assert(
    analyticsTsx.includes('onSelectTab("overview"'),
    "Back to Overview button must invoke onSelectTab('overview')"
  );
  assert(
    analyticsTsx.includes("Detailed Analytics & Intelligence"),
    "Analytics header breadcrumb must display 'Detailed Analytics & Intelligence'"
  );
});

// 6. Full Analytics preserves deep capabilities (CRM, FAQ, Gaps, Live Stream, Export)
runCheck(6, "Full Analytics preserves deep capabilities, CRM actions, and formula-safe export", () => {
  assert(analyticsTsx.includes("Frequently Asked Questions"), "Must preserve Top Questions / FAQs");
  assert(analyticsTsx.includes("Unanswered Questions & Knowledge Gaps"), "Must preserve Unanswered Questions & gaps");
  assert(analyticsTsx.includes('value="leads"'), "Must preserve Leads tab");
  assert(analyticsTsx.includes("addLeadMutation"), "Must preserve Add Lead capability");
  assert(analyticsTsx.includes("updateLeadMutation"), "Must preserve Edit/Update Lead capability");
  assert(analyticsTsx.includes("deleteLeadMutation"), "Must preserve Delete Lead capability");
  assert(analyticsTsx.includes("Live Stream") || analyticsTsx.includes("live-feed"), "Must preserve Live Activity Stream");
  assert(analyticsTsx.includes("handleExportLeads"), "Must preserve CSV export");
  assert(analyticsTsx.includes("handleExportAnalytics"), "Must preserve JSON export");
  // Check formula injection sanitization in CSV export
  assert(analyticsTsx.includes("sanitizeCsvCell"), "CSV export must sanitize formula triggers");
});

// 7. TabsContent value='analytics' is mounted and wired with onSelectTab
runCheck(7, "TabsContent value='analytics' mounts Analytics with onSelectTab", () => {
  assert(projectEditTsx.includes('<TabsContent value="analytics">'), "project-edit.tsx must have <TabsContent value='analytics'>");
  assert(
    projectEditTsx.includes('<Analytics projectId={projectId} onSelectTab={handleTabChange} />'),
    "Analytics component must be mounted with projectId and onSelectTab handler"
  );
  assert(
    projectEditTsx.includes('<DashboardOverview key={projectId} projectId={projectId} onSelectTab={handleTabChange} />'),
    "DashboardOverview must be mounted with onSelectTab handler"
  );
});

// 8. All Navigation dropdown and Subnav include Analytics shortcuts
runCheck(8, "All Navigation dropdown and Subnav include Analytics shortcuts", () => {
  assert(
    projectEditTsx.includes('handleTabChange("analytics")'),
    "project-edit.tsx must support navigating to 'analytics'"
  );
  assert(
    projectEditTsx.includes("Chatbot Analytics"),
    "All Navigation dropdown must contain 'Chatbot Analytics' shortcut"
  );
  assert(
    projectEditTsx.includes("isAnalytics ? (") &&
    projectEditTsx.includes("Chatbot Analytics & Intelligence"),
    "Subnav must display 'Chatbot Analytics & Intelligence' badge pill when tab is analytics"
  );
});

console.log("\n------------------------------------------------------------------------");
console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("------------------------------------------------------------------------\n");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("ALL UNIFIED ANALYTICS & NAVIGATION INTEGRATION CHECKS PASSED!");
}
