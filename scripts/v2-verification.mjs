import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

async function runVerification() {
  console.log("=====================================");
  console.log("ARIA AI v2 - PRODUCTION VERIFICATION");
  console.log("=====================================\n");
  
  const results = {
    wholeWebsiteReading: false,
    smartScroll: false,
    websiteGraph: false,
    elementLocator: false,
    actionEngine: false,
    apiDetection: false
  };

  // 1. Setup JSDOM
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test CRM</title>
      </head>
      <body>
        <header>
          <nav>
            <a href="/dashboard">Dashboard</a>
            <a href="/clients">Clients</a>
            <a href="/invoices">Invoices</a>
            <a href="/reports">Reports</a>
          </nav>
        </header>
        
        <main>
          <!-- Deeply nested form to test locator and extraction -->
          <div class="container">
            <div class="card">
              <h2>Create Invoice</h2>
              <form id="invoice-form" class="invoice-form">
                <input type="text" name="clientName" placeholder="Client Name" required />
                <input type="number" name="amount" placeholder="Amount" />
                <input type="password" name="secretToken" value="12345" /> <!-- Security check -->
                <button type="submit" class="btn btn-primary" id="submit-btn" aria-label="Submit Invoice">Submit Invoice</button>
              </form>
            </div>
            
            <!-- Hidden section -->
            <div class="advanced-options" style="display: none;" aria-hidden="true">
              <input type="checkbox" name="recurring" /> Recurring
            </div>
            
            <!-- Scroll container for Smart Scroll -->
            <div class="log-container" style="height: 100px; overflow-y: scroll;">
               <div style="height: 1000px;">
                  <p>Log 1</p>
                  <p>Log 2</p>
                  <p class="hidden-log" style="margin-top: 500px;">Log 50 (Lazy Loaded Target)</p>
               </div>
            </div>
          </div>
          
          <div id="shadow-host"></div>
        </main>
      </body>
    </html>
  `;

  console.log("[*] Initializing JSDOM environment...");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://example.com/" });
  const window = dom.window;
  const document = window.document;

  // Setup mock DOM features missing in JSDOM
  window.IntersectionObserver = class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  
  window.ResizeObserver = class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  
  // Create Shadow DOM
  const shadowHost = document.getElementById('shadow-host');
  const shadowRoot = shadowHost.attachShadow({mode: 'open'});
  shadowRoot.innerHTML = `<button id="shadow-btn" class="shadow-btn">Shadow Button</button>`;

  // Load Widget Context Engine & Action Engine
  console.log("[*] Injecting Context Engine & Action Engine...");
  const contextEngineSrc = fs.readFileSync(path.join(root, 'frontend', 'chat-app', 'public', 'widget-context-engine.js'), 'utf8');
  const actionEngineSrc = fs.readFileSync(path.join(root, 'frontend', 'chat-app', 'public', 'widget-action-engine.js'), 'utf8');
  const pluginSdkSrc = fs.readFileSync(path.join(root, 'frontend', 'chat-app', 'public', 'aria-plugin-sdk.js'), 'utf8');

  window.eval(contextEngineSrc);
  window.eval(actionEngineSrc);
  window.eval(pluginSdkSrc);

  const AriaContextEngine = window.AriaContextEngine;
  const actionEngine = new window.AriaActionEngine();
  const sdk = window.AriaPluginSDK;

  // -------------------------------------------------------------------
  // TEST 1: WHOLE WEBSITE READING & GRAPH
  // -------------------------------------------------------------------
  console.log("\n--- TEST 1: WHOLE WEBSITE READING & GRAPH ---");
  const engine = new AriaContextEngine();
  engine.start(document.body); // ensure observer/scroll is started
  const context = await engine.getContext();
  
  if (!context) {
     console.log("❌ context is null!");
     return;
  }
  
  const graph = context.graph;
  const content = context.content;
  
  const contextStr = JSON.stringify(context);
  if (contextStr.includes('Create Invoice') && contextStr.includes('Dashboard')) {
     results.wholeWebsiteReading = true;
     console.log("✅ Whole Website Reading Passed.");
  }
  
  if (graph && graph.nodes && graph.edges) {
       results.websiteGraph = true;
       console.log("✅ Website Graph Structure Passed.");
       console.log("   Graph nodes sample: ", JSON.stringify(Object.keys(graph.nodes).slice(0, 3)));
  } else {
     console.log("❌ Website Graph Structure Failed.");
  }

  // -------------------------------------------------------------------
  // TEST 2: SMART SCROLL
  // -------------------------------------------------------------------
  console.log("\n--- TEST 2: SMART SCROLL ---");
  const scrollContainers = context.metadata?.scrollContainers || [];
  if (scrollContainers.length > 0) {
    results.smartScroll = true;
    console.log("✅ Smart Scroll container detected: ", scrollContainers[0]);
  } else {
    console.log("⚠️ Smart Scroll not detected directly in metadata, checking internal state.");
    if (engine._smartScroll && engine._smartScroll.getContainers().length > 0) {
      results.smartScroll = true;
      console.log("✅ Smart Scroll container detected via internal state.");
    }
  }

  // -------------------------------------------------------------------
  // TEST 3: ELEMENT LOCATORS
  // -------------------------------------------------------------------
  console.log("\n--- TEST 3: ELEMENT LOCATORS ---");
  let btnNode = null;
  if (content && content.buttons) {
    btnNode = content.buttons.find(n => n.text === 'Submit Invoice');
  }
  
  if (btnNode && btnNode.locator) {
     results.elementLocator = true;
     console.log("✅ Element Locator Passed.");
     console.log("   Locator for Submit Button:", JSON.stringify(btnNode.locator));
  } else {
     console.log("❌ Element Locator failed, button node not found.");
  }

  // -------------------------------------------------------------------
  // TEST 4: ACTION ENGINE & SHADOW DOM
  // -------------------------------------------------------------------
  console.log("\n--- TEST 4: ACTION ENGINE & SHADOW DOM ---");
  let clickTriggered = false;
  document.getElementById('submit-btn').addEventListener('click', () => { clickTriggered = true; });
  
  try {
    await actionEngine.executeAction({
      type: 'click',
      locator: { css: '#submit-btn' }
    });
    if (clickTriggered) {
      console.log("✅ Action Engine 'click' passed.");
    }
  } catch(e) {
    console.log("❌ Action Engine 'click' failed:", e.message);
  }

  let shadowClickTriggered = false;
  shadowRoot.getElementById('shadow-btn').addEventListener('click', () => { shadowClickTriggered = true; });
  try {
    await actionEngine.executeAction({
      type: 'click',
      locator: { css: '.shadow-btn' }
    });
    if (shadowClickTriggered) {
      console.log("✅ Shadow DOM 'click' passed.");
      results.actionEngine = true;
    }
  } catch(e) {
    console.log("❌ Action Engine Shadow DOM 'click' failed:", e.message);
  }

  // -------------------------------------------------------------------
  // TEST 5: API DETECTION (Shopify)
  // -------------------------------------------------------------------
  console.log("\n--- TEST 5: API DETECTION ---");
  window.Shopify = { currency: { active: 'USD' } };
  const detected = sdk.detectActiveAdapter();
  if (detected === 'shopify') {
    results.apiDetection = true;
    console.log("✅ API Detection passed: ", detected);
  } else {
    console.log("❌ API Detection failed.");
  }

  // -------------------------------------------------------------------
  // TEST 6: SECURITY (Passwords removed)
  // -------------------------------------------------------------------
  console.log("\n--- TEST 6: SECURITY (PII Masking) ---");
  if (contextStr.includes('12345') && contextStr.includes('password')) {
     console.log("❌ Security Check Failed: Password value leaked in context!");
  } else {
     console.log("✅ Security Check Passed: Password value masked in context.");
  }

  // Wait for background DB/backend tasks in a real test...
  
  console.log("\n=====================================");
  console.log("RESULTS SUMMARY");
  console.log("=====================================");
  console.log(JSON.stringify(results, null, 2));
}

runVerification().catch(console.error);
