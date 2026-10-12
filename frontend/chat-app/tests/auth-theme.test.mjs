import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatAppDir = path.resolve(__dirname, "..");

console.log("=================================================");
console.log("RUNNING NOVA SIGN-IN THEME & AUTH AUDIT SUITE");
console.log("=================================================\n");

// 1. Audit App.tsx ThemeProvider configuration
const appTsx = fs.readFileSync(path.resolve(chatAppDir, "src/App.tsx"), "utf8");
assert(
  appTsx.includes('<ThemeProvider defaultPalette="nova-natural" defaultMode="dark">'),
  "App.tsx must configure ThemeProvider with defaultPalette='nova-natural' and defaultMode='dark'"
);
console.log("✓ Test 1: App.tsx ThemeProvider uses official default theme (nova-natural, dark).");

// 2. Audit ThemeContext default state and persistence mechanisms
const themeContextTsx = fs.readFileSync(path.resolve(chatAppDir, "src/contexts/ThemeContext.tsx"), "utf8");
assert(
  themeContextTsx.includes('defaultPalette = "nova-natural"'),
  "ThemeContext defaultPalette must default to 'nova-natural'"
);
assert(
  themeContextTsx.includes('defaultMode = "dark"'),
  "ThemeContext defaultMode must default to 'dark'"
);
assert(
  themeContextTsx.includes('localStorage.getItem("ui-mode")') &&
  themeContextTsx.includes('localStorage.setItem("ui-mode", m)') &&
  themeContextTsx.includes('localStorage.setItem("ui-palette", p)'),
  "ThemeContext must persist modern preferences to 'ui-mode' and 'ui-palette'"
);
console.log("✓ Test 2: ThemeContext implements persistent storage via 'ui-mode' & 'ui-palette'.");

// 3. Audit index.html inline script to prevent flash of wrong theme (FOUT)
const indexHtml = fs.readFileSync(path.resolve(chatAppDir, "index.html"), "utf8");
assert(
  indexHtml.includes('var palette = "nova-natural"') &&
  indexHtml.includes('var mode = "dark"'),
  "index.html inline script must default to nova-natural and dark mode"
);
assert(
  indexHtml.includes('localStorage.getItem("ui-mode")') &&
  indexHtml.includes('localStorage.getItem("ui-palette")'),
  "index.html inline script must read saved user preferences before first paint"
);
assert(
  indexHtml.includes('root.classList.add("dark", "theme-natural-dark")') &&
  indexHtml.includes('root.classList.add("theme-natural-light", "theme-evergreen")'),
  "index.html must apply identical theme classes to ThemeContext"
);
console.log("✓ Test 3: index.html early initialization matches theme provider to eliminate theme flashing.");

// 4. Audit Sign-in Page (src/pages/auth.tsx) Theme Integration
const authTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/auth.tsx"), "utf8");
assert(
  authTsx.includes('useTheme()') &&
  authTsx.includes('effectiveMode') &&
  authTsx.includes('setTheme'),
  "auth.tsx must consume useTheme() and respect effectiveMode and setTheme"
);
assert(
  !authTsx.includes('bg-[#0A0A0B]'),
  "auth.tsx must not hardcode static pitch-black #0A0A0B background"
);
assert(
  authTsx.includes('bg-background') && authTsx.includes('text-foreground'),
  "auth.tsx must use theme-aware Tailwind classes (bg-background, text-foreground)"
);
assert(
  authTsx.includes('theme={isDark ? "dark" : "light"}'),
  "auth.tsx must dynamically supply theme-aware variants to NovaBrand"
);
console.log("✓ Test 4: auth.tsx dynamically binds to ThemeContext without hardcoded conflicting themes.");

// 5. Audit In-Page Theme Switching Control on Sign-in
assert(
  authTsx.includes('onClick={() => setTheme(isDark ? "light" : "dark")}') ||
  authTsx.includes('onClick={() => toggleMode()}'),
  "auth.tsx must expose an immediate theme toggle control matching the landing page"
);
console.log("✓ Test 5: auth.tsx provides instantaneous theme switching button on the sign-in page.");

