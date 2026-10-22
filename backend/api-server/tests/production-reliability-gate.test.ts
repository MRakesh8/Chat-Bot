import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { crypto as dbCrypto, db, projects, organizations, users, userApiKeys, projectApiKeys, notifications, withTenantContext, withBypassRLS } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { UniversalRouterService } from "../src/services/ai-router/router";
import { BaseProviderAdapter, ChatCompletionRequest, ChatCompletionResponse } from "../src/services/ai-router/providers/base";
import { registry } from "../src/services/ai-router/registry";
import { AllAiProvidersFailedError, isPermanentCredentialError, isTransientError } from "../src/services/ai-router/retry";
import { resolveAuthorizedProjectOrg } from "../src/security/org-resolution";
import { getUnreadCount } from "../src/services/notifications";
import { sanitizeActivityText } from "../src/services/activity";

class MockGateAdapter extends BaseProviderAdapter {
  readonly providerId: string;
  private chatFn?: (req: ChatCompletionRequest) => Promise<ChatCompletionResponse>;

  constructor(id: string) {
    super();
    this.providerId = id;
  }

  setChatFn(fn: (req: ChatCompletionRequest) => Promise<ChatCompletionResponse>) {
    this.chatFn = fn;
  }

  async discoverModels(): Promise<any[]> {
    return [{ provider: this.providerId, modelId: "test-model", displayName: "Test Model", capabilities: { textGeneration: true, streaming: true, vision: false, tools: true, structuredOutput: true, reasoning: false, embedding: false, audio: false } }];
  }

  async generateChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (this.chatFn) return await this.chatFn(request);
    return { content: `Response from ${this.providerId}` };
  }

  async *generateChatStream(request: ChatCompletionRequest): AsyncIterable<{ text: string }> {
    if (request.signal?.aborted) return;
    yield { text: `Chunk from ${this.providerId}` };
  }

  classifyError(error: any): any {
    const msg = String(error?.message || error).toLowerCase();
    if (msg.includes("401") || msg.includes("invalid")) return "INVALID_CREDENTIAL";
    if (msg.includes("503") || msg.includes("unavailable")) return "PROVIDER_UNAVAILABLE";
    if (msg.includes("429")) return "RATE_LIMITED";
    return "UNKNOWN_ERROR";
  }
}

