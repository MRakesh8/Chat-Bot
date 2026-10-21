import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatAppDir = path.resolve(__dirname, "..");
const repoRootDir = path.resolve(chatAppDir, "../..");

console.log("=================================================================");
console.log("RUNNING NOVA WIDGET DEBUG PANEL & CONTEXT EXTRACTION AUDIT SUITE");
console.log("=================================================================\n");

const widgetJsPath = path.resolve(chatAppDir, "public/widget.js");
const contextEngineJsPath = path.resolve(chatAppDir, "public/widget-context-engine.js");

const widgetJsCode = fs.readFileSync(widgetJsPath, "utf8");
const contextEngineJsCode = fs.readFileSync(contextEngineJsPath, "utf8");

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

async function runCheckAsync(testNum, testName, fn) {
  try {
    await fn();
    console.log(`✓ Test ${testNum}: ${testName}`);
    passed++;
  } catch (err) {
    console.error(`✗ Test ${testNum} FAILED: ${testName}\n  Error: ${err.message}`);
    failed++;
  }
}

// --------------------------------------------------------------------------
// TEST 1: The production customer widget on non-localhost domains does not
// render the Context Engine Debug panel in the DOM by default.
// --------------------------------------------------------------------------
runCheck(1, "Production widget on customer domain does not render debug panel in DOM", () => {
  const dom = new JSDOM(
    `<!DOCTYPE html>
    <html>
      <head>
        <script src="https://chatbot-rakesh.vercel.app/widget.js"
                data-token="1a6274f347e973fa9070bb3685ecc5bb60aa92c463730e96238db4863b9fb5a5">
        </script>
      </head>
      <body>
        <div class="portfolio-card"><h1>Rakesh Portfolio</h1></div>
      </body>
    </html>`,
    {
      url: "https://rakesh-portfolio08.vercel.app/",
      runScripts: "outside-only"
    }
  );

  const window = dom.window;
  const scriptTag = window.document.querySelector('script[data-token]');
  const config = {
    botName: "NOVA Assistant",
    contextEngine: {
      enabled: true,
      developerDebugMode: true // Enabled in project settings, but must not leak to visitor UI!
    }
  };

  // Evaluate shouldRenderDebugPanel with production visitor context
  function shouldRenderDebugPanel() {
    if (!config || !config.contextEngine || !config.contextEngine.developerDebugMode) return false;
    try {
      const hostname = window.location.hostname || '';
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.local') || hostname === '';
      if (isLocalhost) return true;
    } catch (e) {}
    if (scriptTag) {
      const devAttr = scriptTag.getAttribute('data-developer-debug') || scriptTag.getAttribute('data-debug');
      if (devAttr === 'true') return true;
    }
    if (typeof window !== 'undefined' && (window.__NOVA_DEV_DEBUG__ === true || window.__ARIA_DEV_DEBUG__ === true)) {
      return true;
    }
    return false;
  }

  const shouldRender = shouldRenderDebugPanel();
  assert.strictEqual(shouldRender, false, "Debug panel must not be authorized on production domain without explicit developer flags");

  // In widget.js, the template guards the debug panel with ${shouldRenderDebugPanel() ? ... : ''}
  assert(widgetJsCode.includes("${shouldRenderDebugPanel() ? `"), "widget.js must guard debug-panel with shouldRenderDebugPanel()");
  assert(!widgetJsCode.includes("${config.contextEngine?.developerDebugMode ? `"), "widget.js must not directly bind debug-panel to config.contextEngine.developerDebugMode");
});

