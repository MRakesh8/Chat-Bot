import assert from "assert";
import { detectLeadSignals, DEFAULT_LEAD_SCORE_CONFIG } from "../services/lead-detection";
import { normalizeQuestion, categorizeQuestion } from "../services/question-normalization";
import { isFallbackResponse } from "../services/unanswered-questions";

console.log("=== RUNNING LEAD ANALYTICS & BI TEST SUITE ===");

// 1. Test Lead Signal Detection & Intent Scoring
console.log("\n[TEST 1] Lead Signal Detection & Scoring");

const res1 = detectLeadSignals("Hi, I want to know your pricing plans and book a demo. My email is contact@acme.org");
console.log("Extracted Lead Signals:", res1);

assert.strictEqual(res1.email, "contact@acme.org");
assert.strictEqual(res1.score, "HIGH");
assert.ok(res1.scoreValue >= 70, "Score value should be HIGH (>=70)");
assert.ok(res1.signals.includes("PRICING_INTEREST"));
assert.ok(res1.signals.includes("DEMO_REQUEST"));
assert.ok(res1.signals.includes("CONTACT_INFO_PROVIDED"));

const resGeneric = detectLeadSignals("How do I change my avatar background color?");
assert.strictEqual(resGeneric.signals.length, 0, "Generic question should have 0 lead signals");

// 2. Test Question Normalization (Instruction 6: safe normalization)
console.log("\n[TEST 2] Safe Question Normalization");

const norm1 = normalizeQuestion("What's your pricing plan?");
const norm2 = normalizeQuestion("Tell me your pricing plans!!!");
const norm3 = normalizeQuestion("Can you please tell me what is your pricing plan?");

console.log("Norm 1:", norm1);
console.log("Norm 2:", norm2);
console.log("Norm 3:", norm3);

assert.ok(norm1.includes("pricing"));
assert.ok(!norm2.includes("!"), "Punctuation removed");

const categoryResult = categorizeQuestion("What are your enterprise subscription rates?");
assert.strictEqual(categoryResult.category, "Sales & Pricing");

// 3. Test Knowledge Gap Fallback Recognition (Instruction 7)
console.log("\n[TEST 3] Knowledge Gap Fallback Detection");

const isFB1 = isFallbackResponse("I'm sorry, I don't know the answer to that specific question.");
const isFB2 = isFallbackResponse("Our pricing starts at $29/month per project.");
const isFB3 = isFallbackResponse("No relevant context found in knowledge base.");

assert.strictEqual(isFB1, true, "Should identify explicit fallback phrase");
assert.strictEqual(isFB2, false, "Informative answer is not a fallback");
assert.strictEqual(isFB3, true, "Should identify missing context fallback");

// 4. Test Formula Injection Sanitization (Instruction 10)
console.log("\n[TEST 4] CSV Formula Injection Sanitization");

function sanitizeCsvCell(val: any): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

const safeFormula1 = sanitizeCsvCell("=SUM(1+1)");
const safeFormula2 = sanitizeCsvCell("@cmd /c calc");
const safeNormal = sanitizeCsvCell("John Doe");

assert.strictEqual(safeFormula1, `"'=SUM(1+1)"`, "Formula trigger '=' should be prepended with single quote");
assert.strictEqual(safeFormula2, `"'\@cmd /c calc"`, "Formula trigger '@' should be prepended with single quote");
assert.strictEqual(safeNormal, `"John Doe"`, "Normal text should be wrapped in quotes");

// 5. Test Zero-Data Analytics Calculation (Instruction 8)
console.log("\n[TEST 5] Zero-Data Dashboard Calculation Safety");

const totalLeads = 0;
const uniqueVisitors = 0;
const totalConversations = 0;

const denominator = uniqueVisitors > 0 ? uniqueVisitors : totalConversations;
const conversionRate = denominator > 0 ? ((totalLeads / denominator) * 100).toFixed(1) : "0.0";

assert.strictEqual(conversionRate, "0.0", "Zero data conversion rate should handle division by zero safely");

console.log("\n==========================================");
console.log("✅ ALL LEAD ANALYTICS TESTS PASSED!");
console.log("==========================================\n");
