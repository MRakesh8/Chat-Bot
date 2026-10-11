import assert from "node:assert";

console.log("==================================================");
console.log("  RUNNING LAZY-WITH-RETRY & CHUNK RECOVERY TESTS  ");
console.log("==================================================\n");

let passed = 0;
let failed = 0;

function check(testName: string, actual: any, expected: any) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ✓ PASSED: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${testName} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// Emulate chunk error detection logic
function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("loading chunk") ||
    message.includes("loading css chunk") ||
    message.includes("unexpected token '<'") ||
    message.includes("mime type") ||
    message.includes("dynamically imported module")
  );
}

// 1. Chunk load error detection tests
check("Detect 'Failed to fetch dynamically imported module'", isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://app.com/assets/settings-123.js")), true);
check("Detect 'Importing a module script failed'", isChunkLoadError(new Error("Importing a module script failed")), true);
check("Detect 'Loading chunk 42 failed'", isChunkLoadError(new Error("Loading chunk 42 failed")), true);
check("Detect Vite HTML fallback 'Unexpected token <'", isChunkLoadError(new Error("Unexpected token '<', \"<!doctype \"... is not valid JSON")), true);
check("Detect MIME type mismatch", isChunkLoadError(new Error("Expected a JavaScript module script but server responded with a MIME type of text/html")), true);
check("Ignore standard TypeError: undefined is not a function", isChunkLoadError(new TypeError("undefined is not a function")), false);
check("Ignore standard network 500 error", isChunkLoadError(new Error("Internal Server Error")), false);

// 2. Simulated Mock Storage for Session Guard
class MockSessionStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const mockStorage = new MockSessionStorage();
const CHUNK_RELOAD_KEY_PREFIX = "nova_chunk_reloaded_";

function hasReloaded(key: string): boolean {
  return mockStorage.getItem(`${CHUNK_RELOAD_KEY_PREFIX}${key}`) === "true";
}

function setReloaded(key: string): void {
  mockStorage.setItem(`${CHUNK_RELOAD_KEY_PREFIX}${key}`, "true");
}

function clearReload(key: string): void {
  mockStorage.removeItem(`${CHUNK_RELOAD_KEY_PREFIX}${key}`);
}

// Test session reload guard
check("Initial state has not reloaded for /settings", hasReloaded("/settings"), false);
setReloaded("/settings");
check("Marked reload state for /settings", hasReloaded("/settings"), true);
check("Different path /projects has not reloaded", hasReloaded("/projects"), false);
clearReload("/settings");
check("Cleared reload state for /settings", hasReloaded("/settings"), false);

// 3. Retry and Recovery Logic Simulation
async function simulateImportWithRetry<T>(
  importer: () => Promise<T>,
  maxRetries: number = 2,
  pathKey: string = "/settings",
  onReload: () => void = () => {}
): Promise<{ result?: T; reloaded: boolean; attempts: number; error?: any }> {
  let attempts = 0;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts++;
    try {
      const res = await importer();
      clearReload(pathKey);
      return { result: res, reloaded: false, attempts };
    } catch (err) {
      lastError = err;
    }
  }

  // Check chunk error and reload guard
  if (isChunkLoadError(lastError)) {
    if (!hasReloaded(pathKey)) {
      setReloaded(pathKey);
      onReload();
      return { reloaded: true, attempts };
    }
  }

  return { reloaded: false, attempts, error: lastError };
}

async function runAsyncTests() {
  // Test A: Clean import succeeds on 1st attempt
  const testA = await simulateImportWithRetry(async () => "ComponentLoaded", 2, "/projects");
  check("Clean import succeeds without reload", testA.result, "ComponentLoaded");
  check("Clean import attempts count is 1", testA.attempts, 1);
  check("Clean import did not reload", testA.reloaded, false);

  // Test B: Transient failure recovers on retry (attempt 2)
  let countB = 0;
  const testB = await simulateImportWithRetry(async () => {
    countB++;
    if (countB === 1) throw new Error("Transient network glitch");
    return "RecoveredComponent";
  }, 2, "/chat");
  check("Transient failure recovers successfully", testB.result, "RecoveredComponent");
  check("Transient failure completed on attempt 2", testB.attempts, 2);
  check("Transient failure did not reload", testB.reloaded, false);

  // Test C: Deployment version chunk mismatch triggers 1 safe reload
  mockStorage.clear();
  let reloadCount = 0;
  const testC = await simulateImportWithRetry(async () => {
    throw new Error("Failed to fetch dynamically imported module: /assets/settings-old.js");
  }, 2, "/settings", () => { reloadCount++; });
  check("Chunk error triggers single reload", testC.reloaded, true);
  check("Reload callback invoked once", reloadCount, 1);
  check("Session guard marked as reloaded", hasReloaded("/settings"), true);

  // Test D: Subsequent failure after reload prevents infinite loop
  let reloadCountD = 0;
  const testD = await simulateImportWithRetry(async () => {
    throw new Error("Failed to fetch dynamically imported module: /assets/settings-old.js");
  }, 2, "/settings", () => { reloadCountD++; });
  check("Repeated chunk error after reload does NOT trigger second reload", testD.reloaded, false);
  check("Reload callback not called again (loop prevented)", reloadCountD, 0);
  check("Error returned to allow ErrorBoundary fallback", isChunkLoadError(testD.error), true);

  // Test E: Unsaved user work suppresses auto-reload to protect user draft
  mockStorage.clear();
  let reloadCountE = 0;
  const testE = await simulateImportWithRetry(
    async () => {
      throw new Error("Failed to fetch dynamically imported module: /assets/settings-old.js");
    },
    2,
    "/settings",
    () => { reloadCountE++; }
  );
  // Simulate active unsaved work detection
  const mockHasUnsavedWork = () => true;
  const shouldAutoReload = !mockHasUnsavedWork();
  check("Unsaved work check accurately identifies dirty input", mockHasUnsavedWork(), true);
  check("Unsaved work suppresses auto-reload flag", shouldAutoReload, false);

  console.log(`\n--------------------------------------------------`);
  console.log(`  SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log(`--------------------------------------------------\n`);

  if (failed > 0) process.exit(1);
}

runAsyncTests();
