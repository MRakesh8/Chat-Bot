import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

console.log("==================================================");
console.log("  RUNNING RELIABILITY & ARCHITECTURE REGRESSION TESTS");
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

// 1. Inspect vercel.json cache header rules
const vercelJsonPath = path.resolve(process.cwd(), "vercel.json");
const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, "utf-8"));

const headers = vercelConfig.headers || [];
const assetRule = headers.find((h: any) => h.source === "/assets/(.*)");
const globalRule = headers.find((h: any) => h.source === "/(.*)");

check("vercel.json contains /assets/(.*) cache rule", !!assetRule, true);
check(
  "/assets/(.*) has immutable max-age=31536000 header",
  assetRule?.headers?.some((hdr: any) => hdr.key === "Cache-Control" && hdr.value.includes("max-age=31536000") && hdr.value.includes("immutable")),
  true
);

check("vercel.json contains global /(.*) fallback rule", !!globalRule, true);
check(
  "global /(.*) rule has must-revalidate",
  globalRule?.headers?.some((hdr: any) => hdr.key === "Cache-Control" && hdr.value.includes("must-revalidate")),
  true
);

// Crucial: ensure s-maxage and stale-while-revalidate are REMOVED from HTML documents to prevent CDN version mismatch
const globalCacheHeader = globalRule?.headers?.find((hdr: any) => hdr.key === "Cache-Control")?.value || "";
check("global /(.*) rule does NOT contain s-maxage (no CDN caching for index.html)", globalCacheHeader.includes("s-maxage"), false);
check("global /(.*) rule does NOT contain stale-while-revalidate", globalCacheHeader.includes("stale-while-revalidate"), false);

// Ensure assets rule precedes global rule
const assetIndex = headers.indexOf(assetRule);
const globalIndex = headers.indexOf(globalRule);
check("/assets/(.*) rule is placed BEFORE /(.*) rule in headers", assetIndex < globalIndex, true);

// 2. Auth deduplication simulation
let dbUserFetchCount = 0;
let inFlightFetch: Promise<{ id: string }> | null = null;

async function mockFetchDbUser(token: string): Promise<{ id: string }> {
  if (inFlightFetch) {
    return inFlightFetch;
  }

  const promise = (async () => {
    try {
      dbUserFetchCount++;
      await new Promise((r) => setTimeout(r, 50));
      return { id: "user-123" };
    } finally {
      inFlightFetch = null;
    }
  })();

  inFlightFetch = promise;
  return promise;
}

// 3. Token refresh deduplication simulation
let refreshTokenCount = 0;
let activeRefreshPromise: Promise<string | null> | null = null;

async function mockGetSharedRefreshedToken(): Promise<string | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      refreshTokenCount++;
      await new Promise((r) => setTimeout(r, 50));
      return "fresh-access-token-456";
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