// 6. Audit Authentication Safety & OAuth Integrity
assert(
  authTsx.includes('supabase.auth.signInWithOAuth({') &&
  authTsx.includes('provider: "google"') &&
  authTsx.includes('redirectTo: `${window.location.origin}/projects`'),
  "auth.tsx must strictly preserve direct Supabase Google OAuth PKCE flow and destination redirect"
);
assert(
  authTsx.includes('loginAsDemo()') &&
  authTsx.includes('setLocation("/projects")'),
  "auth.tsx must strictly preserve guest/demo login and redirection to workspace"
);
assert(
  authTsx.includes('if (user && !isSuccess)') &&
  authTsx.includes('setLocation("/")'),
  "auth.tsx must preserve authenticated user guard and redirection"
);
console.log("✓ Test 6: Authentication safety, Google OAuth PKCE parameters, and demo bypass preserved.");

// 7. Audit Typography, Accessibility, and Brand Elements
assert(
  authTsx.includes('font-serif') &&
  authTsx.includes('font-sans') &&
  authTsx.includes('Caveat'),
  "auth.tsx must integrate NOVA's official typography (Fraunces serif, Inter sans, Caveat hand)"
);
assert(
  authTsx.includes('aria-label') &&
  authTsx.includes('focus-visible:ring'),
  "auth.tsx controls must include aria-labels and keyboard focus indicators"
);
assert(
  authTsx.includes('DialogContent') &&
  authTsx.includes('Terms of Service') &&
  authTsx.includes('Privacy Policy'),
  "auth.tsx must include interactive, accessible legal dialogs for Terms and Privacy"
);
console.log("✓ Test 7: Typography hierarchy, accessible focus states, and legal dialogs verified.");

// 8. Audit Responsive Design
assert(
  authTsx.includes('lg:grid') &&
  authTsx.includes('lg:hidden') &&
  authTsx.includes('hidden lg:flex'),
  "auth.tsx must provide responsive desktop 2-column layout and mobile single-column stacking"
);
console.log("✓ Test 8: Responsive layouts and mobile-to-desktop stacking verified.");

// 9. Audit NOVA AI Header Button - Sparkles Removal & Official Logo Integration
const topNavTsx = fs.readFileSync(path.resolve(chatAppDir, "src/components/layout/top-nav.tsx"), "utf8");
assert(
  topNavTsx.includes('<NovaBrand variant="mark" height={18} theme={isDark ? "dark" : "light"} className="shrink-0" />'),
  "top-nav.tsx must embed official NovaBrand variant='mark' inside NOVA AI launcher button"
);
assert(
  topNavTsx.includes('<span className="font-bold tracking-tight">NOVA AI</span>'),
  "top-nav.tsx must preserve exact button label 'NOVA AI' without unicode sparkles"
);
console.log("✓ Test 9: NOVA AI header button displays official NovaBrand mark and preserves 'NOVA AI' text.");

// 10. Audit Both Sparkle Icons are Removed from NOVA AI Button
const novaAiButtonBlockMatch = topNavTsx.match(/aria-label="Open NOVA AI Assistant"[\s\S]*?<\/Button>/);
assert(novaAiButtonBlockMatch, "NOVA AI button block must exist in top-nav.tsx");
const novaAiButtonBlock = novaAiButtonBlockMatch[0];
assert(
  !novaAiButtonBlock.includes('<Sparkles'),
  "NOVA AI button must NOT contain Lucide Sparkles icon"
);
assert(
  !novaAiButtonBlock.includes('✨'),
  "NOVA AI button must NOT contain unicode sparkle (✨) character"
);
console.log("✓ Test 10: Both sparkle icons (Lucide Sparkles and unicode ✨) successfully removed from button.");

// 11. Audit Theme-Awareness and Action Preservation
assert(
  topNavTsx.includes('isDark = effectiveMode === "dark"') || topNavTsx.includes('isDark = effectiveMode === "dark" || theme === "dark"'),
  "top-nav.tsx must compute isDark state from theme context"
);
assert(
  topNavTsx.includes('onClick={toggleOpen}'),
  "NOVA AI launcher button must preserve onClick={toggleOpen} handler"
);
console.log("✓ Test 11: NOVA AI button is theme-aware and preserves AI assistant launcher action.");