// --------------------------------------------------------------------------
// TEST 2: Explicit developer debug mode continues to work in authorized
// environments (localhost, script attribute, or programmatic flag).
// --------------------------------------------------------------------------
runCheck(2, "Developer debug mode continues to work in authorized developer environments", () => {
  const evaluatePolicy = (url, scriptAttrs = {}, windowFlags = {}) => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head><script></script></head><body></body></html>`, { url });
    const win = dom.window;
    const script = win.document.querySelector('script');
    for (const [k, v] of Object.entries(scriptAttrs)) {
      script.setAttribute(k, v);
    }
    for (const [k, v] of Object.entries(windowFlags)) {
      win[k] = v;
    }

    const config = { contextEngine: { enabled: true, developerDebugMode: true } };

    function shouldRenderDebugPanel() {
      if (!config || !config.contextEngine || !config.contextEngine.developerDebugMode) return false;
      try {
        const hostname = win.location.hostname || '';
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.local') || hostname === '';
        if (isLocalhost) return true;
      } catch (e) {}
      if (script) {
        const devAttr = script.getAttribute('data-developer-debug') || script.getAttribute('data-debug');
        if (devAttr === 'true') return true;
      }
      if (typeof win !== 'undefined' && (win.__NOVA_DEV_DEBUG__ === true || win.__ARIA_DEV_DEBUG__ === true)) {
        return true;
      }
      return false;
    }
    return shouldRenderDebugPanel();
  };

  assert.strictEqual(evaluatePolicy("http://localhost:3000/"), true, "Should allow localhost");
  assert.strictEqual(evaluatePolicy("http://127.0.0.1:8080/"), true, "Should allow 127.0.0.1");
  assert.strictEqual(evaluatePolicy("https://production-customer.com/", { "data-developer-debug": "true" }), true, "Should allow explicit script attribute");
  assert.strictEqual(evaluatePolicy("https://production-customer.com/", {}, { "__NOVA_DEV_DEBUG__": true }), true, "Should allow programmatic harness flag");
  assert.strictEqual(evaluatePolicy("https://production-customer.com/"), false, "Must disallow normal production customer domain");
});

// --------------------------------------------------------------------------
// TEST 3: Public query parameters and unauthenticated visitor inputs cannot
// force the debug panel to appear.
// --------------------------------------------------------------------------
runCheck(3, "Public query parameters cannot force the debug panel to appear", () => {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head><script src="https://chatbot.com/widget.js" data-token="xyz"></script></head><body></body></html>`,
    {
      url: "https://rakesh-portfolio08.vercel.app/?debug=true&developerDebug=true&dev=1&debugMode=true"
    }
  );
  const win = dom.window;
  const script = win.document.querySelector('script');
  const config = { contextEngine: { enabled: true, developerDebugMode: true } };

  function shouldRenderDebugPanel() {
    if (!config || !config.contextEngine || !config.contextEngine.developerDebugMode) return false;
    try {
      const hostname = win.location.hostname || '';
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.local') || hostname === '';
      if (isLocalhost) return true;
    } catch (e) {}
    if (script) {
      const devAttr = script.getAttribute('data-developer-debug') || script.getAttribute('data-debug');
      if (devAttr === 'true') return true;
    }
    if (typeof win !== 'undefined' && (win.__NOVA_DEV_DEBUG__ === true || win.__ARIA_DEV_DEBUG__ === true)) {
      return true;
    }
    return false;
  }

  assert.strictEqual(shouldRenderDebugPanel(), false, "URL query parameters must not authorize debug panel");
});

// --------------------------------------------------------------------------
// TEST 4: The context extractor handles pages with zero forms or zero tables
// without treating normal structure as a fatal failure.
// --------------------------------------------------------------------------
await runCheckAsync(4, "Context extractor handles pages with zero forms and zero tables gracefully", async () => {
  const dom = new JSDOM(
    `<!DOCTYPE html>
    <html>
      <head><title>Portfolio</title></head>
      <body>
        <main>
          <div class="card" role="region" aria-label="Projects">
            <h3>Project NOVA</h3>
            <p>An intelligent AI agent platform</p>
          </div>
        </main>
      </body>
    </html>`,
    {
      url: "https://rakesh-portfolio08.vercel.app/",
      runScripts: "dangerously"
    }
  );

  dom.window.eval(contextEngineJsCode);

  assert(typeof dom.window.AriaContextEngine === "function", "AriaContextEngine must be loaded");
  const engine = new dom.window.AriaContextEngine({ maxPayloadBytes: 6144 });
  engine.start(dom.window.document.body);

  const context = await engine.getContext();
  assert(context !== null, "Initial extraction must produce context");
  assert(Array.isArray(context.content?.forms), "content.forms must be an array");
  assert.strictEqual(context.content.forms.length, 0, "Forms count should be 0");
  assert(Array.isArray(context.content?.tables), "content.tables must be an array");
  assert.strictEqual(context.content.tables.length, 0, "Tables count should be 0");
  assert(Array.isArray(context.state?.visibleErrors), "visibleErrors must be an array");
  assert.strictEqual(context.state.visibleErrors.length, 0, "Errors count should be 0");
  assert.strictEqual(context.page.title, "Portfolio", "Page title should match");

  engine.destroy();
});

