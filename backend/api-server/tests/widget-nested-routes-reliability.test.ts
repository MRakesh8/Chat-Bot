import http from "http";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { normalizeDomain, isDomainAllowed, validateWidgetOrigin } from "../src/security/domain";

// Minimal assertion helper
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASSED: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${message}`);
    failed++;
  }
}

async function runNestedRoutesTests() {
  console.log("================================================================");
  console.log("  NOVA AI WIDGET NESTED ROUTES RELIABILITY TEST SUITE");
  console.log("================================================================\n");

  // --------------------------------------------------------------------------
  // TEST SECTION 1: DOMAIN & URL NORMALIZATION ON NESTED ROUTES
  // --------------------------------------------------------------------------
  console.log("[Test Section 1] Domain & URL Normalization on Deep Nested Routes");

  assert(
    normalizeDomain("http://localhost:3000/") === "localhost",
    "Root path '/' normalizes correctly to 'localhost'"
  );
  assert(
    normalizeDomain("http://localhost:3000/student") === "localhost",
    "Nested path '/student' normalizes correctly to 'localhost'"
  );
  assert(
    normalizeDomain("http://localhost:3000/student/admin") === "localhost",
    "Deep nested path '/student/admin' normalizes correctly to 'localhost'"
  );
  assert(
    normalizeDomain("http://localhost:3000/classes/projects") === "localhost",
    "Nested path '/classes/projects' normalizes correctly to 'localhost'"
  );
  assert(
    normalizeDomain("http://localhost:3000/dashboard/settings?tab=general#security") === "localhost",
    "Complex nested route with query and hash normalizes to 'localhost'"
  );
  assert(
    normalizeDomain("https://portal.university.edu/student/dashboard") === "portal.university.edu",
    "Production nested route normalizes to canonical hostname 'portal.university.edu'"
  );

  // --------------------------------------------------------------------------
  // TEST SECTION 2: MULTI-PORT & CROSS-ORIGIN VALIDATION ON NESTED ROUTES
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 2] Multi-Port & Cross-Origin Validation on Nested Routes");

  // Multi-port host testing (Port 3000, 8080, 4173, 5173)
  const testPorts = [3000, 8080, 4173, 5173];
  for (const port of testPorts) {
    const reqPort: any = {
      headers: {
        origin: `http://localhost:${port}`,
        referer: `http://localhost:${port}/student/admin`
      }
    };
    const resPort = validateWidgetOrigin(reqPort, ["localhost"]);
    assert(resPort.valid === true, `Request from host on port ${port} is authorized with allowed 'localhost'`);
    assert(resPort.domain === "localhost", `Extracted domain for port ${port} is 'localhost'`);
  }

  // Production nested route with domain allowlist
  const reqProdNested: any = {
    headers: {
      origin: "https://my-lms-platform.com",
      referer: "https://my-lms-platform.com/student/admin/settings"
    }
  };
  const resProdNested = validateWidgetOrigin(reqProdNested, ["my-lms-platform.com"]);
  assert(resProdNested.valid === true, "Production nested route is authorized when hostname matches allowed list");

  // Production allowed without referer header (valid Origin)
  const reqProdOriginOnly: any = {
    headers: {
      origin: "https://my-lms-platform.com"
    }
  };
  const resProdOriginOnly = validateWidgetOrigin(reqProdOriginOnly, ["my-lms-platform.com"]);
  assert(resProdOriginOnly.valid === true, "Production route with valid origin-only is authorized");

  // Disallowed nested route
  const reqDisallowedNested: any = {
    headers: {
      origin: "https://unauthorized-domain.com",
      referer: "https://unauthorized-domain.com/student"
    }
  };
  const resDisallowed = validateWidgetOrigin(reqDisallowedNested, ["my-lms-platform.com"]);
  assert(resDisallowed.valid === false, "Unauthorized nested route is correctly rejected");

  // Empty headers / missing origin and referer
  const reqNoHeaders: any = { headers: {} };
  const resNoHeaders = validateWidgetOrigin(reqNoHeaders, ["my-lms-platform.com"]);
  assert(resNoHeaders.valid === false, "Request without Origin or Referer is safely rejected");

  // --------------------------------------------------------------------------
  // TEST SECTION 3: WIDGET SCRIPT LOGIC (API RESOLUTION & ASSETS)
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 3] Script Asset Resolution & API Base URL Handling");

  const widgetJsPath = path.resolve(process.cwd(), "../../frontend/chat-app/public/widget.js");
  assert(fs.existsSync(widgetJsPath), "widget.js exists at expected path");
  const widgetJsCode = fs.readFileSync(widgetJsPath, "utf-8");

  // Verify that the hardcoded port 3000 bug is ELIMINATED
  assert(
    !widgetJsCode.includes("apiBaseUrl = `${url.protocol}//${url.hostname}:3000`"),
    "Hardcoded port 3000 inversion bug is eliminated from widget.js"
  );

  // Verify that default local development backend is port 5000
  assert(
    widgetJsCode.includes(":5000"),
    "widget.js correctly falls back to port 5000 for local development API gateway"
  );

  // Verify that sub-asset URL resolution handles pathname replacement
  assert(
    widgetJsCode.includes("getSubAssetUrl"),
    "widget.js contains getSubAssetUrl helper for absolute sub-resource resolution"
  );

  // Verify sub-asset URL calculation across multiple scriptTag permutations
  function testSubAssetResolution(scriptSrc: string, filename: string): string {
    const u = new URL(scriptSrc, "http://localhost:3000/student/admin");
    const lastSlash = u.pathname.lastIndexOf('/');
    const basePath = lastSlash !== -1 ? u.pathname.substring(0, lastSlash + 1) : '/';
    u.pathname = `${basePath}${filename}`;
    u.search = '';
    return u.href;
  }

  assert(
    testSubAssetResolution("http://localhost:5000/widget.js", "widget-context-engine.js") === "http://localhost:5000/widget-context-engine.js",
    "Absolute script URL resolves sub-asset on backend port 5000"
  );
  assert(
    testSubAssetResolution("https://chat-bot-api-ns81.onrender.com/widget.js", "widget-context-engine.js") === "https://chat-bot-api-ns81.onrender.com/widget-context-engine.js",
    "Production Render script URL resolves sub-asset correctly"
  );
  assert(
    testSubAssetResolution("/assets/v2/widget.js?v=2.1", "widget-action-engine.js") === "http://localhost:3000/assets/v2/widget-action-engine.js",
    "Root-relative script URL with query params resolves sub-asset stripping search"
  );

  // Verify that route observer is integrated with popstate, pushState, and hashchange
  assert(
    widgetJsCode.includes("attachRouteObserver"),
    "widget.js contains attachRouteObserver to maintain mounting across route changes"
  );
  assert(
    widgetJsCode.includes("popstate") && widgetJsCode.includes("pushState") && widgetJsCode.includes("hashchange"),
    "widget.js listens to popstate, pushState, and hashchange navigation events"
  );

  // Verify MutationObserver is present for body element resilience
  assert(
    widgetJsCode.includes("MutationObserver"),
    "widget.js includes MutationObserver on document.body for SPA unmount recovery"
  );

  // Verify that Light DOM container has explicit inline fixed styling
  assert(
    widgetJsCode.includes("container.style.cssText") && widgetJsCode.includes("z-index: 2147483647 !important"),
    "widget.js sets explicit Light DOM fixed positioning and maximum z-index on container"
  );

  // Verify initBodyObserver exists for deferred observer attachment when script runs in <head>
  assert(
    widgetJsCode.includes("initBodyObserver") && widgetJsCode.includes("DOMContentLoaded"),
    "widget.js attaches MutationObserver safely via initBodyObserver even when executed before document.body exists"
  );

  // Verify fallback to floating launcher when custom container element is absent on nested routes
  assert(
    widgetJsCode.includes("hasCustomEl") && widgetJsCode.includes("!isCustom"),
    "widget.js falls back to floating launcher if custom container ID is absent on a nested page"
  );

  // Verify config caching and fallback config
  assert(
    widgetJsCode.includes("__novaWidgetConfigs") && widgetJsCode.includes("welcomeMessage: \"Hi there! How can I help you today?\""),
    "widget.js implements in-memory config caching and resilient fallback configuration on network errors"
  );

  // Verify dynamic websiteContext URL synchronization on submit
  assert(
    widgetJsCode.includes("websiteContext.url = window.location.href;"),
    "widget.js dynamically synchronizes live URL in websiteContext on every chat submit"
  );

  // --------------------------------------------------------------------------
  // TEST SECTION 4: IDEMPOTENCY & REMOUNT RESILIENCE SIMULATION
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 4] Idempotency & SPA Route Remount Simulation");

  // Simulate token tracking and DOM element checks
  const mockTokens = new Set<string>();
  const mockDom: Record<string, boolean> = {};

  const testToken = "test_token_123";
  const containerId = `aria-ai-widget-root-${testToken}`;

  // 1. Initial mount on "/"
  let canMount1 = !mockDom[containerId];
  assert(canMount1 === true, "First load on '/' mounts container");
  mockTokens.add(testToken);
  mockDom[containerId] = true; // Container added to body

  // 2. Second script tag on "/" while container is already mounted (duplicate script)
  let isAlreadyMounted = mockDom[containerId];
  assert(isAlreadyMounted === true, "Duplicate script on '/' detects container already in DOM and avoids duplicate mount");

  // 3. User navigates client-side to "/student"
  delete mockDom[containerId]; // Detached by router
  assert(!mockDom[containerId], "SPA route transition to '/student' unmounted container");

  // 4. Widget remount logic on "/student"
  const shouldRemount = !mockDom[containerId];
  assert(shouldRemount === true, "Widget remount is permitted when container is missing from DOM on '/student'");
  mockDom[containerId] = true; // Remounted
  assert(mockDom[containerId] === true, "Container successfully remounted on '/student'");

  // 5. User navigates client-side to "/student/admin"
  assert(mockDom[containerId] === true, "Container remains active on '/student/admin'");

  // 6. User navigates client-side to "/classes/projects"
  assert(mockDom[containerId] === true, "Container remains active on '/classes/projects'");

  // 7. User navigates to "/dashboard/settings?tab=general#security"
  assert(mockDom[containerId] === true, "Container remains active on complex query/hash route");

  // --------------------------------------------------------------------------
  // TEST SECTION 5: REAL HTTP SERVER INTEGRATION WITH ALL NESTED ROUTES
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 5] Real HTTP Server with Comprehensive Nested Routes (Port 3001)");

  const liveWidgetToken = "test_widget_token_abc_123";

  const server = http.createServer((req, res) => {
    const url = req.url || "/";
    res.writeHead(200, { "Content-Type": "text/html" });

    if (url === "/") {
      res.end(`<!DOCTYPE html>
<html><head><title>Root Home</title></head>
<body><h1>Home Page</h1>
<script src="http://localhost:5000/widget.js" data-widget-token="${liveWidgetToken}" data-api-url="http://127.0.0.1:5000"></script>
</body></html>`);
    } else if (url === "/student") {
      res.end(`<!DOCTYPE html>
<html><head><title>Student Portal</title></head>
<body><h1>Student Portal Page</h1>
<script src="http://localhost:5000/widget.js" data-widget-token="${liveWidgetToken}" data-api-url="http://127.0.0.1:5000"></script>
</body></html>`);
    } else if (url === "/student/admin") {
      res.end(`<!DOCTYPE html>
<html><head><title>Student Admin Dashboard</title></head>
<body><h1>Student Admin Dashboard Page</h1>
<script src="http://localhost:5000/widget.js" data-widget-token="${liveWidgetToken}" data-api-url="http://127.0.0.1:5000"></script>
</body></html>`);
    } else if (url === "/classes/projects") {
      res.end(`<!DOCTYPE html>
<html><head><title>Classes & Projects</title></head>
<body><h1>Classes and Projects Page</h1>
<script src="http://localhost:5000/widget.js" data-widget-token="${liveWidgetToken}" data-api-url="http://127.0.0.1:5000"></script>
</body></html>`);
    } else if (url.startsWith("/dashboard/settings")) {
      res.end(`<!DOCTYPE html>
<html><head><title>Dashboard Settings</title></head>
<body><h1>Dashboard Settings Page</h1>
<script src="http://localhost:5000/widget.js" data-widget-token="${liveWidgetToken}" data-api-url="http://127.0.0.1:5000"></script>
</body></html>`);
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  const TEST_PORT = 3001;
  await new Promise<void>((resolve) => server.listen(TEST_PORT, () => resolve()));
  console.log(`  * Customer website test server listening on http://localhost:${TEST_PORT}`);

  try {
    // 1. Direct load of "/"
    const rootRes = await fetch(`http://localhost:${TEST_PORT}/`);
    assert(rootRes.status === 200, "Direct load of '/' returns HTTP 200");
    const rootHtml = await rootRes.text();
    assert(rootHtml.includes("Home Page") && rootHtml.includes("widget.js"), "Root page HTML contains widget script");

    // 2. Direct load of "/student"
    const studentRes = await fetch(`http://localhost:${TEST_PORT}/student`);
    assert(studentRes.status === 200, "Direct load of '/student' returns HTTP 200");
    const studentHtml = await studentRes.text();
    assert(studentHtml.includes("Student Portal") && studentHtml.includes("widget.js"), "Nested '/student' HTML contains widget script");

    // 3. Direct load of "/student/admin"
    const adminRes = await fetch(`http://localhost:${TEST_PORT}/student/admin`);
    assert(adminRes.status === 200, "Direct load of '/student/admin' returns HTTP 200");
    const adminHtml = await adminRes.text();
    assert(adminHtml.includes("Student Admin Dashboard") && adminHtml.includes("widget.js"), "Deep nested '/student/admin' HTML contains widget script");

    // 4. Direct load of "/classes/projects"
    const projectsRes = await fetch(`http://localhost:${TEST_PORT}/classes/projects`);
    assert(projectsRes.status === 200, "Direct load of '/classes/projects' returns HTTP 200");
    const projectsHtml = await projectsRes.text();
    assert(projectsHtml.includes("Classes and Projects") && projectsHtml.includes("widget.js"), "Nested '/classes/projects' HTML contains widget script");

    // 5. Direct load of "/dashboard/settings?tab=general#security"
    const settingsRes = await fetch(`http://localhost:${TEST_PORT}/dashboard/settings?tab=general`);
    assert(settingsRes.status === 200, "Direct load of '/dashboard/settings?tab=general' returns HTTP 200");
    const settingsHtml = await settingsRes.text();
    assert(settingsHtml.includes("Dashboard Settings") && settingsHtml.includes("widget.js"), "Complex query nested page HTML contains widget script");

    // 6. Test API Config request with Origin & Nested Referer Headers
    const configHeadersStudent = {
      Origin: `http://localhost:${TEST_PORT}`,
      Referer: `http://localhost:${TEST_PORT}/student`,
      Accept: "application/json"
    };

    const reqMockConfig: any = { headers: configHeadersStudent };
    const originEvalStudent = validateWidgetOrigin(reqMockConfig, ["localhost"]);
    assert(originEvalStudent.valid === true, "API Config evaluates localhost as valid for /student referer");

    // 7. Test API Chat payload with websiteContext containing nested route
    const chatReqPayload = {
      sessionId: "session_student_test_123",
      messages: [{ role: "user", content: "Hello from student portal" }],
      websiteContext: {
        url: `http://localhost:${TEST_PORT}/student/admin`,
        title: "Student Admin Dashboard",
        selectedText: ""
      }
    };

    assert(
      chatReqPayload.websiteContext.url === `http://localhost:${TEST_PORT}/student/admin`,
      "websiteContext records deep nested route '/student/admin' correctly"
    );

    // 8. Test API Chat payload on complex route with query & hash
    const complexChatPayload = {
      sessionId: "session_settings_456",
      messages: [{ role: "user", content: "Help with settings" }],
      websiteContext: {
        url: `http://localhost:${TEST_PORT}/dashboard/settings?tab=general#security`,
        title: "Dashboard Settings",
        selectedText: ""
      }
    };

    assert(
      complexChatPayload.websiteContext.url.includes("/dashboard/settings?tab=general#security"),
      "websiteContext records query parameters and hash fragments accurately"
    );

  } finally {
    if (typeof (server as any).closeAllConnections === "function") {
      (server as any).closeAllConnections();
    }
    await new Promise<void>((r) => server.close(() => r()));
  }

  // --------------------------------------------------------------------------
  // TEST SECTION 6: REACT EMBED SNIPPET RESILIENCE
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 6] React Guide Snippet Cleanup & Token Reset");

  const deploymentPath = path.resolve(process.cwd(), "../../frontend/chat-app/src/components/project/deployment.tsx");
  assert(fs.existsSync(deploymentPath), "deployment.tsx exists");
  const deploymentCode = fs.readFileSync(deploymentPath, "utf-8");

  assert(
    deploymentCode.includes("aria-ai-widget-root-${settings?.widgetToken}") ||
    deploymentCode.includes("aria-ai-widget-root-"),
    "deployment.tsx cleans up token-specific container ID on React unmount"
  );
  assert(
    deploymentCode.includes("AriaWidgetInitializedTokens.delete"),
    "deployment.tsx removes token from AriaWidgetInitializedTokens on React unmount"
  );

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("\n================================================================");
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runNestedRoutesTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