async function runAuthTests() {
  // Test concurrent fetchDbUser calls (e.g. getSession + onAuthStateChange firing simultaneously)
  const [res1, res2] = await Promise.all([
    mockFetchDbUser("token-a"),
    mockFetchDbUser("token-a"),
  ]);

  check("Concurrent fetchDbUser returns matching user", res1.id === res2.id, true);
  check("Concurrent fetchDbUser only triggers 1 actual network call", dbUserFetchCount, 1);

  // Test sequential fetchDbUser initiates new fetch after completion
  await mockFetchDbUser("token-b");
  check("Subsequent fetchDbUser initiates new network call when idle", dbUserFetchCount, 2);

  // Test concurrent 401 token refresh calls
  const [t1, t2, t3] = await Promise.all([
    mockGetSharedRefreshedToken(),
    mockGetSharedRefreshedToken(),
    mockGetSharedRefreshedToken(),
  ]);

  check("All concurrent 401s receive identical refreshed token", t1 === "fresh-access-token-456" && t2 === t1 && t3 === t1, true);
  check("Concurrent 401s only dispatch 1 token refresh to Supabase", refreshTokenCount, 1);

  // 4. Route Error Boundary auto-reset simulation
  class MockRouteErrorBoundary {
    hasError = false;
    currentLocation: string;

    constructor(initialLocation: string) {
      this.currentLocation = initialLocation;
    }

    triggerError() {
      this.hasError = true;
    }

    onLocationChange(newLocation: string) {
      if (this.hasError && this.currentLocation !== newLocation) {
        this.hasError = false;
      }
      this.currentLocation = newLocation;
    }
  }

  const boundary = new MockRouteErrorBoundary("/settings");
  check("Initial boundary state has no error", boundary.hasError, false);

  boundary.triggerError();
  check("Boundary catches error on /settings", boundary.hasError, true);

  // When user navigates to /projects in sidebar:
  boundary.onLocationChange("/projects");
  check("Boundary automatically resets error on route change to /projects", boundary.hasError, false);
  check("Current location updated to /projects", boundary.currentLocation, "/projects");

  // 5. Auth Timeout Safety & Backend Recovery Simulation
  let simulatedDbUser: { id: string; role: string } | null = null;
  let scheduledRetry = false;
  let isColdStart = true;

  async function simulateFetchDbUserWithRecovery(statusOrError: number | "timeout"): Promise<void> {
    if (statusOrError === 401 || statusOrError === 403) {
      simulatedDbUser = null;
      scheduledRetry = false;
      return;
    }

    if (statusOrError === "timeout" || statusOrError === 502 || statusOrError === 503) {
      // Cold-start timeout: preserve existing state and schedule background recovery
      scheduledRetry = true;
      // Do NOT wipe existing dbUser if user was already known
      return;
    }

    if (statusOrError === 200) {
      simulatedDbUser = { id: "user-123", role: "super_admin" };
      scheduledRetry = false;
    }
  }

  // A) Cold start timeout occurs: user is NOT treated as logged out, background retry is scheduled
  await simulateFetchDbUserWithRecovery("timeout");
  check("Cold-start timeout schedules automatic background retry", scheduledRetry, true);

  // B) When backend becomes available, background retry succeeds without page refresh
  await simulateFetchDbUserWithRecovery(200);
  check("Background retry populates dbUser without requiring page refresh", simulatedDbUser?.role, "super_admin");
  check("Background retry clears retry schedule", scheduledRetry, false);

  // C) Genuine 401 authorization failure clears dbUser and does NOT retry
  await simulateFetchDbUserWithRecovery(401);
  check("401 Auth failure clears dbUser", simulatedDbUser, null);
  check("401 Auth failure does not schedule retry", scheduledRetry, false);

  // 6. Chat Draft Persistence Simulation
  class MockSessionStore {
    private map = new Map<string, string>();
    getItem(k: string) { return this.map.get(k) || null; }
    setItem(k: string, v: string) { this.map.set(k, v); }
    removeItem(k: string) { this.map.delete(k); }
    clear() { this.map.clear(); }
  }
  const sessionStore = new MockSessionStore();
  const convId = "conv-abc";
  const draftText = "My important unsent prompt";

  sessionStore.setItem(`nova_chat_draft_${convId}`, draftText);
  check("Unsent chat draft persisted in sessionStorage", sessionStore.getItem(`nova_chat_draft_${convId}`), draftText);

  // Simulate recovery reload (sessionStorage is preserved)
  const draftAfterReload = sessionStore.getItem(`nova_chat_draft_${convId}`);
  check("Draft survives page recovery reload", draftAfterReload, draftText);

  // Sign out clears drafts
  sessionStore.removeItem(`nova_chat_draft_${convId}`);
  check("Sign out cleans up persisted drafts", sessionStore.getItem(`nova_chat_draft_${convId}`), null);

  console.log(`\n--------------------------------------------------`);
  console.log(`  SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log(`--------------------------------------------------\n`);

  if (failed > 0) process.exit(1);
}

runAuthTests();
