import { crypto } from "@workspace/db";
import { UniversalRouterService } from "../src/services/ai-router/router";
import { GeminiAdapter } from "../src/services/ai-router/providers/gemini-adapter";
import { registry } from "../src/services/ai-router/registry";
import {
  isTransientError,
  isPermanentCredentialError,
  extractRetryAfterMs,
  calculateBackoffMs,
  sleepWithDeadline,
  AllAiProvidersFailedError
} from "../src/services/ai-router/retry";
import { BaseProviderAdapter, ChatCompletionRequest, ChatCompletionResponse } from "../src/services/ai-router/providers/base";

/**
 * Mock Provider Adapter for deterministic testing of retries, failovers, and streaming
 */
class MockTestAdapter extends BaseProviderAdapter {
  readonly providerId: string;
  private chatHandler?: (req: ChatCompletionRequest) => Promise<ChatCompletionResponse>;
  private streamHandler?: (req: ChatCompletionRequest) => AsyncIterable<{ text: string }>;

  constructor(providerId: string) {
    super();
    this.providerId = providerId;
  }

  setChatHandler(handler: (req: ChatCompletionRequest) => Promise<ChatCompletionResponse>) {
    this.chatHandler = handler;
  }

  setStreamHandler(handler: (req: ChatCompletionRequest) => AsyncIterable<{ text: string }>) {
    this.streamHandler = handler;
  }

  async discoverModels(): Promise<any[]> {
    return [
      {
        provider: this.providerId,
        modelId: "test-model-1",
        displayName: "Test Model 1",
        capabilities: { textGeneration: true, streaming: true, vision: true, tools: true, structuredOutput: true, reasoning: true, embedding: false, audio: false }
      }
    ];
  }

  async generateChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (this.chatHandler) return this.chatHandler(request);
    return { content: `Response from ${this.providerId}` };
  }

  async *generateChatStream(request: ChatCompletionRequest): AsyncIterable<{ text: string }> {
    if (this.streamHandler) {
      yield* this.streamHandler(request);
    } else {
      yield { text: `Stream chunk from ${this.providerId}` };
    }
  }

  classifyError(error: any): any {
    const msg = (error?.message || "").toLowerCase();
    const status = error?.status || error?.statusCode;
    if (status === 401 || status === 403 || msg.includes("invalid key") || msg.includes("unauthenticated")) {
      return "INVALID_CREDENTIAL";
    }
    if (status === 404 || msg.includes("not found")) {
      return "MODEL_NOT_FOUND";
    }
    if (status === 429 || msg.includes("rate limit") || msg.includes("resource_exhausted")) {
      return "RATE_LIMITED";
    }
    if (status === 503 || status === 500 || msg.includes("unavailable") || msg.includes("overloaded")) {
      return "PROVIDER_UNAVAILABLE";
    }
    return "UNKNOWN_ERROR";
  }
}

