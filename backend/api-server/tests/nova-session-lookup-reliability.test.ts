import { classifyProviderError } from "../src/security/errorResponse";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: unknown): boolean {
  return typeof id === "string" && UUID_REGEX.test(id);
}

async function runTests() {
  console.log("================================================================================");
  console.log("🧪 TESTING: NOVA SESSION LOOKUP & ERROR CLASSIFICATION RELIABILITY");
  console.log("================================================================================");

  // Test 1: UUID Validator correctly rejects nova-ai-session format
  console.log("\n[TEST 1] UUID Validation...");
  const validUuid = "383bd8d2-b7f8-4fac-8746-e18e765f9f96";
  const invalidSession = "nova-ai-session-1793278846841";
  const invalidRandom = "not-a-uuid";

  if (!isValidUuid(validUuid)) {
    throw new Error(`Expected ${validUuid} to be valid UUID`);
  }
  if (isValidUuid(invalidSession)) {
    throw new Error(`Expected ${invalidSession} to NOT be valid UUID`);
  }
  if (isValidUuid(invalidRandom)) {
    throw new Error(`Expected ${invalidRandom} to NOT be valid UUID`);
  }
  console.log("✅ TEST 1 PASSED: UUID validation correctly differentiates valid UUID from client session IDs.");

  // Test 2: Error Classification - generic DB error or 500 without provider indicators
  console.log("\n[TEST 2] Error Classification for DB/Internal errors...");
  const dbSyntaxError = new Error('invalid input syntax for type uuid: "nova-ai-session-1793278846841"');
  const classifiedDbErr = classifyProviderError(dbSyntaxError);

  if (classifiedDbErr.type === "PROVIDER_UNAVAILABLE") {
    throw new Error(`DB syntax error was falsely classified as PROVIDER_UNAVAILABLE! Got: ${classifiedDbErr.type}`);
  }
  if (classifiedDbErr.type !== "UNKNOWN_PROVIDER_ERROR") {
    throw new Error(`Expected UNKNOWN_PROVIDER_ERROR for internal error, got: ${classifiedDbErr.type}`);
  }
  if (classifiedDbErr.retryable) {
    throw new Error(`Internal DB error should NOT be retryable!`);
  }
  console.log("✅ TEST 2 PASSED: DB syntax error correctly classified as UNKNOWN_PROVIDER_ERROR (not PROVIDER_UNAVAILABLE).");

  // Test 3: Real Provider Outages are still properly classified
  console.log("\n[TEST 3] Error Classification for Real AI Provider errors...");
  const real503Error = { status: 503, message: "The model is overloaded. Please try again later." };
  const classified503 = classifyProviderError(real503Error);
  if (classified503.type !== "PROVIDER_UNAVAILABLE" || !classified503.retryable) {
    throw new Error(`Real 503 should be PROVIDER_UNAVAILABLE & retryable! Got: ${JSON.stringify(classified503)}`);
  }

  const realQuotaError = { status: 429, message: "Resource exhausted: Quota exceeded" };
  const classifiedQuota = classifyProviderError(realQuotaError);
  if (classifiedQuota.type !== "QUOTA_EXCEEDED") {
    throw new Error(`Real 429 should be QUOTA_EXCEEDED! Got: ${JSON.stringify(classifiedQuota)}`);
  }
  console.log("✅ TEST 3 PASSED: Real provider outages (503 / 429) remain classified accurately.");

  console.log("\n================================================================================");
  console.log("🏁 ALL SESSION LOOKUP & ERROR CLASSIFICATION TESTS PASSED 100%!");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
