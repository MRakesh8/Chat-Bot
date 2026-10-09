import { GeminiAdapter } from "../services/ai-router/providers/gemini-adapter";
import { UniversalRouterService } from "../services/ai-router/router";
import { ProviderVerifier } from "../services/provider-verifier";

async function runTests() {
  console.log("==================================================");
  console.log("PHASE 4 RELIABILITY VERIFICATION SUITE");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  // TEST 1: ERROR CLASSIFICATION
  console.log("\n[1] Testing GeminiAdapter Error Classification...");
  const adapter = new GeminiAdapter();

  const cases = [
    { err: { status: 401, message: "API key invalid" }, expected: "INVALID_CREDENTIAL" },
    { err: { status: 403, message: "Permission denied for project" }, expected: "INVALID_CREDENTIAL" },
    { err: { status: 404, message: "models/gemini-1.5-flash is not found for API version v1beta" }, expected: "MODEL_NOT_FOUND" },
    { err: { status: 429, message: "Quota exceeded for quota metric 'Generate Content Requests'" }, expected: "RATE_LIMITED" },
    { err: { status: 503, message: "The service is currently unavailable. Please try again later." }, expected: "PROVIDER_UNAVAILABLE" },
    { err: { status: 500, message: "Internal server error" }, expected: "PROVIDER_UNAVAILABLE" },
    { err: { message: "dial tcp: lookup oauth2.googleapis.com: no such host" }, expected: "PROVIDER_UNAVAILABLE" },
    { err: { message: "getaddrinfo ENOTFOUND generativelanguage.googleapis.com" }, expected: "PROVIDER_UNAVAILABLE" },
    { err: { message: "fetch failed: ECONNREFUSED" }, expected: "PROVIDER_UNAVAILABLE" },
    { err: { status: 400, message: "Invalid argument" }, expected: "INVALID_REQUEST" },
  ];

  for (const c of cases) {
    const result = adapter.classifyError(c.err);
    if (result === c.expected) {
      console.log(`  ✅ Passed: "${c.err.message || c.err.status}" -> ${result}`);
      passed++;
    } else {
      console.error(`  ❌ Failed: "${c.err.message || c.err.status}" -> Expected ${c.expected}, got ${result}`);
      failed++;
    }
  }

  // TEST 2: MODEL SUBSTITUTION BOUNDARIES (No substitution on 429 / 503 / Network failure)
  console.log("\n[2] Testing Model Substitution Boundaries in Router...");
  
  const dummyCatalog = [
    {
      provider: "gemini",
      modelId: "gemini-2.5-flash-lite",
      displayName: "Gemini 2.5 Flash Lite",
      capabilities: { textGeneration: true, streaming: true },
      contextLimit: 128000,
      maxOutput: 8192
    }
  ];

  // Mock adapter throwing 429
  let attemptCountCount429 = 0;
  const mock429Adapter = {
    providerId: "gemini",
    discoverModels: async () => dummyCatalog,
    generateChat: async () => {
      attemptCountCount429++;
      throw { status: 429, message: "Quota exceeded" };
    },
    generateChatStream: async function* () {},
    classifyError: (e: any) => adapter.classifyError(e)
  };

  // Mock adapter throwing Network Error
  let attemptCountDns = 0;
  const mockDnsAdapter = {
    providerId: "gemini",
    discoverModels: async () => dummyCatalog,
    generateChat: async () => {
      attemptCountDns++;
      throw { message: "dial tcp: lookup oauth2.googleapis.com: no such host" };
    },
    generateChatStream: async function* () {},
    classifyError: (e: any) => adapter.classifyError(e)
  };

  // Register mock provider adapter temporarily
  const { registry } = await import("../services/ai-router/registry");
  const origAdapter = registry.getAdapter("gemini");
  
  try {
    // 429 Test
    registry.register(mock429Adapter as any);
    const req429 = {
      capabilities: { textGeneration: true },
      preferredProvider: "gemini",
      operation: "chat" as const
    };

    try {
      await UniversalRouterService.executeChat(req429, [{ role: "user", content: "hi" }]);
      console.error("  ❌ Failed: 429 error did not throw");
      failed++;
    } catch (e: any) {
      if (attemptCountCount429 === 1) {
        console.log("  ✅ Passed: 429 error caused zero retries and zero model substitution.");
        passed++;
      } else {
        console.error(`  ❌ Failed: 429 error triggered ${attemptCountCount429} attempts instead of 1`);
        failed++;
      }
    }

    // DNS Test
    registry.register(mockDnsAdapter as any);
    try {
      await UniversalRouterService.executeChat(req429, [{ role: "user", content: "hi" }]);
      console.error("  ❌ Failed: DNS error did not throw");
      failed++;
    } catch (e: any) {
      if (attemptCountDns === 1) {
        console.log("  ✅ Passed: DNS/network failure caused zero retries and zero model substitution.");
        passed++;
      } else {
        console.error(`  ❌ Failed: DNS error triggered ${attemptCountDns} attempts instead of 1`);
        failed++;
      }
    }

  } finally {
    registry.register(origAdapter);
  }

  // TEST 3: STALE MODEL RECOVERY & EXACTLY 1 RETRY FOR 404 MODEL_NOT_FOUND
  console.log("\n[3] Testing Stale Model Auto-Substitution on 404 MODEL_NOT_FOUND...");
  
  let modelNotFoundAttempts = 0;
  let substitutedModelUsed = "";

  const mockStaleModelAdapter = {
    providerId: "gemini",
    discoverModels: async () => [
      {
        provider: "gemini",
        modelId: "gemini-1.5-flash",
        displayName: "Gemini 1.5 Flash (Stale)",
        capabilities: { textGeneration: true, streaming: true },
        contextLimit: 128000,
        maxOutput: 8192
      },
      {
        provider: "gemini",
        modelId: "gemini-2.5-flash-lite",
        displayName: "Gemini 2.5 Flash Lite",
        capabilities: { textGeneration: true, streaming: true },
        contextLimit: 128000,
        maxOutput: 8192
      }
    ],
    generateChat: async (req: any) => {
      modelNotFoundAttempts++;
      if (req.model.modelId === "gemini-1.5-flash") {
        throw { status: 404, message: "models/gemini-1.5-flash is not found for API version v1beta" };
      }
      substitutedModelUsed = req.model.modelId;
      return { content: "Success response after substitution", usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
    generateChatStream: async function* () {},
    classifyError: (e: any) => adapter.classifyError(e)
  };

  try {
    registry.register(mockStaleModelAdapter as any);

    const staleReq = {
      capabilities: { textGeneration: true },
      preferredProvider: "gemini",
      preferredModel: "gemini-1.5-flash",
      operation: "chat" as const
    };

    const res = await UniversalRouterService.executeChat(staleReq, [{ role: "user", content: "test" }]);

    if (modelNotFoundAttempts === 2 && substitutedModelUsed === "gemini-2.5-flash-lite" && res.content.includes("Success")) {
      console.log(`  ✅ Passed: Stale model gemini-1.5-flash returned 404 -> auto-substituted to ${substitutedModelUsed} and succeeded on attempt #${modelNotFoundAttempts}.`);
      passed++;
    } else {
      console.error(`  ❌ Failed: Attempts: ${modelNotFoundAttempts}, Substituted Model: ${substitutedModelUsed}`);
      failed++;
    }
  } finally {
    registry.register(origAdapter);
  }

  console.log("\n==================================================");
  console.log(`SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error("Test runner error:", e);
  process.exit(1);
});
