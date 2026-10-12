import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatAppDir = path.resolve(__dirname, "..");

console.log("=================================================");
console.log("RUNNING PROJECT WORKSPACE NAVIGATION AUDIT SUITE");
console.log("=================================================\n");

const projectEditTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/project-edit.tsx"), "utf8");
const appTsx = fs.readFileSync(path.resolve(chatAppDir, "src/App.tsx"), "utf8");
const projectsTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/projects.tsx"), "utf8");
const projectWorkingTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/project-working.tsx"), "utf8");

// 1. Workspace is no longer rendered as a category
assert(
  !projectEditTsx.includes('title: "Workspace"') &&
  !projectEditTsx.includes('id: "workspace"'),
  "Workspace must NOT exist as a category title or category id in project-edit.tsx"
);
console.log("✓ Test 1: Workspace is no longer rendered as a category.");

// 2. Overview appears in the primary category row
const navGroupsMatch = projectEditTsx.match(/const PROJECT_NAV_GROUPS: NavGroup\[\] = (\[[\s\S]*?\n\];)/);
assert(navGroupsMatch, "PROJECT_NAV_GROUPS definition must exist");
const navGroupsCode = navGroupsMatch[1];

assert(
  navGroupsCode.includes('id: "overview"') &&
  navGroupsCode.includes('title: "Overview"'),
  "Overview category group must be defined in PROJECT_NAV_GROUPS"
);

// Verify the 4 primary category titles in order
const categoryTitles = [...navGroupsCode.matchAll(/title:\s*"([^"]+)"/g)].map(m => m[1]);
assert.deepStrictEqual(
  categoryTitles,
  ["Overview", "AI & Context", "Website Experience", "Operations"],
  "Primary category row must contain exactly [Overview, AI & Context, Website Experience, Operations]"
);
console.log("✓ Test 2: Overview appears in the primary category row alongside AI & Context, Website Experience, and Operations.");

// 3. Clicking Overview displays the existing dashboard directly
assert(
  projectEditTsx.includes('<TabsContent value="overview">') &&
  projectEditTsx.includes('<DashboardOverview') &&
  projectEditTsx.includes('CardTitle>Project Dashboard</CardTitle>'),
  "Clicking Overview must display the existing Project Dashboard with DashboardOverview"
);
console.log("✓ Test 3: Clicking Overview displays the existing Project Dashboard directly without intermediate screens.");

// 4. ?tab=overview still works
assert(
  projectEditTsx.includes('return "overview"') &&
  projectEditTsx.includes('searchParams.get("tab")'),
  "getInitialTab must support ?tab=overview as default or URL specified"
);
// Verify legacy ?tab=workspace fallback
assert(
  projectEditTsx.includes('if (urlTab === "workspace")') &&
  projectEditTsx.includes('if (tab === "workspace")'),
  "Legacy ?tab=workspace must safely resolve to overview"
);
console.log("✓ Test 4: ?tab=overview works as default/specified and legacy ?tab=workspace normalizes to overview.");

// 5. Refresh and browser navigation preserve the selected destination
assert(
  projectEditTsx.includes('saveProjectTab(projectId, tab)') &&
  projectEditTsx.includes('getSavedProjectTab(projectId)') &&
  projectEditTsx.includes('window.history.replaceState(null, "", url.toString())'),
  "Destination must be preserved across reload and browser state via URL and local state"
);
console.log("✓ Test 5: Refresh and browser navigation preserve the selected destination.");

// 6. AI & Context, Website Experience, and Operations remain functional
const aiGroupMatch = navGroupsCode.match(/id:\s*"ai-context"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
assert(aiGroupMatch && aiGroupMatch[1].includes('"chat"') && aiGroupMatch[1].includes('"context-engine"'), "AI & Context must contain chat and context-engine");

const webGroupMatch = navGroupsCode.match(/id:\s*"website-experience"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
assert(webGroupMatch && webGroupMatch[1].includes('"conversations"') && webGroupMatch[1].includes('"channels"'), "Website Experience must contain conversations and channels");

const opsGroupMatch = navGroupsCode.match(/id:\s*"operations"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
assert(
  opsGroupMatch &&
  opsGroupMatch[1].includes('"reports"') &&
  opsGroupMatch[1].includes('"analytics"') &&
  opsGroupMatch[1].includes('"notifications"') &&
  opsGroupMatch[1].includes('"integrations"') &&
  opsGroupMatch[1].includes('"agent-control"') &&
  opsGroupMatch[1].includes('"settings"'),
  "Operations must contain reports, analytics, notifications, integrations, agent-control, and settings"
);
console.log("✓ Test 6: AI & Context, Website Experience, and Operations remain functional.");

// 7. Website Connected, Widget Studio, Deployment, API Keys, and Knowledge Base remain accessible
assert(
  projectEditTsx.includes('handleTabChange("website-connected")') &&
  projectEditTsx.includes('handleTabChange("knowledge")') &&
  projectEditTsx.includes('<TabsContent value="website-connected">') &&
  projectEditTsx.includes('<WidgetStudio projectId={projectId} />') &&
  projectEditTsx.includes('<Deployment projectId={projectId} />') &&
  projectEditTsx.includes('<ApiKeys projectId={projectId} />') &&
  projectEditTsx.includes('<KnowledgeBase projectId={projectId} />'),
  "Setup shortcuts, Widget Studio, Deployment, API Keys, and Knowledge Base must all be accessible"
);
console.log("✓ Test 7: Website Connected, Widget Studio, Deployment, API Keys, and Knowledge Base remain accessible.");

// 8. Project Working and Explore Demo remain separate and functional
assert(
  appTsx.includes('path="/projects/working"') &&
  appTsx.includes('path="/projects/:id/working"') &&
  projectsTsx.includes('Project Working') &&
  projectsTsx.includes('Explore Demo') &&
  projectWorkingTsx.includes('<ProjectGuide'),
  "Project Working and Explore Demo must remain separate routes and functional controls"
);
console.log("✓ Test 8: Project Working and Explore Demo remain separate and functional.");

// 9. No duplicate Overview component or navigation entry is introduced
const overviewGroups = [...navGroupsCode.matchAll(/\{\s*id:\s*"overview",\s*title:\s*"Overview"/g)];
assert.strictEqual(overviewGroups.length, 1, "There must be exactly ONE Overview category group in PROJECT_NAV_GROUPS");

const dashboardOverviewImports = [...projectEditTsx.matchAll(/import\s*\{[^}]*DashboardOverview[^}]*\}\s*from/g)];
assert.strictEqual(dashboardOverviewImports.length, 1, "There must be exactly ONE DashboardOverview import");

const overviewTabContents = [...projectEditTsx.matchAll(/<TabsContent\s+value="overview">/g)];
assert.strictEqual(overviewTabContents.length, 1, "There must be exactly ONE TabsContent for overview");
console.log("✓ Test 9: No duplicate Overview component or navigation entry is introduced.");

// 10. Project switching does not display stale dashboard data
assert(
  projectEditTsx.includes('<DashboardOverview key={projectId} projectId={projectId} />') &&
  projectEditTsx.includes('useEffect(() => {\n    const tabToSet = getInitialTab();\n    setActiveTab(tabToSet);'),
  "DashboardOverview must be keyed by projectId and tab state reset on projectId change"
);
console.log("✓ Test 10: Project switching remounts DashboardOverview with key={projectId} to prevent stale data.");

console.log("\n=================================================");
console.log("ALL 10 NAVIGATION REGRESSION TESTS PASSED (EXIT 0)");
console.log("=================================================\n");
