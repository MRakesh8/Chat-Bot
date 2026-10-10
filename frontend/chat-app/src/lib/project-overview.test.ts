import assert from "node:assert";

console.log("==================================================");
console.log("  RUNNING PROJECT OVERVIEW ROUTING & SETUP TESTS");
console.log("==================================================\n");

let passed = 0;
let failed = 0;

function check(testName: string, actual: any, expected: any) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ✓ PASSED: ${testName} -> ${JSON.stringify(actual)}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${testName} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// 1. Setup percent calculator helper
export function calculateSetupPercent(params: {
  storedUrl?: string | null;
  discoveryStatus?: string | null;
  isLive?: boolean;
  isActive?: boolean;
}): number {
  let percent = 25;
  if (params.storedUrl) percent += 25;
  if (params.discoveryStatus === "READY") percent += 25;
  if (params.isLive || params.isActive) percent += 25;
  return percent;
}

// 2. Next action text resolver helper
export function getNextActionText(params: {
  isAnalyzing: boolean;
  isLive: boolean;
  isReady: boolean;
}): string {
  if (params.isAnalyzing) return "NOVA AI is discovering your website content & pages";
  if (params.isLive) return "Your AI business assistant is live and active on your website";
  if (params.isReady) return "Installation detected! Verify settings and launch your assistant";
  return "Get your widget embed code to deploy on your website";
}

// 1. Setup Percent Tests
check("Base setup percent (no url, no discovery, not live)", calculateSetupPercent({}), 25);
check("Url added setup percent", calculateSetupPercent({ storedUrl: "https://example.com" }), 50);
check("Url + Discovery ready setup percent", calculateSetupPercent({ storedUrl: "https://example.com", discoveryStatus: "READY" }), 75);
check("Fully live setup percent", calculateSetupPercent({ storedUrl: "https://example.com", discoveryStatus: "READY", isLive: true }), 100);

// 2. Next Action Text Tests
check("Next action during analysis", getNextActionText({ isAnalyzing: true, isLive: false, isReady: false }), "NOVA AI is discovering your website content & pages");
check("Next action when live", getNextActionText({ isAnalyzing: false, isLive: true, isReady: true }), "Your AI business assistant is live and active on your website");
check("Next action when installation detected", getNextActionText({ isAnalyzing: false, isLive: false, isReady: true }), "Installation detected! Verify settings and launch your assistant");
check("Next action initial setup", getNextActionText({ isAnalyzing: false, isLive: false, isReady: false }), "Get your widget embed code to deploy on your website");

console.log(`\n--------------------------------------------------`);
console.log(`  SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log(`--------------------------------------------------\n`);

if (failed > 0) {
  process.exit(1);
}
