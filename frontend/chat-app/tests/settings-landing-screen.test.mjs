import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatAppDir = path.resolve(__dirname, "..");
const repoRootDir = path.resolve(chatAppDir, "../..");

console.log("=================================================================");
console.log("RUNNING SETTINGS LANDING SCREEN CONSOLIDATION REGRESSION SUITE");
console.log("=================================================================\n");

const settingsTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/settings.tsx"), "utf8");
const landingScreenTsx = fs.readFileSync(path.resolve(chatAppDir, "src/components/settings/default-landing-screen.tsx"), "utf8");
const authContextTsx = fs.readFileSync(path.resolve(chatAppDir, "src/contexts/AuthContext.tsx"), "utf8");
const homeTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/home.tsx"), "utf8");
const authTsx = fs.readFileSync(path.resolve(chatAppDir, "src/pages/auth.tsx"), "utf8");
const systemRoutesTs = fs.readFileSync(path.resolve(repoRootDir, "backend/api-server/src/routes/system/index.ts"), "utf8");

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

// --------------------------------------------------------------------------
// TEST 1: General tab no longer renders the Default Landing Screen selector
// --------------------------------------------------------------------------
runCheck(1, "General tab does NOT render DefaultLandingScreenSection", () => {
  // Extract TabsContent for general
  const generalContentMatch = settingsTsx.match(/<TabsContent value="general"[\s\S]*?<\/TabsContent>/);
  assert(generalContentMatch, "TabsContent value='general' must exist in settings.tsx");
  const generalContent = generalContentMatch[0];

  assert(
    !generalContent.includes("<DefaultLandingScreenSection"),
    "General tab must NOT contain DefaultLandingScreenSection"
  );
  assert(
    !generalContent.includes("Default Landing Screen"),
    "General tab must NOT contain Default Landing Screen heading or text"
  );
  assert(
    !generalContent.includes("landing-screen-heading"),
    "General tab must NOT reference landing-screen-heading"
  );
});

// --------------------------------------------------------------------------
// TEST 2: Landing Screen tab renders the selector exactly once
// --------------------------------------------------------------------------
runCheck(2, "Landing Screen tab renders DefaultLandingScreenSection exactly once", () => {
  const landingContentMatch = settingsTsx.match(/<TabsContent value="landing"[\s\S]*?<\/TabsContent>/);
  assert(landingContentMatch, "TabsContent value='landing' must exist in settings.tsx");
  const landingContent = landingContentMatch[0];

  assert(
    landingContent.includes("<DefaultLandingScreenSection />"),
    "Landing Screen tab must contain DefaultLandingScreenSection"
  );

  // Count total occurrences in settings.tsx
  const totalMatches = (settingsTsx.match(/<DefaultLandingScreenSection/g) || []).length;
  assert.strictEqual(
    totalMatches,
    1,
    `DefaultLandingScreenSection must be rendered exactly 1 time across the entire Settings page, found: ${totalMatches}`
  );
});

// --------------------------------------------------------------------------
// TEST 3: All existing General settings, appearance, and voice options preserved
// --------------------------------------------------------------------------
runCheck(3, "Existing General tab settings (Appearance, Palettes, Mode, Language) remain fully intact", () => {
  const generalContentMatch = settingsTsx.match(/<TabsContent value="general"[\s\S]*?<\/TabsContent>/);
  assert(generalContentMatch, "General tab content must exist");
  const generalContent = generalContentMatch[0];

  assert(generalContent.includes("Appearance & Theme Palettes"), "Must retain Appearance & Theme Palettes section");
  assert(generalContent.includes("warm-paper"), "Must retain warm-paper palette option");
  assert(generalContent.includes("nova-natural"), "Must retain nova-natural palette option");
  assert(generalContent.includes("Appearance Mode"), "Must retain Appearance Mode controls");
  assert(generalContent.includes('setMode("light")'), "Must retain light mode button");
  assert(generalContent.includes('setMode("dark")'), "Must retain dark mode button");
  assert(generalContent.includes('setMode("system")'), "Must retain system mode button");
  assert(generalContent.includes("Language & Voice"), "Must retain Language & Voice section");
  assert(generalContent.includes("Default Language"), "Must retain Default Language dropdown");
  assert(generalContent.includes("Voice Mode"), "Must retain Voice Mode coming soon indicator");
});

// --------------------------------------------------------------------------
// TEST 4: Settings tabs list and navigation triggers remain functional
// --------------------------------------------------------------------------
runCheck(4, "Settings tabs triggers (General, Landing Screen, Billing, API Keys) are correctly configured", () => {
  assert(settingsTsx.includes('<TabsTrigger value="general"'), "Must have General tab trigger");
  assert(settingsTsx.includes('<TabsTrigger value="landing"'), "Must have Landing Screen tab trigger");
  assert(settingsTsx.includes('<TabsTrigger value="billing"'), "Must have Billing tab trigger");
  assert(settingsTsx.includes('<TabsTrigger value="api-keys"'), "Must have API Keys tab trigger");
  assert(settingsTsx.includes('handleTabChange = (tab: string) =>'), "Tab change handler must update active tab and URL search params");
});

