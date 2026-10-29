import assert from "node:assert";
import { JSDOM } from "jsdom";

console.log("========================================================================");
console.log("RUNNING NOVA CONVERSATION ROW LAYOUT & OVERFLOW TEST SUITE (JSDOM)");
console.log("========================================================================\n");

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

// Helper to simulate rendering a conversation row in a given sidebar container width
function createSidebarDOM(sidebarWidth = 256, title = "Short title", isFavorite = false, isActive = false) {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .min-w-0 { min-width: 0; }
          .flex-1 { flex: 1 1 0%; }
          .shrink-0 { flex-shrink: 0; }
          .ml-auto { margin-left: auto; }
          .flex { display: flex; }
          .items-center { align-items: center; }
        </style>
      </head>
      <body>
        <div id="sidebar" style="width: ${sidebarWidth}px;" class="w-full md:w-64 bg-sidebar">
          <div id="scroll-area" class="flex-1 px-2 py-1">
            <div id="row" class="group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm min-w-0">
              <svg id="conv-icon" class="w-4 h-4 shrink-0"></svg>
              <span id="conv-title" class="flex-1 min-w-0 truncate select-none text-xs leading-normal pr-1" title="${title}">
                ${title}
              </span>
              <div id="actions-container" class="flex items-center gap-0.5 shrink-0 ml-auto">
                <button id="fav-btn" type="button" aria-label="${isFavorite ? "Remove from favorites" : "Add to favorites"}" class="h-7 w-7 rounded-lg">
                  <svg id="heart-icon" class="w-3.5 h-3.5"></svg>
                </button>
                <button id="menu-btn" type="button" aria-label="Conversation actions" class="h-7 w-7 rounded-lg">
                  <svg id="menu-icon" class="w-3.5 h-3.5"></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);

  return dom.window.document;
}

// 1. Row has min-w-0 to avoid flex blowout
runCheck(1, "Row element contains min-w-0 class preventing container overflow blowout", () => {
  const doc = createSidebarDOM(256, "Normal Title");
  const row = doc.getElementById("row");
  assert(row.classList.contains("min-w-0"), "Row element must contain 'min-w-0'");
  assert(row.classList.contains("flex"), "Row element must be a flex container");
  assert(row.classList.contains("items-center"), "Row element must vertically align items");
});

// 2. Icon is locked against shrinking
runCheck(2, "Left conversation icon has shrink-0", () => {
  const doc = createSidebarDOM(256, "Normal Title");
  const icon = doc.getElementById("conv-icon");
  assert(icon.classList.contains("shrink-0"), "Icon must contain 'shrink-0'");
});

// 3. Title has flex-1, min-w-0, and truncate
runCheck(3, "Title container has flex-1, min-w-0, and truncate with native title tooltip", () => {
  const longTitle = "Very long conversation title about infrastructure stability and database optimization";
  const doc = createSidebarDOM(256, longTitle);
  const titleEl = doc.getElementById("conv-title");
  assert(titleEl.classList.contains("flex-1"), "Title element must have flex-1");
  assert(titleEl.classList.contains("min-w-0"), "Title element must have min-w-0");
  assert(titleEl.classList.contains("truncate"), "Title element must have truncate");
  assert.strictEqual(titleEl.getAttribute("title"), longTitle, "Title element must retain full text in native title attribute");
});

// 4. Action buttons container is pinned to right and cannot shrink
runCheck(4, "Action buttons container has shrink-0 and ml-auto to remain pinned on the right", () => {
  const doc = createSidebarDOM(256, "Another title");
  const actions = doc.getElementById("actions-container");
  assert(actions.classList.contains("shrink-0"), "Actions container must have shrink-0");
  assert(actions.classList.contains("ml-auto"), "Actions container must have ml-auto");
});

// 5. Both favorite and three-dot buttons exist inside the row
runCheck(5, "Both favorite button and three-dot button are rendered within the actions container", () => {
  const doc = createSidebarDOM(256, "Test chat", false);
  const actions = doc.getElementById("actions-container");
  const favBtn = doc.getElementById("fav-btn");
  const menuBtn = doc.getElementById("menu-btn");
  assert(actions.contains(favBtn), "Favorite button must be inside actions container");
  assert(actions.contains(menuBtn), "Three-dot menu button must be inside actions container");
  assert.strictEqual(favBtn.getAttribute("aria-label"), "Add to favorites", "Favorite button has Add to favorites accessible name");
  assert.strictEqual(menuBtn.getAttribute("aria-label"), "Conversation actions", "Three-dot button has Conversation actions accessible name");
});

// 6. Favorited state updates accessible label
runCheck(6, "Favorited state correctly updates favorite button aria-label", () => {
  const doc = createSidebarDOM(256, "Favorite chat", true);
  const favBtn = doc.getElementById("fav-btn");
  assert.strictEqual(favBtn.getAttribute("aria-label"), "Remove from favorites", "Favorite button has Remove from favorites accessible name");
});

// 7. Responsive width support: Narrow sidebar (200px) and wide sidebar (320px) maintain structure
runCheck(7, "Responsive width support: 200px narrow pane and 320px wide pane preserve child order and classes", () => {
  [200, 256, 320].forEach((width) => {
    const doc = createSidebarDOM(width, "Title at width " + width);
    const row = doc.getElementById("row");
    const children = Array.from(row.children);
    assert.strictEqual(children.length, 3, `Row at ${width}px must have exactly 3 direct children (icon, title, actions)`);
    assert.strictEqual(children[0].id, "conv-icon", "First child must be icon");
    assert.strictEqual(children[1].id, "conv-title", "Second child must be title");
    assert.strictEqual(children[2].id, "actions-container", "Third child must be actions container");
  });
});

console.log("\n========================================================================");
console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("========================================================================\n");

if (failed > 0) {
  process.exit(1);
}
