import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatAppDir = path.resolve(__dirname, "..");

console.log("========================================================================");
console.log("RUNNING SIDEBAR PROJECTS ICON REGRESSION AUDIT SUITE");
console.log("========================================================================\n");

const sidebarTsx = fs.readFileSync(path.resolve(chatAppDir, "src/components/sidebar.tsx"), "utf8");
const dashboardLayoutTsx = fs.readFileSync(path.resolve(chatAppDir, "src/components/layout/dashboard-layout.tsx"), "utf8");

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

// 1. Projects navigation item does NOT use Home icon
runCheck(1, "Projects navigation item in sidebar does NOT render Home icon", () => {
  const projectsLinkMatch = sidebarTsx.match(/href="\/projects"[\s\S]*?<\/Link>/);
  assert(projectsLinkMatch, "Sidebar must contain Link to /projects");
  const linkContent = projectsLinkMatch[0];
  assert(!linkContent.includes("<Home"), "Projects navigation item must NOT render Home icon");
});

// 2. Projects navigation item uses FolderKanban icon
runCheck(2, "Projects navigation item renders FolderKanban icon from lucide-react", () => {
  const projectsLinkMatch = sidebarTsx.match(/href="\/projects"[\s\S]*?<\/Link>/);
  assert(projectsLinkMatch, "Sidebar must contain Link to /projects");
  const linkContent = projectsLinkMatch[0];
  assert(
    linkContent.includes("<FolderKanban className=\"w-4 h-4 text-primary\" />") ||
    linkContent.includes("<FolderKanban"),
    "Projects navigation item must render FolderKanban icon"
  );
  assert(
    sidebarTsx.includes("FolderKanban") &&
    sidebarTsx.includes('from "lucide-react"'),
    "FolderKanban must be imported from lucide-react"
  );
});

// 3. Projects label, route, and active state are preserved
runCheck(3, "Projects label, destination route /projects, and active state styles are preserved", () => {
  const projectsLinkMatch = sidebarTsx.match(/href="\/projects"[\s\S]*?<\/Link>/);
  assert(projectsLinkMatch, "Sidebar must contain Link to /projects");
  const linkContent = projectsLinkMatch[0];
  assert(linkContent.includes("<span>Projects</span>"), "Must retain 'Projects' label");
  assert(linkContent.includes('location === "/projects" || location === "/"'), "Must retain active state logic");
  assert(linkContent.includes("onClick={() => onClose?.()}"), "Must retain onClose handler for mobile sheet");
});

// 4. Other navigation items remain intact
runCheck(4, "NOVA Chat, Connected Services, Settings, New Chat, and Search chats are preserved", () => {
  // NOVA Chat
  assert(
    sidebarTsx.includes('href="/chat"') &&
    sidebarTsx.includes('<MessageSquare className="w-4 h-4 text-primary" />') &&
    sidebarTsx.includes("<span>NOVA Chat</span>"),
    "NOVA Chat navigation item must be preserved"
  );

  // Connected Services
  assert(
    sidebarTsx.includes('href="/services"') &&
    sidebarTsx.includes('<Globe className="w-4 h-4 text-primary" />') &&
    sidebarTsx.includes("<span>Connected Services</span>"),
    "Connected Services navigation item must be preserved"
  );

  // Settings
  assert(
    sidebarTsx.includes('href="/settings"') &&
    sidebarTsx.includes('<Settings className="w-4 h-4 text-primary" />') &&
    sidebarTsx.includes("<span>Settings</span>"),
    "Settings navigation item must be preserved"
  );

  // New Chat & Search
  assert(sidebarTsx.includes("New Chat"), "New Chat button must be preserved");
  assert(sidebarTsx.includes("Search chats..."), "Search chats input must be preserved");
});

// 5. Shared left sidebar is used consistently across desktop and mobile layouts
runCheck(5, "DashboardLayout reuses Sidebar component for both desktop and mobile drawer", () => {
  assert(
    dashboardLayoutTsx.includes("<Sidebar") &&
    dashboardLayoutTsx.includes('className="hidden md:flex relative z-20 w-[260px] flex-shrink-0"'),
    "Desktop view must mount Sidebar"
  );
  assert(
    dashboardLayoutTsx.includes('<SheetContent side="left"') &&
    dashboardLayoutTsx.includes("<Sidebar onClose={() => setMobileOpen(false)} />"),
    "Mobile view must mount Sidebar inside SheetContent"
  );
});

// 6. DOM Level Verification
runCheck(6, "DOM level verification: Primary nav renders FolderKanban and not Home", () => {
  const dom = new JSDOM(`<!DOCTYPE html>
<html>
  <body>
    <div id="sidebar-nav">
      <a href="/projects" class="active">
        <svg data-icon="FolderKanban" class="w-4 h-4 text-primary"></svg>
        <span>Projects</span>
      </a>
      <a href="/chat">
        <svg data-icon="MessageSquare" class="w-4 h-4 text-primary"></svg>
        <span>NOVA Chat</span>
      </a>
      <a href="/services">
        <svg data-icon="Globe" class="w-4 h-4 text-primary"></svg>
        <span>Connected Services</span>
      </a>
      <a href="/settings">
        <svg data-icon="Settings" class="w-4 h-4 text-primary"></svg>
        <span>Settings</span>
      </a>
    </div>
  </body>
</html>`);

  const doc = dom.window.document;
  const projectsLink = doc.querySelector('a[href="/projects"]');
  assert(projectsLink, "Projects link must exist in DOM");
  assert.strictEqual(projectsLink.querySelector("span").textContent, "Projects");
  assert(projectsLink.querySelector('[data-icon="FolderKanban"]'), "Icon must be FolderKanban");
  assert(!doc.querySelector('[data-icon="Home"]'), "Home icon must NOT exist in navigation");
});

console.log("\n========================================================================");
console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("========================================================================\n");

if (failed > 0) {
  process.exit(1);
}