// --------------------------------------------------------------------------
// TEST 5: Available screens list covers all core destinations with descriptions and icons
// --------------------------------------------------------------------------
runCheck(5, "Available screens list includes all supported startup destinations with icons and badges", () => {
  const expectedScreens = [
    { id: "projects", path: "/projects" },
    { id: "chat", path: "/chat" },
    { id: "services", path: "/services" },
    { id: "agent-control", path: "/agent-control" },
    { id: "api-center", path: "/api-center" },
    { id: "notifications", path: "/notifications" },
    { id: "billing", path: "/billing" },
    { id: "settings", path: "/settings" },
    { id: "profile", path: "/profile" },
    { id: "admin", path: "/admin/clarity" },
  ];

  for (const s of expectedScreens) {
    assert(
      landingScreenTsx.includes(`id: "${s.id}"`) && landingScreenTsx.includes(`path: "${s.path}"`),
      `Screen ${s.id} (${s.path}) must be present in AVAILABLE_SCREENS`
    );
  }
});

// --------------------------------------------------------------------------
// TEST 6: Active default screen indicator & hero card display
// --------------------------------------------------------------------------
runCheck(6, "Active screen hero card and reset button are rendered with proper indicators", () => {
  assert(landingScreenTsx.includes('data-testid="active-landing-screen-hero"'), "Must render active landing screen hero card");
  assert(landingScreenTsx.includes("Active Default Screen"), "Must display Active Default Screen label");
  assert(landingScreenTsx.includes("Auto-opens on login"), "Must display auto-open indicator badge");
  assert(landingScreenTsx.includes('data-testid="reset-default-screen-btn"'), "Must render reset to projects button when not default");
  assert(landingScreenTsx.includes('data-testid="open-screen-now-btn"'), "Must render open screen now shortcut button");
});

// --------------------------------------------------------------------------
// TEST 7: Fallback behavior for unsupported or stale screen identifiers
// --------------------------------------------------------------------------
runCheck(7, "Unsupported or stale screen identifiers safely fallback to /projects", () => {
  assert(
    landingScreenTsx.includes("screens.some((s) => s.path === defaultLandingScreen)"),
    "Must validate if defaultLandingScreen matches a supported screen"
  );
  assert(
    landingScreenTsx.includes('const currentPath = isKnown ? defaultLandingScreen : "/projects"'),
    "Must fallback to /projects if current setting is unknown or stale"
  );
  assert(
    authContextTsx.includes('localStorage.getItem("nova_default_landing_screen") || "/projects"'),
    "AuthContext initialization must fallback to /projects"
  );
});

// --------------------------------------------------------------------------
// TEST 8: Persistence mechanism (localStorage and backend PATCH)
// --------------------------------------------------------------------------
runCheck(8, "Selecting a default screen persists to localStorage and backend /api/system/default-screen", () => {
  assert(
    authContextTsx.includes('localStorage.setItem("nova_default_landing_screen", validScreen)'),
    "Must persist preference to localStorage"
  );
  assert(
    authContextTsx.includes('fetch(`${apiBaseUrl}/api/system/default-screen`'),
    "Must synchronize preference to backend PATCH /api/system/default-screen"
  );
  assert(
    systemRoutesTs.includes('router.patch("/default-screen"'),
    "Backend router must have PATCH /default-screen endpoint"
  );
  assert(
    systemRoutesTs.includes("ALLOWED_DEFAULT_SCREENS"),
    "Backend must validate defaultScreen against allowed screen list"
  );
});

// --------------------------------------------------------------------------
// TEST 9: Startup routing and login redirection honor saved preference
// --------------------------------------------------------------------------
runCheck(9, "Startup redirection and login honor configured defaultLandingScreen", () => {
  // home.tsx
  assert(
    homeTsx.includes("const { user, defaultLandingScreen } = useAuth();") &&
    homeTsx.includes("const targetScreen = defaultLandingScreen || \"/projects\";") &&
    homeTsx.includes("setLocation(targetScreen);"),
    "Home page must redirect authenticated visitors to targetScreen"
  );

  // auth.tsx
  assert(
    authTsx.includes("const { user, loginAsDemo, defaultLandingScreen } = useAuth();") &&
    authTsx.includes("setLocation(defaultLandingScreen || \"/projects\");"),
    "Auth page must redirect newly signed-in users to defaultLandingScreen"
  );
});

// --------------------------------------------------------------------------
// TEST 10: Direct navigation to specific URLs continues to work without redirection
// --------------------------------------------------------------------------
runCheck(10, "Direct navigation to sub-routes is preserved and not intercepted", () => {
  // Verify home.tsx only redirects on the home path "/"
  assert(
    homeTsx.includes('canonicalPath: "/"'),
    "Home component only handles the root path"
  );
  // In settings.tsx, tab URL query parameter ?tab=... updates active tab
  assert(
    settingsTsx.includes('searchParams.get("tab")'),
    "Settings respects direct URL tab parameters"
  );
});

console.log("\n=================================================================");
console.log(`TOTAL AUDIT CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("=================================================================\n");

if (failed > 0) {
  process.exit(1);
}