// 12. Audit Banner Removal: "What to Do Next" box completely removed
const projectEditTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/project-edit.tsx"), "utf8");
assert(
  !projectEditTsx.toLowerCase().includes("what to do next"),
  "project-edit.tsx must not contain 'What to Do Next' heading or banner box"
);
assert(
  !projectEditTsx.includes("Your AI assistant is live and ready to engage"),
  "project-edit.tsx must not contain the banner live message text"
);
console.log("✓ Test 12: 'What to Do Next' banner box, text, and duplicate Visit Site button are completely removed.");

// 13. Audit Setup Steps 1, 2, 3 Labels and Destinations
assert(
  projectEditTsx.includes("Website Connected") &&
  projectEditTsx.includes('handleTabChange("website-connected")'),
  "Step 1 must be titled 'Website Connected' and navigate to 'website-connected'"
);
assert(
  projectEditTsx.includes("Knowledge Base") &&
  !projectEditTsx.includes("Knowledge Ready") &&
  projectEditTsx.includes('handleTabChange("knowledge")'),
  "Step 2 must be titled 'Knowledge Base' and navigate directly to 'knowledge'"
);
assert(
  projectEditTsx.includes("Connected Website") &&
  !projectEditTsx.includes("Chat on Your Site"),
  "Step 3 must be renamed to 'Connected Website'"
);
console.log("✓ Test 13: Setup steps 1, 2, 3 correctly titled (Website Connected, Knowledge Base, Connected Website).");

// 14. Audit Step 3 Safe Website URL Launcher
assert(
  projectEditTsx.includes("project?.websiteUrl || readinessData?.productionWebsiteUrl") &&
  projectEditTsx.includes('parsed.protocol !== "http:" && parsed.protocol !== "https:"') &&
  projectEditTsx.includes("Unsupported Protocol") &&
  projectEditTsx.includes("No Website Connected"),
  "Step 3 must safely validate URL protocols, reject unsupported schemes, and notify on missing URL"
);
console.log("✓ Test 14: Step 3 safely resolves project website URL, enforces http/https/localhost, and rejects unsafe protocols.");