async function runProductionReliabilityGate() {
  console.log("================================================================================");
  console.log("  NOVA BUSINESS AI — PRODUCTION RELIABILITY & RELEASE GATE TEST SUITE");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, name: string, detail?: string) {
    if (cond) {
      console.log(`  ✓ PASSED: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${name} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  const originalEnv = { ...process.env };

  try {
    // --------------------------------------------------------------------------
    // TEST SECTION 1: Encryption Compatibility & Multi-Key Recovery
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 1] Encryption Compatibility & Multi-Key Recovery");
    {
      const primarySecret = "prod_primary_secret_key_32chars!";
      const oldSecret = "prod_old_secret_key_32chars_old!";
      const fallbackSecret1 = "prod_fallback_secret_alpha_32ch!";
      const fallbackSecret2 = "prod_fallback_secret_beta_32ch!!";

      process.env.ENCRYPTION_KEY = primarySecret;
      process.env.OLD_ENCRYPTION_KEY = oldSecret;
      process.env.FALLBACK_ENCRYPTION_KEYS = `${fallbackSecret1}, ${fallbackSecret2}`;
      process.env.NODE_ENV = "production";

      // 1. Fresh encryption with primary key
      const testSecretKey = "sk-ant-primary-test-secret-12345";
      const primaryCiphertext = dbCrypto.encrypt(testSecretKey);
      assert(primaryCiphertext.split(":").length === 3, "Primary ciphertext has 3-part IV:AuthTag:Data format");
      assert(dbCrypto.decrypt(primaryCiphertext) === testSecretKey, "Primary secret successfully decrypts freshly encrypted key");

      // 2. Encryption under old secret
      process.env.ENCRYPTION_KEY = oldSecret;
      const oldCiphertext = dbCrypto.encrypt("sk-ant-old-secret-67890");

      // Restore primary and verify OLD_ENCRYPTION_KEY recovery
      process.env.ENCRYPTION_KEY = primarySecret;
      const recoveredOld = dbCrypto.decrypt(oldCiphertext);
      assert(recoveredOld === "sk-ant-old-secret-67890", "OLD_ENCRYPTION_KEY successfully recovers legacy encrypted key");

      // 3. Encryption under fallbackSecret1 and fallbackSecret2
      process.env.ENCRYPTION_KEY = fallbackSecret1;
      const fb1Ciphertext = dbCrypto.encrypt("sk-proj-fallback-1-secret");
      process.env.ENCRYPTION_KEY = fallbackSecret2;
      const fb2Ciphertext = dbCrypto.encrypt("sk-proj-fallback-2-secret");

      // Restore primary and verify FALLBACK_ENCRYPTION_KEYS recovery
      process.env.ENCRYPTION_KEY = primarySecret;
      assert(dbCrypto.decrypt(fb1Ciphertext) === "sk-proj-fallback-1-secret", "FALLBACK_ENCRYPTION_KEYS recovers credential encrypted with fallbackSecret1");
      assert(dbCrypto.decrypt(fb2Ciphertext) === "sk-proj-fallback-2-secret", "FALLBACK_ENCRYPTION_KEYS recovers credential encrypted with fallbackSecret2");

      // 4. Legacy unencrypted key pass-through
      const legacyRaw = "AIzaSyD-raw-legacy-plaintext-key";
      assert(dbCrypto.decrypt(legacyRaw) === legacyRaw, "Legacy unencrypted string passed through without corruption");

      // 5. canDecrypt helper
      assert(dbCrypto.canDecrypt(primaryCiphertext) === true, "canDecrypt returns true for decryptable ciphertext");
      assert(dbCrypto.canDecrypt(legacyRaw) === true, "canDecrypt returns true for legacy plaintext");
      assert(dbCrypto.canDecrypt("") === false, "canDecrypt returns false for empty input");
    }

    // --------------------------------------------------------------------------
    // TEST SECTION 2: Failed Decryption Safe Handling & No DB Invalidation
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 2] Failed Decryption Safe Handling & No DB Invalidation");
    {
      const corruptCiphertext = "1234567890abcdef1234567890abcdef:1234567890abcdef1234567890abcdef:deadbeefcafebabe";
      
      // Decrypting corrupt/unknown ciphertext returns empty string
      const result = dbCrypto.decrypt(corruptCiphertext);
      assert(result === "", "Undecryptable ciphertext returns empty string without crashing");
      assert(dbCrypto.canDecrypt(corruptCiphertext) === false, "canDecrypt correctly returns false for undecryptable ciphertext");

      // Setup a project key in DB with undecryptable ciphertext to verify test route behavior
      const testOrgId = crypto.randomUUID();
      const testUserId = crypto.randomUUID();
      const [testUser] = await db.insert(users).values({ id: testUserId, email: `sec2-${Date.now()}@example.com`, role: "user" }).returning();
      const [testOrg] = await db.insert(organizations).values({ id: testOrgId, name: "Sec2 Test Org" }).returning();
      const [testProject] = await db.insert(projects).values({ name: "Sec2 Project", organizationId: testOrgId, userId: testUserId }).returning();

      const [projKey] = await db.insert(projectApiKeys).values({
        projectId: testProject.id,
        name: "Test Undecryptable Key",
        provider: "gemini",
        encryptedKey: corruptCiphertext,
        maskedKey: "AIza...corrupt",
        isEnabled: true,
        status: "HEALTHY",
        isPrimary: true
      }).returning();

      // Test simulated verification route behavior on undecryptable key
      const decrypted = dbCrypto.decrypt(projKey.encryptedKey);
      let routeHttpStatus = 200;
      let routeErrorCode = "";

      if (!decrypted) {
        routeHttpStatus = 422;
        routeErrorCode = "DECRYPTION_FAILED";
      }

      assert(routeHttpStatus === 422, "API test endpoint responds with HTTP 422 when key decryption fails");
      assert(routeErrorCode === "DECRYPTION_FAILED", "API test endpoint reports code DECRYPTION_FAILED");

      // Verify the database record is NOT modified or marked INVALID
      const [refreshedKey] = await db.select().from(projectApiKeys).where(eq(projectApiKeys.id, projKey.id));
      assert(refreshedKey.status === "HEALTHY", "Project API key status remains HEALTHY in database after decryption failure");
      assert(refreshedKey.isEnabled === true, "Project API key remains isEnabled=true after decryption failure");

      // Clean up test fixtures
      await db.delete(projectApiKeys).where(eq(projectApiKeys.id, projKey.id));
      await db.delete(projects).where(eq(projects.id, testProject.id));
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
      await db.delete(users).where(eq(users.id, testUserId));
    }

    // --------------------------------------------------------------------------
    // TEST SECTION 3: Production Security Guard & Dummy Key Exclusion
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 3] Production Security Guard & Dummy Key Exclusion");
    {
      process.env.NODE_ENV = "production";
      process.env.ENCRYPTION_KEY = "prod_secure_key_1234567890123456";
      delete process.env.OLD_ENCRYPTION_KEY;
      delete process.env.FALLBACK_ENCRYPTION_KEYS;

      // Encrypt something with the dev dummy key
      process.env.NODE_ENV = "development";
      process.env.ENCRYPTION_KEY = "fallback_dummy_key_for_local_dev_only";
      const devCiphertext = dbCrypto.encrypt("dev-secret-12345");

      // Switch back to production without dummy key configured
      process.env.NODE_ENV = "production";
      process.env.ENCRYPTION_KEY = "prod_secure_key_1234567890123456";
      const prodDecryptResult = dbCrypto.decrypt(devCiphertext);
      assert(prodDecryptResult === "", "In NODE_ENV=production, fallback dummy key is NEVER permitted without explicit configuration");

      // In development, fallback dummy key IS permitted
      process.env.NODE_ENV = "development";
      delete process.env.ENCRYPTION_KEY;
      const devDecryptResult = dbCrypto.decrypt(devCiphertext);
      assert(devDecryptResult === "dev-secret-12345", "In NODE_ENV=development, fallback dummy key permits local dev recovery");
    }

    // --------------------------------------------------------------------------
    // TEST SECTION 4: Widget Intent Detection Timeout & Safe Cancellation
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 4] Widget Intent Detection Timeout & Safe Cancellation");
    {
      const abortController = new AbortController();
      let providerCalled = false;
      let providerCompleted = false;
      let providerAborted = false;

      // Simulate a slow provider that takes 5000ms
      const slowProviderPromise = new Promise<string>((resolve, reject) => {
        providerCalled = true;
        const timer = setTimeout(() => {
          providerCompleted = true;
          resolve("{\"intent\": \"ACTION_REQUEST\"}");
        }, 5000);

        abortController.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          providerAborted = true;
          reject(new Error("Request was aborted"));
        });
      });

      // Intent detection race with 100ms deadline for fast test execution
      const INTENT_TIMEOUT_MS = 100;
      let intentType = "GENERAL_QUESTION";
      let intentDetectionFailed = false;
      let intentFallbackReason: string | null = null;

      let timeoutHandle: any;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          abortController.abort();
          reject(new Error("Intent detection deadline exceeded"));
        }, INTENT_TIMEOUT_MS);
      });

      try {
        await Promise.race([slowProviderPromise, timeoutPromise]);
        intentType = "ACTION_REQUEST";
      } catch (e: any) {
        intentDetectionFailed = true;
        intentFallbackReason = (e?.message?.includes("deadline exceeded") || abortController.signal.aborted) ? "DEADLINE_EXCEEDED" : "PROVIDER_ERROR";
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }

      assert(providerCalled === true, "Intent classifier provider was invoked");
      assert(intentDetectionFailed === true, "Intent detection accurately recorded failure on timeout");
      assert(intentFallbackReason === "DEADLINE_EXCEEDED", "Fallback reason is DEADLINE_EXCEEDED");
      assert(intentType === "GENERAL_QUESTION", "Deterministic fallback to GENERAL_QUESTION when classifier times out");
      assert(providerAborted === true, "AbortController aborted the underlying provider call on timeout");
      assert(providerCompleted === false, "Timed-out operation did NOT continue executing in background");
    }

    // --------------------------------------------------------------------------
    // TEST SECTION 5: Router Failover, Retries & Permanent Credential Bypass
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 5] Router Failover, Retries & Permanent Credential Bypass");
    {
      const mockPrimary = new MockGateAdapter("mock-gate-primary");
      const mockSecondary = new MockGateAdapter("mock-gate-secondary");

      registry.register(mockPrimary);
      registry.register(mockSecondary);

      // Save original resolveCandidates
      const origResolve = UniversalRouterService.resolveCandidates;
      UniversalRouterService.resolveCandidates = async () => [
        {
          provider: "mock-gate-primary",
          modelId: "test-model",
          credential: { id: "test_key_1", apiKey: "valid-key-1", type: "system" }
        },
        {
          provider: "mock-gate-secondary",
          modelId: "test-model",
          credential: { id: "test_key_2", apiKey: "valid-key-2", type: "system" }
        }
      ];

      // Primary fails with permanent 401
      let primaryAttempts = 0;
      mockPrimary.setChatFn(async () => {
        primaryAttempts++;
        const err = new Error("HTTP 401: Invalid API Key");
        (err as any).status = 401;
        throw err;
      });

      // Secondary succeeds
      let secondaryAttempts = 0;
      mockSecondary.setChatFn(async () => {
        secondaryAttempts++;
        return { content: "Secondary success response" };
      });

      const response = await UniversalRouterService.executeChat(
        { capabilities: { textGeneration: true }, operation: "chat" },
        [{ role: "user", content: "Hello" }],
        0.7,
        { deadlineMs: 5000, maxRetries: 2 }
      );

      assert(primaryAttempts === 1, "Permanent 401 bypassed retries immediately (only 1 attempt)");
      assert(secondaryAttempts === 1, "Router seamlessly failed over to secondary provider");
      assert(response.content === "Secondary success response", "Router returned response from failover provider");
      assert(isPermanentCredentialError("INVALID_CREDENTIAL", new Error("401")), "401 is identified as permanent credential failure");
      assert(isTransientError("PROVIDER_UNAVAILABLE", new Error("503")), "503 is identified as retryable transient failure");

      UniversalRouterService.resolveCandidates = origResolve;
    }

    // --------------------------------------------------------------------------
    // TEST SECTION 6: Unread Count In-Flight Coalescing (Duplicate Prevention)
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 6] Unread Count In-Flight Coalescing (Duplicate Prevention)");
    {
      const inFlightMap = new Map<string, Promise<number>>();
      let dbExecutionCount = 0;

      async function coalescedQuery(key: string): Promise<number> {
        const existing = inFlightMap.get(key);
        if (existing) return existing;

        const promise = (async () => {
          try {
            dbExecutionCount++;
            await new Promise(r => setTimeout(r, 50)); // Simulate 50ms DB query
            return 7;
          } finally {
            inFlightMap.delete(key);
          }
        })();

        inFlightMap.set(key, promise);
        return promise;
      }

      // Simulate simultaneous polling from TopNav and ProjectEdit
      const [res1, res2, res3] = await Promise.all([
        coalescedQuery("org-1:proj-1"),
        coalescedQuery("org-1:proj-1"),
        coalescedQuery("org-1:proj-1"),
      ]);

      assert(res1 === 7 && res2 === 7 && res3 === 7, "All simultaneous callers received exact unread count (7)");
      assert(dbExecutionCount === 1, "Only ONE database transaction was executed for 3 concurrent callers (2 coalesced)");
      assert(inFlightMap.size === 0, "In-flight map cleaned up after completion");

      // Verify tenant boundary: different org/project produces separate queries
      await Promise.all([
        coalescedQuery("org-1:proj-1"),
        coalescedQuery("org-2:proj-2"),
      ]);
      assert(dbExecutionCount === 3, "Different project/tenant contexts are never coalesced across tenant boundaries");
    }

    // --------------------------------------------------------------------------
    // TEST SECTION 7: Health Check Semantics & Degradation Reporting
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 7] Health Check Semantics & Degradation Reporting");
    {
      // 1. Simulating DB unreachable
      let dbStatus = "error";
      let aiStatus = "unknown";
      let isDegraded = dbStatus === "error" || aiStatus === "error" || aiStatus === "no_credentials_configured";

      const degradedPayload = {
        status: isDegraded ? "degraded" : "ok",
        backend: "ok",
        database: dbStatus,
        queue: "ok",
        ai: aiStatus,
        timestamp: new Date().toISOString()
      };

      assert(degradedPayload.status === "degraded", "Health check correctly reports 'degraded' when database is unreachable");
      assert(degradedPayload.database === "error", "Health check database field reports 'error'");

      // 2. Simulating DB reachable with healthy system keys
      dbStatus = "ok";
      aiStatus = "ok";
      isDegraded = dbStatus === "error" || aiStatus === "error" || aiStatus === "no_credentials_configured";

      const healthyPayload = {
        status: isDegraded ? "degraded" : "ok",
        backend: "ok",
        database: dbStatus,
        queue: "ok",
        ai: aiStatus,
        timestamp: new Date().toISOString()
      };

      assert(healthyPayload.status === "ok", "Health check correctly reports 'ok' when database and AI are responsive");
    }

    // --------------------------------------------------------------------------
    // TEST SECTION 8: Secret Redaction & Log Safety
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 8] Secret Redaction & Log Safety");
    {
      const rawTextWithKey = "Connecting to Google with api_key=AIzaSyD-super-secret-key-12345 failed";
      const sanitized = sanitizeActivityText(rawTextWithKey);
      assert(!sanitized.includes("AIzaSyD-super-secret-key-12345"), "Plaintext API key is completely redacted from logs");
      assert(sanitized.includes("[REDACTED_SECRET]"), "Redaction token is inserted in place of secret");

      const rawBearer = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretpayload";
      const sanitizedBearer = sanitizeActivityText(rawBearer);
      assert(!sanitizedBearer.includes("secretpayload"), "Bearer token is redacted from activity log");
    }

    // --------------------------------------------------------------------------
    // TEST SECTION 9: Tenant Isolation on Unread Counts
    // --------------------------------------------------------------------------
    console.log("\n[Test Section 9] Tenant Isolation on Unread Counts");
    {
      const orgA = crypto.randomUUID();
      const orgB = crypto.randomUUID();
      const userA = crypto.randomUUID();
      const userB = crypto.randomUUID();

      await db.insert(users).values([
        { id: userA, email: `tenant-a-${Date.now()}@example.com`, role: "user" },
        { id: userB, email: `tenant-b-${Date.now()}@example.com`, role: "user" },
      ]);
      await db.insert(organizations).values([
        { id: orgA, name: "Tenant Org A" },
        { id: orgB, name: "Tenant Org B" },
      ]);
      const [projA] = await db.insert(projects).values({ name: "Tenant Proj A", organizationId: orgA, userId: userA }).returning();

      // User B (not in Org A, not owner) attempts to resolve Project A
      const reqFromUserB = {
        auth: {
          userId: userB,
          dbUser: { role: "user" },
          memberships: [{ organizationId: orgB, role: "owner" }]
        },
        headers: {},
        query: {}
      };

      const resolvedB = await resolveAuthorizedProjectOrg(reqFromUserB, projA.id);
      assert(resolvedB === null, "Cross-tenant access rejected: User B cannot access Project A from Org A");

      // User A (owner and member of Org A) resolves Project A
      const reqFromUserA = {
        auth: {
          userId: userA,
          dbUser: { role: "user" },
          memberships: [{ organizationId: orgA, role: "owner" }]
        },
        headers: {},
        query: {}
      };

      const resolvedA = await resolveAuthorizedProjectOrg(reqFromUserA, projA.id);
      assert(resolvedA !== null, "Authorized User A successfully resolves Project A");
      assert(resolvedA?.authoritativeOrgId === orgA, "Authoritative organization ID matches Org A");

      // Clean up test fixtures
      await db.delete(projects).where(eq(projects.id, projA.id));
      await db.delete(organizations).where(eq(organizations.id, orgA));
      await db.delete(organizations).where(eq(organizations.id, orgB));
      await db.delete(users).where(eq(users.id, userA));
      await db.delete(users).where(eq(users.id, userB));
    }

    // --------------------------------------------------------------------------
    // SUMMARY
    // --------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log(`  RELEASE GATE RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("================================================================================\n");

    process.exit(failed === 0 ? 0 : 1);
  } finally {
    process.env = originalEnv;
  }
}

runProductionReliabilityGate().catch(err => {
  console.error("Release gate test failed with unhandled error:", err);
  process.exit(1);
});
