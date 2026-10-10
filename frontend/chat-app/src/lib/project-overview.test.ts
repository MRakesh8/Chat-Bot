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
  if (params.discoveryStatus === "READY" || params.discoveryStatus === "COMPLETED") percent += 25;
  if (params.isLive || params.isActive) percent += 25;
  return percent;
}

// 2. AI Analysis step state resolver helper
export function getAiAnalysisStepState(params: {
  discoveryStatus?: string | null;
  isAnalyzing?: boolean;
  storedUrl?: string | null;
}): {
  label: string;
  state: "ready" | "analyzing" | "failed" | "actionable" | "unconfigured";
} {
  const isReady = params.discoveryStatus === "READY" || params.discoveryStatus === "COMPLETED";
  const isFailed = params.discoveryStatus === "FAILED";
  const isAnalyzing = params.isAnalyzing || params.discoveryStatus === "ANALYZING" || params.discoveryStatus === "PENDING";

  if (isReady) {
    return { label: "AI Analysis Ready", state: "ready" };
  }
  if (isAnalyzing) {
    return { label: "AI Analyzing...", state: "analyzing" };
  }
  if (isFailed) {
    return { label: "Retry Analysis", state: "failed" };
  }
  if (params.storedUrl) {
    return { label: "Start AI Analysis", state: "actionable" };
  }
  return { label: "AI Analysis", state: "unconfigured" };
}

// 3. Next action text resolver helper
export function getNextActionText(params: {
  isAnalyzing: boolean;
  isLive: boolean;
  isReady: boolean;
  isDiscoveryReady?: boolean;
  storedUrl?: string | null;
}): string {
  if (params.isAnalyzing) return "NOVA AI is discovering your website content & pages";
  if (params.isLive) return "Your AI business assistant is live and active on your website";
  if (params.isReady) return "Installation detected! Verify settings and launch your assistant";
  if (!params.isDiscoveryReady && params.storedUrl) return "Start Analysis";
  return "Get your widget embed code to deploy on your website";
}

// 1. Setup Percent Tests
check("Base setup percent (no url, no discovery, not live)", calculateSetupPercent({}), 25);
check("Url added setup percent", calculateSetupPercent({ storedUrl: "https://example.com" }), 50);
check("Url + Discovery READY setup percent", calculateSetupPercent({ storedUrl: "https://example.com", discoveryStatus: "READY" }), 75);
check("Url + Discovery COMPLETED setup percent", calculateSetupPercent({ storedUrl: "https://example.com", discoveryStatus: "COMPLETED" }), 75);
check("Fully live setup percent", calculateSetupPercent({ storedUrl: "https://example.com", discoveryStatus: "READY", isLive: true }), 100);

// 2. AI Analysis Step State Tests
check("Step state when READY", getAiAnalysisStepState({ discoveryStatus: "READY" }), { label: "AI Analysis Ready", state: "ready" });
check("Step state when COMPLETED", getAiAnalysisStepState({ discoveryStatus: "COMPLETED" }), { label: "AI Analysis Ready", state: "ready" });
check("Step state when ANALYZING", getAiAnalysisStepState({ discoveryStatus: "ANALYZING" }), { label: "AI Analyzing...", state: "analyzing" });
check("Step state when PENDING", getAiAnalysisStepState({ discoveryStatus: "PENDING" }), { label: "AI Analyzing...", state: "analyzing" });
check("Step state when isAnalyzing flag active", getAiAnalysisStepState({ isAnalyzing: true }), { label: "AI Analyzing...", state: "analyzing" });
check("Step state when FAILED", getAiAnalysisStepState({ discoveryStatus: "FAILED" }), { label: "Retry Analysis", state: "failed" });
check("Step state when connected but unanalyzed", getAiAnalysisStepState({ storedUrl: "https://example.com" }), { label: "Start AI Analysis", state: "actionable" });
check("Step state when no url connected", getAiAnalysisStepState({}), { label: "AI Analysis", state: "unconfigured" });

// 3. Next Action Text Tests
check("Next action during analysis", getNextActionText({ isAnalyzing: true, isLive: false, isReady: false }), "NOVA AI is discovering your website content & pages");
check("Next action when live", getNextActionText({ isAnalyzing: false, isLive: true, isReady: true }), "Your AI business assistant is live and active on your website");
check("Next action when installation detected", getNextActionText({ isAnalyzing: false, isLive: false, isReady: true }), "Installation detected! Verify settings and launch your assistant");
check("Next action when website connected but unanalyzed", getNextActionText({ isAnalyzing: false, isLive: false, isReady: false, isDiscoveryReady: false, storedUrl: "https://example.com" }), "Start Analysis");
check("Next action initial setup", getNextActionText({ isAnalyzing: false, isLive: false, isReady: false }), "Get your widget embed code to deploy on your website");

console.log(`\n--------------------------------------------------`);
console.log(`  SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log(`--------------------------------------------------\n`);

if (failed > 0) {
  process.exit(1);
}