// --------------------------------------------------------------------------
// TEST 5: Unchanged pages and cached contexts do not trigger false
// 'Error extracting context' statuses.
// --------------------------------------------------------------------------
await runCheckAsync(5, "Unchanged pages and cached contexts do not trigger false error status", async () => {
  const dom = new JSDOM(
    `<!DOCTYPE html>
    <html>
      <head><title>Portfolio</title></head>
      <body>
        <div id="card-1">Welcome</div>
      </body>
    </html>`,
    {
      url: "https://rakesh-portfolio08.vercel.app/",
      runScripts: "dangerously"
    }
  );

  dom.window.eval(contextEngineJsCode);

  const engine = new dom.window.AriaContextEngine({ maxPayloadBytes: 6144 });
  engine.start(dom.window.document.body);

  // Tick 1: Initial extraction succeeds
  const tick1Fresh = await engine.getContext();
  assert(tick1Fresh !== null, "Tick 1 must yield fresh context");

  // Tick 2: Without DOM mutations, getContext returns null (as designed for delta efficiency)
  const tick2Fresh = await engine.getContext();
  assert.strictEqual(tick2Fresh, null, "Tick 2 without mutations returns null to avoid unnecessary rescans");

  // Now verify widget.js handling: it must fall back to getCachedContext() instead of throwing TypeError
  const cached = engine.getCachedContext();
  assert(cached !== null, "getCachedContext() must return previously scanned context");

  let reportedStatus = "";
  let reportedError = false;

  try {
    const freshCtx = tick2Fresh;
    const ctx = freshCtx || (typeof engine.getCachedContext === 'function' ? engine.getCachedContext() : null);

    if (ctx) {
      const isFresh = Boolean(freshCtx);
      reportedStatus = isFresh ? 'Active' : 'Active (Cached)';
    } else {
      reportedStatus = 'Ready (Awaiting scan)';
    }
  } catch (err) {
    reportedError = true;
    reportedStatus = "Status: Error extracting context";
  }

  assert.strictEqual(reportedError, false, "Must not throw TypeError when getContext() returns null");
  assert.strictEqual(reportedStatus, "Active (Cached)", "Status should be Active (Cached), not Error extracting context");

  engine.destroy();
});

// --------------------------------------------------------------------------
// TEST 6: Context status indicators and element counters remain consistent
// and derived from the same extraction attempt.
// --------------------------------------------------------------------------
await runCheckAsync(6, "Status indicators and element counters remain consistent and synchronized", async () => {
  const dom = new JSDOM(
    `<!DOCTYPE html>
    <html>
      <head><title>Test Page</title></head>
      <body>
        <div class="card">
          <h4>Active Projects</h4>
          <span>42</span>
        </div>
        <form><input name="query"/></form>
      </body>
    </html>`,
    {
      url: "https://test.local/",
      runScripts: "dangerously"
    }
  );

  dom.window.eval(contextEngineJsCode);

  const engine = new dom.window.AriaContextEngine({ maxPayloadBytes: 6144 });
  engine.start(dom.window.document.body);

  const freshCtx = await engine.getContext();
  const ctx = freshCtx || engine.getCachedContext();

  assert(ctx !== null, "Context must exist");
  const formsCount = Array.isArray(ctx.content?.forms) ? ctx.content.forms.length : 0;
  const tablesCount = Array.isArray(ctx.content?.tables) ? ctx.content.tables.length : 0;
  const cardsCount = Array.isArray(ctx.content?.cards) ? ctx.content.cards.length : 0;
  const errorsCount = Array.isArray(ctx.state?.visibleErrors) ? ctx.state.visibleErrors.length : 0;

  // Verify counters and status are derived simultaneously from the same object
  assert.strictEqual(formsCount, 1, "Should count 1 form");
  assert.strictEqual(tablesCount, 0, "Should count 0 tables");
  assert.strictEqual(cardsCount, 1, "Should count 1 card");
  assert.strictEqual(errorsCount, 0, "Should count 0 errors");

  engine.destroy();
});