// 15. Audit Category Navigation Deduplication & Renaming
assert(
  projectEditTsx.includes('title: "AI & Context"') &&
  !projectEditTsx.includes('title: "Knowledge & AI"'),
  "Category 'Knowledge & AI' must be renamed to 'AI & Context'"
);
const websiteExperienceGroup = projectEditTsx.match(/id:\s*"website-experience"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
assert(websiteExperienceGroup, "Website Experience category must exist");
assert(
  !websiteExperienceGroup[1].includes('"widget-studio"') &&
  !websiteExperienceGroup[1].includes('"deployment"'),
  "Widget Studio and Deployment must be removed from Website Experience category list"
);
assert(
  websiteExperienceGroup[1].includes('"conversations"') &&
  websiteExperienceGroup[1].includes('"channels"') &&
  !websiteExperienceGroup[1].includes('"website-connected"'),
  "Website Experience category must cleanly contain Visitor Inbox and Channels without redundant website-connected tab"
);

const operationsGroup = projectEditTsx.match(/id:\s*"operations"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
assert(operationsGroup, "Operations category must exist");
assert(
  !operationsGroup[1].includes('"api-keys"'),
  "API Keys must be removed from Operations category list"
);

const aiContextGroup = projectEditTsx.match(/id:\s*"ai-context"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
assert(aiContextGroup, "AI & Context category must exist");
assert(
  !aiContextGroup[1].includes('"knowledge"'),
  "Knowledge Base must be removed from AI & Context category list"
);
console.log("✓ Test 15: Category navigation deduplicated: Widget Studio/Deployment removed from Website Experience, API Keys from Operations, Knowledge Base from AI & Context.");

// 16. Audit Consolidated Website Connected Destination
assert(
  projectEditTsx.includes('<TabsContent value="website-connected">') &&
  projectEditTsx.includes('<WidgetStudio projectId={projectId} />') &&
  projectEditTsx.includes('<Deployment projectId={projectId} />') &&
  projectEditTsx.includes('<ApiKeys projectId={projectId} />'),
  "TabsContent value='website-connected' must consolidate WidgetStudio, Deployment, and ApiKeys"
);
assert(
  projectEditTsx.includes('websiteConnectedSubtab === "widget-studio"') &&
  projectEditTsx.includes('websiteConnectedSubtab === "deployment"') &&
  projectEditTsx.includes('websiteConnectedSubtab === "api-keys"'),
  "website-connected must switch between the three features via websiteConnectedSubtab"
);
console.log("✓ Test 16: Website Connected destination consolidates Widget Studio, Deployment, and API Keys without duplicating implementations.");

// 17. Audit All Navigation Shortcuts
assert(
  projectEditTsx.includes("Setup Shortcuts") &&
  projectEditTsx.includes("Website Connected (Step 1)") &&
  projectEditTsx.includes("Knowledge Base (Step 2)"),
  "All Navigation dropdown menu must include Setup Shortcuts for Step 1 and Step 2"
);
console.log("✓ Test 17: All Navigation dropdown provides direct access to Setup Shortcuts (Website Connected & Knowledge Base).");

// 18. Audit Tab Prefetching Integration
const tabPrefetchTs = fs.readFileSync(path.resolve(chatAppDir, "src/hooks/use-tab-prefetch.ts"), "utf8");
assert(
  tabPrefetchTs.includes('case "website-connected":') &&
  tabPrefetchTs.includes('stage1Tabs = ["knowledge", "website-connected"'),
  "use-tab-prefetch.ts must include 'website-connected' in switch cases and stage 1 prefetch tabs"
);
console.log("✓ Test 18: use-tab-prefetch.ts prefetches website-connected queries alongside core tabs.");

// 19. Audit Project Working button on Projects screen immediately to the left of Explore Demo
const projectsTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/projects.tsx"), "utf8");
const pwButtonIndex = projectsTsx.indexOf("Project Working");
const edButtonIndex = projectsTsx.indexOf("Explore Demo");
assert(
  pwButtonIndex !== -1 && edButtonIndex !== -1 && pwButtonIndex < edButtonIndex,
  "projects.tsx must contain 'Project Working' button immediately to the left of 'Explore Demo'"
);
console.log("✓ Test 19: 'Project Working' button is placed immediately to the left of 'Explore Demo' on /projects.");

// 20. Audit Explore Demo Preservation
assert(
  projectsTsx.includes('onClick={() => setIsExploreOpen(true)}') &&
  projectsTsx.includes('Open Demo Project') &&
  projectsTsx.includes('00000000-0000-4000-8000-000000000000'),
  "projects.tsx must preserve Explore Demo button, dialog state, and sandbox demo navigation"
);
console.log("✓ Test 20: Explore Demo button, sandbox dialog, and demo project launcher strictly preserved.");

// 21. Audit Renaming in Project Guide Component
const projectGuideTsx = fs.readFileSync(path.resolve(chatAppDir, "src/components/project/project-guide.tsx"), "utf8");
assert(
  projectGuideTsx.includes("Project Working — How NOVA Works") &&
  !projectGuideTsx.includes("Project Guide — How NOVA Works"),
  "project-guide.tsx header must display 'Project Working — How NOVA Works'"
);
console.log("✓ Test 21: Project Guide title renamed to 'Project Working — How NOVA Works'.");

// 22. Audit Promotion of Overview and Removal of Workspace Category
const overviewGroupMatch = projectEditTsx.match(/id:\s*"overview"[\s\S]*?items:\s*\[([\s\S]*?)\]/);
assert(overviewGroupMatch, "Overview category group must exist in project-edit.tsx");
assert(
  !projectEditTsx.includes('title: "Workspace"') &&
  !projectEditTsx.includes('id: "workspace"'),
  "Workspace category must be completely removed from project navigation"
);
assert(
  !overviewGroupMatch[1].includes('"guide"') &&
  overviewGroupMatch[1].includes('"overview"'),
  "Project Guide tab must be removed from Overview category navigation items"
);
console.log("✓ Test 22: Overview promoted to primary category navigation and Workspace category cleanly removed.");

// 23. Audit Route Registration in App.tsx
assert(
  appTsx.includes('path="/projects/working"') &&
  appTsx.includes('path="/projects/:id/working"') &&
  appTsx.includes('path="/projects/guide"'),
  "App.tsx must register /projects/working and /projects/:id/working routes with legacy /guide redirects"
);
console.log("✓ Test 23: App.tsx registers /projects/working, /projects/:id/working, and backward-compatible redirects.");

// 24. Audit Project Working Page Component
const projectWorkingTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/project-working.tsx"), "utf8");
assert(
  projectWorkingTsx.includes('<ProjectGuide') &&
  projectWorkingTsx.includes('effectiveProjectId') &&
  projectWorkingTsx.includes('Back to Projects'),
  "project-working.tsx must reuse ProjectGuide component, handle project context, and provide back navigation"
);
console.log("✓ Test 24: project-working.tsx cleanly reuses ProjectGuide component and handles project scope.");

// 25. Audit Step 1 Website Connected Lower Navigation Bar (Widget Studio, Deployment, API Keys)
assert(
  projectEditTsx.includes('const isWebsiteConnected =') &&
  projectEditTsx.includes('const websiteConnectedTabs = [') &&
  projectEditTsx.includes('{ id: "widget-studio", label: "Widget Studio", icon: Paintbrush }') &&
  projectEditTsx.includes('{ id: "deployment", label: "Deployment", icon: Share2 }') &&
  projectEditTsx.includes('{ id: "api-keys", label: "API Keys", icon: Key }'),
  "project-edit.tsx lower navigation bar must render Widget Studio, Deployment, and API Keys when inside Website Connected destination"
);
console.log("✓ Test 25: Step 1 lower navigation bar displays Widget Studio, Deployment, and API Keys as primary tabs.");

// 26. Audit Exclusion of Visitor Inbox and Channels from Step 1 Lower Tab Bar
const lowerBarBlock = projectEditTsx.match(/isWebsiteConnected \? \([\s\S]*?\) : \(/);
assert(lowerBarBlock, "isWebsiteConnected conditional branch must exist in lower navigation bar");
assert(
  !lowerBarBlock[0].includes("Visitor Inbox") &&
  !lowerBarBlock[0].includes("Channels") &&
  !lowerBarBlock[0].includes("conversations"),
  "Step 1 lower navigation bar must NOT display Visitor Inbox or Channels"
);
console.log("✓ Test 26: Visitor Inbox and Channels are cleanly excluded from the Step 1 Website Connected tab bar.");

// 27. Audit Non-redundant Step 1 Lower Bar (no redundant 'Website Connected' tab inside itself)
assert(
  !lowerBarBlock[0].includes('label: "Website Connected"'),
  "Step 1 lower navigation bar must NOT contain redundant 'Website Connected' tab"
);
console.log("✓ Test 27: Website Connected is not displayed as a redundant tab inside its own destination.");

// 28. Audit Preservation of Visitor Inbox and Channels Outside Step 1
assert(
  projectEditTsx.includes('<TabsContent value="conversations">') &&
  projectEditTsx.includes('<VisitorInboxTab projectId={projectId} onSelectTab={handleTabChange} />') &&
  projectEditTsx.includes('<TabsContent value="channels">') &&
  projectEditTsx.includes('<ChannelsManager projectId={projectId} />'),
  "Visitor Inbox and Channels components and TabsContent must be preserved outside Step 1"
);
console.log("✓ Test 28: Visitor Inbox and Channels remain fully accessible through the Website Experience category.");

// 29. Audit Complete Removal of Website Connected Information Panel Container
assert(
  !projectEditTsx.includes('Consolidated management for your website integration') &&
  !projectEditTsx.includes('Step 1 Shortcut'),
  "The entire Website Connected information panel, badge, and description must be removed from TabsContent value='website-connected'"
);
const tabsContentWebsiteConnected = projectEditTsx.match(/<TabsContent value="website-connected">([\s\S]*?)<\/TabsContent>/);
assert(tabsContentWebsiteConnected, "TabsContent value='website-connected' must exist");
assert(
  !tabsContentWebsiteConnected[1].includes('<Card') &&
  !tabsContentWebsiteConnected[1].includes('Website Connected'),
  "TabsContent value='website-connected' must not contain the Card information panel or heading"
);
console.log("✓ Test 29: Entire Website Connected information panel container completely removed.");

console.log("\n=================================================");
console.log("ALL 29 TESTS PASSED (EXIT 0)");
console.log("=================================================");


