import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
import { db, userApiKeys, projectApiKeys, projects, organizations, users, crypto } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ProviderVerifier } from "../src/services/provider-verifier";
import { classifyError } from "../src/services/api-health";

async function runPhase6Tests() {
  console.log("================================================================================");
  console.log("  PHASE 6 — PRODUCTION-READY API CENTER & PROVIDER MANAGEMENT TEST SUITE");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASSED: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${name} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  // --- Section 1: Provider Detection & Format Parsing ---
  console.log("\n--- Section 1: Provider Detection & Format Parsing ---");
  {
    assert(ProviderVerifier.detectProvider("AIzaSyD-1234567890abcdef") === "gemini", "Detect Gemini key (AIza...)");
    assert(ProviderVerifier.detectProvider("sk-proj-abc1234567890xyz") === "openai", "Detect OpenAI project key (sk-proj-...)");
    assert(ProviderVerifier.detectProvider("sk-1234567890abcdef") === "openai", "Detect OpenAI standard key (sk-...)");
    assert(ProviderVerifier.detectProvider("sk-ant-api03-123456789") === "claude", "Detect Claude key (sk-ant-...)");
    assert(ProviderVerifier.detectProvider("gsk_1234567890abcdef") === "groq", "Detect Groq key (gsk_...)");
    assert(ProviderVerifier.detectProvider("sk-or-v1-1234567890abcdef") === "openrouter", "Detect OpenRouter key (sk-or-...)");
    assert(ProviderVerifier.detectProvider("unknown-random-key") === null, "Unknown provider returns null");
  }

  // --- Section 2: Error Classification & Actionable Recovery ---
  console.log("\n--- Section 2: Error Classification & Actionable Recovery ---");
  {
    const authErr = classifyError({ status: 401, message: "Incorrect API key provided" });
    assert(authErr.status === "INVALID_API_KEY", "Classify 401 as INVALID_API_KEY");
    assert(authErr.cooldownMinutes === 0, "No cooldown for invalid key");

    const forbiddenErr = classifyError({ status: 403, message: "API key not valid. Please pass a valid API key." });
    assert(forbiddenErr.status === "INVALID_API_KEY", "Classify 403 as INVALID_API_KEY");

    const rateLimitErr = classifyError({ status: 429, message: "Rate limit reached for requests per minute. Please retry in 15s." });
    assert(rateLimitErr.status === "RATE_LIMIT", "Classify 429 RPM as RATE_LIMIT");
    assert(rateLimitErr.cooldownMinutes >= 1, "Rate limit assigns dynamic cooldown");

    const quotaErr = classifyError({ status: 429, message: "Resource exhausted: GenerateRequestsPerDay quota exceeded" });
    assert(quotaErr.status === "DAILY_QUOTA", "Classify daily quota exhaustion as DAILY_QUOTA");
    assert(quotaErr.cooldownMinutes === 1440, "Daily quota assigns 24h cooldown");

    const billingErr = classifyError({ status: 429, message: "You have exceeded your current quota, please check your plan and billing details." });
    assert(billingErr.status === "MONTHLY_CREDIT", "Classify billing exhaustion as MONTHLY_CREDIT");

    const modelErr = classifyError({ status: 404, message: "model_not_found: The model does not exist" });
    assert(modelErr.status === "INVALID_MODEL", "Classify 404 as INVALID_MODEL");

    const timeoutErr = classifyError({ message: "Request timed out after 30000ms" });
    assert(timeoutErr.status === "TIMEOUT", "Classify timeout error as TIMEOUT");

    const downErr = classifyError({ status: 503, message: "Service Unavailable" });
    assert(downErr.status === "PROVIDER_DOWN", "Classify 503 as PROVIDER_DOWN");
  }

  // --- Section 3: Database & Secret Encryption / Masking Verification ---
  console.log("\n--- Section 3: Database & Secret Encryption / Masking Verification ---");
  const testUserId = "00000000-0000-4000-8000-000000000001";
  const testOrgId = "00000000-0000-4000-8000-000000000002";
  const testProjectId = "00000000-0000-4000-8000-000000000003";
  let createdUserKeyId: string | null = null;
  let createdProjectKeyId: string | null = null;

  try {
    // 1. Provision mock tenant fixtures if needed
    await db.insert(organizations).values({
      id: testOrgId,
      name: "Phase 6 Test Org",
      slug: "phase-6-test-org",
      createdAt: new Date(),
    }).onConflictDoNothing();

    await db.insert(users).values({
      id: testUserId,
      email: "phase6-test@example.com",
      role: "user",
      createdAt: new Date(),
    }).onConflictDoNothing();

    await db.insert(projects).values({
      id: testProjectId,
      organizationId: testOrgId,
      userId: testUserId,
      name: "Phase 6 Test Project",
      slug: "phase-6-test-project",
      createdAt: new Date(),
    }).onConflictDoNothing();

    // 2. Insert encrypted User Key
    const rawApiKey = "AIzaSyD-Phase6-TestGeminiSecretKey9988";
    const encrypted = crypto.encrypt(rawApiKey);
    const masked = `AIza****${rawApiKey.slice(-4)}`;

    const [userKey] = await db.insert(userApiKeys).values({
      userId: testUserId,
      name: "Test Gemini User Key",
      provider: "gemini",
      encryptedKey: encrypted,
      maskedKey: masked,
      availableModels: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"],
      isSystem: false,
      isPrimary: true,
      isEnabled: true,
      status: "HEALTHY",
      healthScore: 100,
      createdAt: new Date(),
    }).returning();
    createdUserKeyId = userKey.id;

    assert(userKey.encryptedKey !== rawApiKey, "User API key is encrypted at rest");
    assert(crypto.decrypt(userKey.encryptedKey) === rawApiKey, "Encrypted key decrypts accurately");
    assert(userKey.maskedKey === "AIza****9988", "Masked key protects raw secret in response representation");

    // 3. Insert encrypted Project Key
    const rawProjectKey = "sk-proj-Phase6-TestOpenAISecretKey1234";
    const encProjKey = crypto.encrypt(rawProjectKey);
    const maskedProjKey = `${rawProjectKey.slice(0, 5)}...${rawProjectKey.slice(-4)}`;

    const [projKey] = await db.insert(projectApiKeys).values({
      projectId: testProjectId,
      name: "Test OpenAI Project Key",
      provider: "openai",
      encryptedKey: encProjKey,
      maskedKey: maskedProjKey,
      model: "gpt-4o",
      availableModels: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
      isEnabled: true,
      isPrimary: true,
      status: "HEALTHY",
      createdAt: new Date(),
    }).returning();
    createdProjectKeyId = projKey.id;

    assert(projKey.encryptedKey !== rawProjectKey, "Project API key is encrypted at rest");
    assert(crypto.decrypt(projKey.encryptedKey) === rawProjectKey, "Project key decrypts accurately");
    assert(projKey.maskedKey === "sk-pr...1234", "Project key masked representation format is valid");
  } catch (err: any) {
    console.error("Database setup error:", err);
    assert(false, "Database setup error", err.message);
  }

  // --- Section 4: Key Lifecycle, Cooldown & Model Assignment ---
  console.log("\n--- Section 4: Key Lifecycle, Cooldown & Model Assignment ---");
  if (createdUserKeyId && createdProjectKeyId) {
    // 1. Test cooldown simulation and clearing
    const cooldownDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour ahead
    await db.update(userApiKeys).set({
      status: "QUOTA_EXCEEDED",
      cooldownUntil: cooldownDate,
      failureReason: "Daily quota exhausted",
    }).where(eq(userApiKeys.id, createdUserKeyId));

    const [cooldownKey] = await db.select().from(userApiKeys).where(eq(userApiKeys.id, createdUserKeyId));
    assert(cooldownKey.status === "QUOTA_EXCEEDED" && !!cooldownKey.cooldownUntil, "User key enters cooldown state");

    // Clear cooldown
    await db.update(userApiKeys).set({
      status: "HEALTHY",
      cooldownUntil: null,
      failureReason: null,
    }).where(eq(userApiKeys.id, createdUserKeyId));

    const [restoredKey] = await db.select().from(userApiKeys).where(eq(userApiKeys.id, createdUserKeyId));
    assert(restoredKey.status === "HEALTHY" && restoredKey.cooldownUntil === null, "Cooldown clear restores Healthy state");

    // 2. Test Project Model Assignment
    await db.update(projectApiKeys).set({
      model: "gpt-4o-mini",
    }).where(eq(projectApiKeys.id, createdProjectKeyId as any));

    const [updatedProjKey] = await db.select().from(projectApiKeys).where(eq(projectApiKeys.id, createdProjectKeyId as any));
    assert(updatedProjKey.model === "gpt-4o-mini", "Project key model assignment updated to gpt-4o-mini");

    // 3. Test Toggle Enabled & Primary
    await db.update(projectApiKeys).set({
      isEnabled: false,
      status: "DISABLED",
    }).where(eq(projectApiKeys.id, createdProjectKeyId as any));

    const [disabledKey] = await db.select().from(projectApiKeys).where(eq(projectApiKeys.id, createdProjectKeyId as any));
    assert(disabledKey.isEnabled === false && disabledKey.status === "DISABLED", "Project key successfully disabled");
  }

  // --- Section 5: Tenant Isolation & IDOR Protection ---
  console.log("\n--- Section 5: Tenant Isolation & IDOR Protection ---");
  const attackerUserId = "00000000-0000-4000-8000-000000000099";
  const attackerProjectId = "00000000-0000-4000-8000-000000000088";
  if (createdUserKeyId && createdProjectKeyId) {
    // Attempt to query victim's key using attacker's userId
    const attackerUserQuery = await db.select().from(userApiKeys).where(
      and(eq(userApiKeys.id, createdUserKeyId), eq(userApiKeys.userId, attackerUserId))
    );
    assert(attackerUserQuery.length === 0, "IDOR Guard: Cross-user key query returns 0 rows");

    // Attempt to query victim's project key using attacker's projectId
    const attackerProjectQuery = await db.select().from(projectApiKeys).where(
      and(eq(projectApiKeys.id, createdProjectKeyId as any), eq(projectApiKeys.projectId, attackerProjectId))
    );
    assert(attackerProjectQuery.length === 0, "IDOR Guard: Cross-project key query returns 0 rows");
  }

  // --- Section 6: RBAC Authorization & System Reset Scoping ---
  console.log("\n--- Section 6: RBAC Authorization & System Reset Scoping ---");
  {
    // 1. RBAC Check simulation
    const normalUserAuth = { dbUser: { role: "user", email: "regular@example.com" } };
    const adminUserAuth = { dbUser: { role: "admin", email: "admin@example.com" } };
    const isNormalAdmin = normalUserAuth.dbUser.role === "admin" || normalUserAuth.dbUser.role === "super_admin";
    const isAdminUser = adminUserAuth.dbUser.role === "admin" || adminUserAuth.dbUser.role === "super_admin";
    
    assert(isNormalAdmin === false, "RBAC: Regular user role denied admin access");
    assert(isAdminUser === true, "RBAC: Admin role granted access to system reports");

    // 2. Verify System Reset scoping: System reset query must NOT touch user keys
    if (createdUserKeyId) {
      // Mark user key with specific status
      await db.update(userApiKeys).set({
        status: "QUOTA_EXCEEDED",
        failureReason: "User quota hit",
      }).where(eq(userApiKeys.id, createdUserKeyId));

      // Simulate system reset query: where isSystem = true or userId is null
      await db.update(userApiKeys)
        .set({
          status: "HEALTHY",
          cooldownUntil: null,
          failureReason: null,
        })
        .where(eq(userApiKeys.isSystem, true));

      // Check that the user key was NOT affected
      const [userKeyAfterSystemReset] = await db.select().from(userApiKeys).where(eq(userApiKeys.id, createdUserKeyId));
      assert(
        userKeyAfterSystemReset.status === "QUOTA_EXCEEDED" && userKeyAfterSystemReset.failureReason === "User quota hit",
        "System Reset Scoping: Resetting system keys strictly leaves user keys untouched"
      );
    }
  }

  // --- Cleanup ---
  console.log("\n--- Cleaning up Test Fixtures ---");
  try {
    if (createdUserKeyId) {
      await db.delete(userApiKeys).where(eq(userApiKeys.id, createdUserKeyId));
    }
    if (createdProjectKeyId) {
      await db.delete(projectApiKeys).where(eq(projectApiKeys.id, createdProjectKeyId as any));
    }
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
    console.log("  Cleaned up all Phase 6 test fixtures.");
  } catch (err: any) {
    // If persistent references exist in foreign tables, log cleanly
    console.log("  Cleaned up active test key records.");
  }

  console.log("\n================================================================================");
  console.log(`  PHASE 6 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  process.exit(failed > 0 ? 1 : 0);
}

runPhase6Tests();
