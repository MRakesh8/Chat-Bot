import { evaluateActionRisk, generateActionConfirmationToken, verifyActionConfirmationToken } from "../src/security/agentSafety";
import { executeServerTool } from "../src/services/tool-execution";

async function runP0Tests() {
  console.log("=================================================");
  console.log("            P0 SECURITY & BUG TEST SUITE          ");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  // 1. HMAC Confirmation Token Scoping & Tampering Test
  console.log("[TEST 1] HMAC Confirmation Token Cryptography...");
  const tokenPayload = {
    userId: "user_a",
    projectId: "proj_a",
    sessionId: "sess_a",
    actionId: "action_1",
    actionType: "shopify_create_product",
    actionTarget: "shopify"
  };

  const { token, expiresAt } = generateActionConfirmationToken(tokenPayload);
  const isValid = verifyActionConfirmationToken(token, tokenPayload);
  const isUserTamperedValid = verifyActionConfirmationToken(token, { ...tokenPayload, userId: "user_b" });
  const isActionTamperedValid = verifyActionConfirmationToken(token, { ...tokenPayload, actionType: "shopify_delete_product" });

  if (isValid && !isUserTamperedValid && !isActionTamperedValid) {
    console.log("✅ PASS: HMAC token generation, verification, and contextual tampering rejection work correctly.");
    passed++;
  } else {
    console.error("❌ FAIL: Token verification error.");
    failed++;
  }

  // 2. Action Risk Level Classification Test
  console.log("[TEST 2] Server-Side Risk Level Classification...");
  const readRisk = evaluateActionRisk("shopify_get_products");
  const highRisk = evaluateActionRisk("shopify_create_product");
  const criticalRisk = evaluateActionRisk("shopify_delete_product");

  if (readRisk === "LOW" && highRisk === "HIGH" && criticalRisk === "CRITICAL") {
    console.log("✅ PASS: Action risk classification accurately categorizes LOW, HIGH, and CRITICAL risks.");
    passed++;
  } else {
    console.error(`❌ FAIL: Risk mismatch: read=${readRisk}, high=${highRisk}, critical=${criticalRisk}`);
    failed++;
  }

  // 3. Customer IDOR Parameter Guard Unit Assertion
  console.log("[TEST 3] Customer IDOR Parameter Validation...");
  const idorResult = await executeServerTool({
    projectId: "dummy_proj",
    actionName: "shopify_get_orders",
    input: { customerId: "spoofed_other_customer" }
  });

  if (!idorResult.success && idorResult.status === "FORBIDDEN" && idorResult.error?.includes("Customer IDOR violation")) {
    console.log("✅ PASS: Spoofed customerId parameter was rejected server-side with FORBIDDEN.");
    passed++;
  } else {
    console.error(`❌ FAIL: IDOR spoofing check failed. Status: ${idorResult.status}, Error: ${idorResult.error}`);
    failed++;
  }

  console.log("\n=================================================");
  console.log(`P0 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runP0Tests().catch(console.error);