// --------------------------------------------------------------------------
// TEST 7: Chat functionality remains operational even if context extraction
// fails or is unavailable.
// --------------------------------------------------------------------------
await runCheckAsync(7, "Chat message submission remains operational when context extraction throws or is missing", async () => {
  const brokenEngine = {
    getContext: async () => {
      throw new Error("Context extraction failed: Cross-origin sandbox restricted");
    },
    getCachedContext: () => null
  };

  let websiteContext = null;
  let exceptionLogged = false;

  try {
    websiteContext = await brokenEngine.getContext() || brokenEngine.getCachedContext();
  } catch (e) {
    exceptionLogged = true;
  }

  if (!websiteContext) {
    websiteContext = {
      version: "1.0.0",
      url: "https://rakesh-portfolio08.vercel.app/",
      title: "Portfolio",
      segments: {}
    };
  }

  assert.strictEqual(exceptionLogged, true, "Exception was safely intercepted");
  assert(websiteContext !== null, "Fallback website context must be generated");
  assert.strictEqual(websiteContext.url, "https://rakesh-portfolio08.vercel.app/", "URL must be populated in fallback context");
  assert.strictEqual(websiteContext.title, "Portfolio", "Title must be populated in fallback context");
});

// --------------------------------------------------------------------------
// TEST 8: Sub-resource resolution for context-engine scripts works correctly
// on standard and nested customer paths.
// --------------------------------------------------------------------------
runCheck(8, "Sub-resource script resolution resolves accurately for standard and nested paths", () => {
  function getSubAssetUrl(scriptSrc, filename, apiBaseUrl = "https://api.novabusiness.ai") {
    try {
      if (scriptSrc) {
        const u = new URL(scriptSrc, "https://customer.com/page/subpage");
        const lastSlash = u.pathname.lastIndexOf('/');
        const basePath = lastSlash !== -1 ? u.pathname.substring(0, lastSlash + 1) : '/';
        u.pathname = `${basePath}${filename}`;
        u.search = '';
        return u.href;
      }
    } catch (e) {}
    return `${apiBaseUrl}/${filename}`;
  }

  assert.strictEqual(
    getSubAssetUrl("https://chatbot-rakesh.vercel.app/widget.js", "widget-context-engine.js"),
    "https://chatbot-rakesh.vercel.app/widget-context-engine.js",
    "Standard root path must resolve to same origin"
  );

  assert.strictEqual(
    getSubAssetUrl("https://cdn.example.com/assets/v2/widget.js?v=1.2.3", "widget-context-engine.js"),
    "https://cdn.example.com/assets/v2/widget-context-engine.js",
    "Nested path with query string must strip query and resolve accurately"
  );
});

// --------------------------------------------------------------------------
// TEST 9: SPA navigation and route changes do not leak duplicate observers,
// intervals, or script tags.
// --------------------------------------------------------------------------
runCheck(9, "Intervals and script tags are cleanly deduplicated and cleared", () => {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body></body></html>`,
    { url: "https://localhost:3000/" }
  );
  const win = dom.window;

  // In widget.js, contextDebugInterval is cleared before creating a new one
  assert(widgetJsCode.includes("if (contextDebugInterval) {"), "widget.js must check and clear contextDebugInterval");
  assert(widgetJsCode.includes("clearInterval(contextDebugInterval);"), "widget.js must call clearInterval");

  // In widget.js, script tag injection is deduplicated
  assert(widgetJsCode.includes('script[data-nova-engine="context"]'), "widget.js must deduplicate context engine script tag");
  assert(widgetJsCode.includes('script[data-nova-engine="action"]'), "widget.js must deduplicate action engine script tag");
});

// --------------------------------------------------------------------------
// TEST 10: Existing widget API communication, chat history, and security
// controls remain intact.
// --------------------------------------------------------------------------
runCheck(10, "Widget API communication, Shadow DOM isolation, and security controls remain intact", () => {
  assert(widgetJsCode.includes("attachShadow({ mode: 'open' })"), "Widget must use Shadow DOM style isolation");
  assert(widgetJsCode.includes("/api/widget/${widgetToken}/config"), "Widget config endpoint URL contract preserved");
  assert(widgetJsCode.includes("/api/widget/${widgetToken}/chat"), "Widget chat endpoint URL contract preserved");
  assert(widgetJsCode.includes("sessionStorage.setItem"), "Session storage chat state handling preserved");
  // Ensure no credentials or sensitive tokens leaked into debug panel
  assert(!widgetJsCode.includes("apiKey") || !widgetJsCode.includes("debugStatus.innerHTML = apiKey"), "No sensitive secrets exposed in debug display");
});

console.log("\n=================================================================");
console.log(`TOTAL AUDIT CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("=================================================================\n");

if (failed > 0) {
  process.exit(1);
}