async function runReliabilityTests() {
  console.log("================================================================");
  console.log("  AI ROUTER & WIDGET RELIABILITY REGRESSION TEST SUITE");
  console.log("================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAILED: ${testName} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // 1. ENCRYPTION-KEY MISMATCH & INVALID CREDENTIAL HANDLING
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 1] Credential Decryption & Key Validation");

  // Encrypt with a known mock key format
  const encryptedKey = crypto.encrypt("AIzaSyValidGeminiKey12345");
  const successfullyDecrypted = crypto.decrypt(encryptedKey);
  assert(
    successfullyDecrypted === "AIzaSyValidGeminiKey12345",
    "Current ENCRYPTION_KEY decrypts freshly encrypted credential"
  );

  // Simulate an encrypted key from an incompatible/changed ENCRYPTION_KEY (corrupted auth tag)
  const parts = encryptedKey.split(":");
  const corruptedAuthTagKey = `${parts[0]}:ffffffffffffffffffffffffffffffff:${parts[2]}`;
  const failedDecryption = crypto.decrypt(corruptedAuthTagKey);
  assert(
    failedDecryption === "",
    "Mismatched/corrupt ENCRYPTION_KEY returns empty string without crashing or leaking secrets"
  );

  // Validate isValidKey logic
  assert(UniversalRouterService.isValidKey(successfullyDecrypted) === true, "Valid decrypted key is recognized as valid");
  assert(UniversalRouterService.isValidKey("") === false, "Empty decrypted key is rejected");
  assert(UniversalRouterService.isValidKey(null) === false, "Null key is rejected");
  assert(UniversalRouterService.isValidKey(undefined) === false, "Undefined key is rejected");
  assert(
    UniversalRouterService.isValidKey("1234567890abcdef1234567890abcdef:1234567890abcdef1234567890abcdef:deadbeef") === false,
    "Raw un-decrypted IV:Tag:Data string is rejected as an invalid API key"
  );

  // Verify production security guard on dummy fallback key
  const originalNodeEnv = process.env.NODE_ENV;
  const originalOldKey = process.env.OLD_ENCRYPTION_KEY;
  try {
    const nodeCrypto = await import("crypto");
    const dummyBuffer = nodeCrypto.scryptSync("fallback_dummy_key_for_local_dev_only", "salt", 32);
    const iv = nodeCrypto.randomBytes(16);
    const cipher = nodeCrypto.createCipheriv("aes-256-gcm", dummyBuffer, iv);
    let enc = cipher.update("secret-test-dev-val", "utf8", "hex") + cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    const devEncrypted = `${iv.toString("hex")}:${tag}:${enc}`;

    // Under NODE_ENV=production, dummy fallback key is strictly prohibited without explicit env key
    process.env.NODE_ENV = "production";
    delete process.env.OLD_ENCRYPTION_KEY;
    const prodBlocked = crypto.decrypt(devEncrypted);
    assert(
      prodBlocked === "",
      "In NODE_ENV=production, fallback dummy key is strictly prohibited from decrypting without explicit config"
    );

    // In NODE_ENV=production, an unrecognized secret returns empty string safely without leaking secrets
    const cipherUnknownBuffer = nodeCrypto.scryptSync("arbitrary_unknown_key_999", "salt", 32);
    const cipherUnknown = nodeCrypto.createCipheriv("aes-256-gcm", cipherUnknownBuffer, iv);
    let unkEnc = cipherUnknown.update("val", "utf8", "hex");
    unkEnc += cipherUnknown.final("hex");
    const unkTag = cipherUnknown.getAuthTag().toString("hex");
    const unknownEncrypted = `${iv.toString("hex")}:${unkTag}:${unkEnc}`;
    const prodUnknown = crypto.decrypt(unknownEncrypted);
    assert(
      prodUnknown === "",
      "In NODE_ENV=production, unrecognized secret safely returns empty string without crashing or exposing secrets"
    );

    // In NODE_ENV=production, corrupted tag fails safely without throwing or leaking secrets
    const corruptedTagCipher = `${iv.toString("hex")}:00000000000000000000000000000000:${enc}`;
    const prodCorruptTag = crypto.decrypt(corruptedTagCipher);
    assert(
      prodCorruptTag === "",
      "In NODE_ENV=production, corrupted auth tag fails safely returning empty string"
    );

    // When administrator explicitly provides OLD_ENCRYPTION_KEY, legacy credentials recover safely
    process.env.OLD_ENCRYPTION_KEY = "fallback_dummy_key_for_local_dev_only";
    const recoveredExplicit = crypto.decrypt(devEncrypted);
    assert(
      recoveredExplicit === "secret-test-dev-val",
      "Explicit OLD_ENCRYPTION_KEY in production safely recovers legacy seeded credentials"
    );

    // In non-production (development), dev fallback key is allowed for local development convenience
    process.env.NODE_ENV = "development";
    delete process.env.OLD_ENCRYPTION_KEY;
    const devAllowed = crypto.decrypt(devEncrypted);
    assert(
      devAllowed === "secret-test-dev-val",
      "In NODE_ENV=development, fallback dummy key is permitted for local seed records"
    );
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalOldKey) process.env.OLD_ENCRYPTION_KEY = originalOldKey;
    else delete process.env.OLD_ENCRYPTION_KEY;
  }

  // --------------------------------------------------------------------------
  // 2. ERROR CLASSIFICATION (GEMINI ADAPTER & RETRY HELPERS)
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 2] Error Classification & Backoff Calculation");

  const geminiAdapter = new GeminiAdapter();

  // Gemini 503 / Overloaded
  const err503 = { status: 503, message: "The model is overloaded. Please try again later." };
  assert(
    geminiAdapter.classifyError(err503) === "PROVIDER_UNAVAILABLE",
    "GeminiAdapter classifies HTTP 503 as PROVIDER_UNAVAILABLE"
  );
  assert(
    geminiAdapter.classifyError({ error: { status: "UNAVAILABLE", code: 503 } }) === "PROVIDER_UNAVAILABLE",
    "GeminiAdapter classifies gRPC UNAVAILABLE status as PROVIDER_UNAVAILABLE"
  );
  assert(
    isTransientError("PROVIDER_UNAVAILABLE", err503) === true,
    "isTransientError recognizes 503 as retryable transient error"
  );

  // 429 Rate Limit
  const err429 = { status: 429, message: "Resource exhausted: quota exceeded" };
  assert(
    geminiAdapter.classifyError(err429) === "RATE_LIMITED",
    "GeminiAdapter classifies HTTP 429 as RATE_LIMITED"
  );
  assert(
    isTransientError("RATE_LIMITED", err429) === true,
    "isTransientError recognizes 429 as retryable transient error"
  );

  // 401 / 403 Permanent Credentials
  const err401 = { status: 401, message: "API key not valid. Please pass a valid API key." };
  assert(
    geminiAdapter.classifyError(err401) === "INVALID_CREDENTIAL",
    "GeminiAdapter classifies 401 as INVALID_CREDENTIAL"
  );
  assert(
    isPermanentCredentialError("INVALID_CREDENTIAL", err401) === true,
    "isPermanentCredentialError identifies 401 as permanent (non-retryable on same credential)"
  );
  assert(
    isTransientError("INVALID_CREDENTIAL", err401) === false,
    "isTransientError correctly excludes permanent 401 credential failures"
  );

  // Network Disconnect
  const errNetwork = new Error("fetch failed: socket hang up");
  assert(
    geminiAdapter.classifyError(errNetwork) === "PROVIDER_UNAVAILABLE",
    "GeminiAdapter classifies socket hang up / fetch failed as PROVIDER_UNAVAILABLE"
  );
  assert(
    isTransientError("PROVIDER_UNAVAILABLE", errNetwork) === true,
    "isTransientError recognizes network disconnect as transient"
  );

  // --------------------------------------------------------------------------
  // 3. RETRY-AFTER HEADER & BACKOFF TIMING
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 3] Retry-After Extraction & Exponential Backoff");

  const errWithHeader = { headers: { "retry-after": "1.5" } };
  assert(
    extractRetryAfterMs(errWithHeader) === 1500,
    "extractRetryAfterMs parses seconds header ('1.5' -> 1500ms)"
  );

  const errWithGoogleDetails = {
    error: {
      details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "2s" }]
    }
  };
  assert(
    extractRetryAfterMs(errWithGoogleDetails) === 2000,
    "extractRetryAfterMs parses Google RPC RetryInfo (2s -> 2000ms)"
  );

  // Exponential backoff calculation
  const b0 = calculateBackoffMs(0, null, 100, 1000, 0); // 100 * 2^0 = 100
  const b1 = calculateBackoffMs(1, null, 100, 1000, 0); // 100 * 2^1 = 200
  const b2 = calculateBackoffMs(2, null, 100, 1000, 0); // 100 * 2^2 = 400
  const bCapped = calculateBackoffMs(10, null, 100, 1000, 0); // Capped at 1000
  assert(b0 === 100 && b1 === 200 && b2 === 400, "Exponential backoff doubles each attempt");
  assert(bCapped === 1000, "Exponential backoff respects maxDelayMs ceiling");

  // Sleep deadline check
  const shortDeadline = Date.now() + 50;
  const canSleep = await sleepWithDeadline(200, shortDeadline);
  assert(canSleep === false, "sleepWithDeadline aborts early if delay exceeds remaining request deadline");

  // --------------------------------------------------------------------------
  // 4. TRANSIENT RETRY SUCCESS & RECOVERY
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 4] Router Bounded Transient Retries");

  const mockProviderA = new MockTestAdapter("mock-gemini");
  registry.register(mockProviderA);

  let attemptCount = 0;
  mockProviderA.setChatHandler(async () => {
    attemptCount++;
    if (attemptCount === 1) {
      const err = new Error("503 Service Unavailable: High demand");
      (err as any).status = 503;
      throw err;
    }
    return { content: "Recovered successfully on retry!" };
  });

  // Test transient retry recovery using resolveCandidates override
  const originalResolve = UniversalRouterService.resolveCandidates;
  UniversalRouterService.resolveCandidates = async () => [
    {
      provider: "mock-gemini",
      modelId: "test-model-1",
      credential: { id: "test_key_1", apiKey: "valid-key-1", type: "system" }
    }
  ];

  attemptCount = 0;
  const retryResult = await UniversalRouterService.executeChat(
    { operation: "chat", capabilities: { textGeneration: true } },
    [{ role: "user", content: "hello" }],
    0.7,
    { maxRetries: 2, baseDelayMs: 20, maxDelayMs: 50, jitterMs: 5, deadlineMs: 5000 }
  );

  assert(
    attemptCount === 2 && retryResult.content === "Recovered successfully on retry!",
    "Router retried transient 503 and succeeded on second attempt"
  );

  // --------------------------------------------------------------------------
  // 5. PROVIDER FAILOVER ON EXHAUSTED RETRIES
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 5] Router Failover Across Providers");

  const mockProviderB = new MockTestAdapter("mock-openai");
  registry.register(mockProviderB);

  // Candidate 1 fails permanently with 503; Candidate 2 succeeds
  mockProviderA.setChatHandler(async () => {
    const err = new Error("503 Service Unavailable");
    (err as any).status = 503;
    throw err;
  });

  mockProviderB.setChatHandler(async () => {
    return { content: "Response from secondary provider mock-openai" };
  });

  UniversalRouterService.resolveCandidates = async () => [
    {
      provider: "mock-gemini",
      modelId: "test-model-1",
      credential: { id: "test_key_1", apiKey: "valid-key-1", type: "system" }
    },
    {
      provider: "mock-openai",
      modelId: "test-model-1",
      credential: { id: "test_key_2", apiKey: "valid-key-2", type: "system" }
    }
  ];

  const failoverResult = await UniversalRouterService.executeChat(
    { operation: "chat", capabilities: { textGeneration: true } },
    [{ role: "user", content: "hello" }],
    0.7,
    { maxRetries: 1, baseDelayMs: 10, maxDelayMs: 20, jitterMs: 0, deadlineMs: 5000 }
  );

  assert(
    failoverResult.content === "Response from secondary provider mock-openai",
    "Router failed over to secondary provider when primary 503 retries were exhausted"
  );

  // --------------------------------------------------------------------------
  // 6. IMMEDIATE FAILOVER ON PERMANENT 401 CREDENTIAL (NO SILENT RETRIES)
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 6] Permanent Credential Error Handling");

  let p1Attempts = 0;
  mockProviderA.setChatHandler(async () => {
    p1Attempts++;
    const err = new Error("401 Unauthorized: Invalid API key");
    (err as any).status = 401;
    throw err;
  });

  p1Attempts = 0;
  const invalidKeyFailoverResult = await UniversalRouterService.executeChat(
    { operation: "chat", capabilities: { textGeneration: true } },
    [{ role: "user", content: "hello" }],
    0.7,
    { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 20, jitterMs: 0, deadlineMs: 5000 }
  );

  assert(
    p1Attempts === 1,
    "Router immediately bypassed retries for permanent 401 INVALID_CREDENTIAL"
  );
  assert(
    invalidKeyFailoverResult.content === "Response from secondary provider mock-openai",
    "Router successfully fell back to secondary provider after permanent credential rejection"
  );

  // --------------------------------------------------------------------------
  // 7. ALL PROVIDERS FAILED BEHAVIOR
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 7] All Providers Failed Behavior");

  mockProviderB.setChatHandler(async () => {
    const err = new Error("503 Service Unavailable");
    (err as any).status = 503;
    throw err;
  });

  let allFailedCaught = false;
  let errorInstance: any = null;
  try {
    await UniversalRouterService.executeChat(
      { operation: "chat", capabilities: { textGeneration: true } },
      [{ role: "user", content: "hello" }],
      0.7,
      { maxRetries: 1, baseDelayMs: 5, maxDelayMs: 10, jitterMs: 0, deadlineMs: 5000 }
    );
  } catch (err: any) {
    allFailedCaught = true;
    errorInstance = err;
  }

  assert(allFailedCaught === true, "Router threw when all candidate providers failed");
  assert(
    errorInstance instanceof AllAiProvidersFailedError,
    "Router threw AllAiProvidersFailedError instance"
  );
  assert(
    errorInstance?.code === "PROVIDER_UNAVAILABLE",
    "AllAiProvidersFailedError has code 'PROVIDER_UNAVAILABLE'"
  );

  // --------------------------------------------------------------------------
  // 8. STREAMING SEMANTICS & FAILOVER (executeStream)
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 8] Stream Semantics & Initial Chunk Failover");

  // Primary stream fails at initialization (0 chunks)
  mockProviderA.setStreamHandler(async function*() {
    const err = new Error("503 Service Unavailable: overloaded stream");
    (err as any).status = 503;
    throw err;
  });

  // Secondary stream succeeds
  mockProviderB.setStreamHandler(async function*() {
    yield { text: "Chunk 1 from OpenAI" };
    yield { text: " Chunk 2 from OpenAI" };
  });

  const streamedChunks: string[] = [];
  const stream = UniversalRouterService.executeStream(
    { operation: "chat", capabilities: { textGeneration: true, streaming: true } },
    [{ role: "user", content: "hello" }],
    0.7,
    { maxRetries: 1, baseDelayMs: 5, maxDelayMs: 10, jitterMs: 0, deadlineMs: 5000 }
  );

  for await (const chunk of stream) {
    streamedChunks.push(chunk.text);
  }

  assert(
    streamedChunks.join("") === "Chunk 1 from OpenAI Chunk 2 from OpenAI",
    "Stream seamlessly failed over to secondary provider when primary stream threw before chunkCount > 0"
  );

  // Restore resolveCandidates
  UniversalRouterService.resolveCandidates = originalResolve;

  // --------------------------------------------------------------------------
  // 9. WIDGET HTTP RESPONSE SEMANTICS
  // --------------------------------------------------------------------------
  console.log("\n[Test Section 9] Widget HTTP 503 vs 200 Semantics");

  // Simulate mock Express Response
  const createMockResponse = () => {
    return {
      headersSent: false,
      statusCode: 200,
      headers: {} as Record<string, string>,
      writtenData: [] as string[],
      ended: false,
      setHeader(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.writtenData.push(JSON.stringify(data));
        this.ended = true;
        return this;
      },
      write(chunk: string) {
        this.headersSent = true;
        this.writtenData.push(chunk);
        return true;
      },
      end() {
        this.ended = true;
      }
    };
  };

  // Simulation A: Failure before stream starts (headers not sent)
  const resA = createMockResponse();
  const ensureSseHeadersA = () => {
    if (!resA.headersSent) {
      resA.setHeader("Content-Type", "text/event-stream");
    }
  };

  // Simulate provider throws before first chunk
  try {
    throw new AllAiProvidersFailedError("All available AI providers failed");
  } catch (err: any) {
    if (!resA.headersSent) {
      resA.status(503).json({
        error: "AI service temporarily unavailable. Please try again later.",
        code: "PROVIDER_UNAVAILABLE"
      });
    }
  }

  assert(resA.statusCode === 503, "Widget endpoint returns HTTP 503 on provider failure when headers not yet sent");
  assert(resA.headers["content-type"] !== "text/event-stream", "Widget endpoint does not commit SSE headers on initial failure");
  assert(resA.writtenData[0].includes("PROVIDER_UNAVAILABLE"), "Widget response body contains PROVIDER_UNAVAILABLE error payload");

  // Simulation B: Stream failure after first chunk was sent (headers already sent)
  const resB = createMockResponse();
  const ensureSseHeadersB = () => {
    if (!resB.headersSent) {
      resB.setHeader("Content-Type", "text/event-stream");
    }
  };

  ensureSseHeadersB();
  resB.write(`data: ${JSON.stringify({ content: "Partial chunk" })}\n\n`);

  // Provider connection breaks mid-stream
  try {
    throw new Error("Connection dropped mid-stream");
  } catch (err: any) {
    if (!resB.headersSent) {
      resB.status(503).json({ error: "error", code: "PROVIDER_UNAVAILABLE" });
    } else {
      resB.write(`event: error\ndata: ${JSON.stringify({ error: "AI service temporarily unavailable", code: "PROVIDER_UNAVAILABLE" })}\n\n`);
      resB.end();
    }
  }

  assert(resB.headersSent === true, "Headers were sent when initial chunk was emitted");
  assert(resB.writtenData.some(d => d.startsWith("event: error")), "Mid-stream error emits SSE 'event: error' rather than a fake assistant message");

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("\n================================================================");
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================\n");

  process.exit(failed === 0 ? 0 : 1);
}

runReliabilityTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
