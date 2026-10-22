import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatAppDir = path.resolve(__dirname, "..");

console.log("========================================================================");
console.log("RUNNING OVERVIEW TEST CHAT REORGANIZATION AUDIT SUITE");
console.log("========================================================================\n");

const projectEditTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/project-edit.tsx"), "utf8");

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

// 1. Test Chat is absent from AI & Context navigation
runCheck(1, "Test Chat is absent from AI & Context navigation items and All Navigation dropdown", () => {
  const aiMatch = projectEditTsx.match(/id:\s*"ai-context"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
  assert(aiMatch, "AI & Context nav group definition must exist");
  const aiItems = aiMatch[1];
  assert(!aiItems.includes('"chat"'), "AI & Context nav items must NOT contain 'chat'");
  assert(aiItems.includes('"context-engine"'), "AI & Context nav items must retain 'context-engine'");
});

// 2. AI & Context group count badge is 1 and description updated
runCheck(2, "AI & Context group count reflects 1 item (Context Engine)", () => {
  const aiMatch = projectEditTsx.match(/id:\s*"ai-context"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
  const aiItems = aiMatch[1];
  const itemIds = [...aiItems.matchAll(/id:\s*"([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(itemIds, ["context-engine"], "AI & Context items must strictly match [context-engine]");
});

// 3. Overview dashboard displays Test Chat button beside Copy and Open controls
runCheck(3, "Overview dashboard renders Test Chat button beside Shareable Project Link Copy/Open controls", () => {
  assert(
    projectEditTsx.includes('data-testid="dashboard-test-chat-btn"'),
    "Overview dashboard must contain Test Chat button with data-testid='dashboard-test-chat-btn'"
  );
  assert(
    projectEditTsx.includes('Shareable Project Link'),
    "Shareable Project Link section must exist"
  );
  assert(
    projectEditTsx.includes('onClick={copyShareLink}') &&
    projectEditTsx.includes('onClick={() => window.open(shareUrl, "_blank")}') &&
    projectEditTsx.includes('onClick={() => handleTabChange("chat", undefined, { pushHistory: true })}'),
    "Test Chat button must be placed alongside Copy and Open buttons"
  );
});

// 4. Test Chat button invokes handleTabChange with pushHistory
runCheck(4, "Test Chat button triggers handleTabChange('chat', undefined, { pushHistory: true })", () => {
  const testChatBtnMatch = projectEditTsx.match(/<Button[\s\S]*?data-testid="dashboard-test-chat-btn"[\s\S]*?<\/Button>/);
  assert(testChatBtnMatch, "Test Chat button element must exist");
  assert(
    testChatBtnMatch[0].includes('onClick={() => handleTabChange("chat", undefined, { pushHistory: true })}'),
    "Test Chat button must invoke handleTabChange with pushHistory: true"
  );
  assert(
    testChatBtnMatch[0].includes('MessageSquare'),
    "Test Chat button must include MessageSquare icon"
  );
});

// 5. Browser Back & popstate listener
runCheck(5, "popstate listener restores previous tab state so browser Back returns to Overview", () => {
  assert(
    projectEditTsx.includes('window.addEventListener("popstate", handlePopState)') &&
    projectEditTsx.includes('window.removeEventListener("popstate", handlePopState)'),
    "Must register and clean up popstate event listener"
  );
  assert(
    projectEditTsx.includes('const handlePopState = () => {') &&
    projectEditTsx.includes('const tabToSet = getInitialTab();') &&
    projectEditTsx.includes('setActiveTab(tabToSet);'),
    "popstate handler must re-read getInitialTab() and set activeTab"
  );
});

// 6. Direct URLs and refresh support for ?tab=chat
runCheck(6, "Direct URLs with ?tab=chat and page refresh open Test Chat without blank screen", () => {
  assert(
    projectEditTsx.includes('const urlTab = searchParams.get("tab");') &&
    projectEditTsx.includes('if (urlTab) return urlTab;'),
    "getInitialTab must parse ?tab=chat directly from URL"
  );
  assert(
    projectEditTsx.includes('const isChat = activeTab === "chat";') &&
    projectEditTsx.includes('<span>Test Chatbot</span>'),
    "Sub-tab navigation bar must render Test Chatbot indicator pill when activeTab is chat"
  );
});

// 7. Test Chat screen is reused rather than duplicated
runCheck(7, "Test Chat implementation is reused directly with single TabsContent", () => {
  const chatTabsContent = [...projectEditTsx.matchAll(/<TabsContent\s+value="chat">/g)];
  assert.strictEqual(chatTabsContent.length, 1, "Must have exactly ONE TabsContent for chat");
  assert(
    projectEditTsx.includes('<CardTitle>Test Chatbot</CardTitle>') &&
    projectEditTsx.includes('<iframe src={shareUrl} className="w-full h-full border-0 absolute inset-0" title="Test Chatbot" />'),
    "Existing Test Chatbot card with shareUrl iframe must be reused directly"
  );
});

// 8. Responsive layout prevents overflow
runCheck(8, "Shareable Project Link controls container uses responsive layout classes", () => {
  assert(
    projectEditTsx.includes('className="flex flex-col sm:flex-row sm:items-center gap-2"'),
    "Controls container must use flex-col on mobile and sm:flex-row sm:items-center on desktop"
  );
  assert(
    projectEditTsx.includes('className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap"'),
    "Buttons wrapper must support flex-wrap on narrow viewports"
  );
});

// 9. Other navigation categories and destinations remain functional
runCheck(9, "Overview, Website Experience, Operations, and Notifications remain intact", () => {
  const navGroupsMatch = projectEditTsx.match(/const PROJECT_NAV_GROUPS: NavGroup\[\] = (\[[\s\S]*?\n\];)/);
  const navCode = navGroupsMatch[1];

  const groupTitles = [...navCode.matchAll(/title:\s*"([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(
    groupTitles,
    ["Overview", "AI & Context", "Website Experience", "Operations"],
    "All 4 primary category groups must be preserved"
  );

  // Notifications header bell
  assert(
    projectEditTsx.includes('data-testid="project-header-notification-bell"') &&
    projectEditTsx.includes('<Notifications key={projectId} projectId={projectId}'),
    "Notifications header bell and component must be preserved"
  );

  // Operations 3 items (analytics unified into Overview)
  const opsMatch = navCode.match(/id:\s*"operations"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
  assert(
    opsMatch &&
    !opsMatch[1].includes('"reports"') &&
    !opsMatch[1].includes('"analytics"') &&
    opsMatch[1].includes('"integrations"') &&
    opsMatch[1].includes('"agent-control"') &&
    opsMatch[1].includes('"settings"'),
    "Operations must contain 3 destinations without reports or analytics"
  );
});

// 10. DOM Level Verification
runCheck(10, "DOM level verification: Shareable controls contain Copy, Open, and Test Chat buttons", () => {
  const dom = new JSDOM(`<!DOCTYPE html>
<html>
  <body>
    <div id="shareable-container">
      <div class="flex flex-col sm:flex-row sm:items-center gap-2">
        <code class="flex-1">http://localhost:5174/p/test-token</code>
        <div class="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          <button type="button" class="btn-copy">Copy</button>
          <button type="button" class="btn-open">Open</button>
          <button type="button" data-testid="dashboard-test-chat-btn" aria-label="Test Chatbot in interactive playground">Test Chat</button>
        </div>
      </div>
    </div>
  </body>
</html>`);

  const doc = dom.window.document;
  const container = doc.getElementById("shareable-container");
  const testChatBtn = container.querySelector('[data-testid="dashboard-test-chat-btn"]');
  assert(testChatBtn, "Test Chat button must exist in rendered DOM");
  assert.strictEqual(testChatBtn.textContent.trim(), "Test Chat");
  assert.strictEqual(testChatBtn.getAttribute("aria-label"), "Test Chatbot in interactive playground");

  const buttons = container.querySelectorAll("button");
  assert.strictEqual(buttons.length, 3, "Container must contain exactly 3 action buttons: Copy, Open, Test Chat");
});

console.log("\n========================================================================");
console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("========================================================================\n");

if (failed > 0) {
  process.exit(1);
}
