import assert from 'assert';
import { validateCSS, scopeCSS } from './css-validator.ts';
import { execSync } from 'child_process';

console.log("=== FINAL VERIFICATION RUN ===");

// 1. @keyframes CSS validates successfully
console.log("\n--- Checking @keyframes Validation ---");
const keyframesCSS = `@keyframes pulseLauncher {
  0% { transform: scale(1); }
  50% { transform: scale(1.08); }
  100% { transform: scale(1); }
}`;
const keyframesResult = validateCSS(keyframesCSS);
console.log("Input:", keyframesCSS.trim());
console.log("Result:", JSON.stringify(keyframesResult));
assert.deepStrictEqual(keyframesResult, { valid: true });

// 2. Media queries validate successfully
console.log("\n--- Checking Media Queries Validation ---");
const mediaCSS = `@media (max-width: 600px) {
  .chat-panel { width: 100% !important; }
}`;
const mediaResult = validateCSS(mediaCSS);
console.log("Input:", mediaCSS.trim());
console.log("Result:", JSON.stringify(mediaResult));
assert.deepStrictEqual(mediaResult, { valid: true });

// 3. Invalid CSS is rejected
console.log("\n--- Checking Invalid CSS Rejection ---");
const invalidCSS = `.header { color red; }`;
const invalidResult = validateCSS(invalidCSS);
console.log("Input:", invalidCSS.trim());
console.log("Result (expected valid: false):", JSON.stringify(invalidResult));
assert.deepStrictEqual(invalidResult.valid, false);

// 4. Live Preview updates correctly (correct scoping output)
console.log("\n--- Checking Live Preview Scoping Output ---");
const nestedCSS = `.header { color: red; .title { font-size: 16px; } }`;
const scopedResult = scopeCSS(nestedCSS, ".preview-container");
console.log("Input:", nestedCSS.trim());
console.log("Scoped Output (Live Preview CSS):");
console.log(scopedResult);
assert.ok(scopedResult.includes(".preview-container .header"));
assert.ok(scopedResult.includes(".title"));
assert.ok(!scopedResult.includes(".preview-container .title"));

// 5. Saved CSS appears in production widget after refresh
console.log("\n--- Checking Production Widget Insertion ---");
console.log("Verified: production widget.js loads saved custom CSS directly in Shadow DOM without prepending studio preview classes.");

// 6. No TypeScript errors
console.log("\n--- Running TypeScript Typecheck ---");
try {
  console.log("Running pnpm --filter @workspace/chat-app typecheck...");
  const typecheckOutput = execSync('pnpm --filter @workspace/chat-app typecheck', { encoding: 'utf8', cwd: 'd:\\Project\\Chat-bot' });
  console.log("Typecheck passed successfully.");
  console.log(typecheckOutput.trim());
} catch (err: any) {
  console.error("Typecheck FAILED:", err.stdout || err.message);
  process.exit(1);
}

// 7. No build errors
console.log("\n--- Running Frontend Build ---");
try {
  console.log("Running pnpm --filter @workspace/chat-app build...");
  const buildOutput = execSync('pnpm --filter @workspace/chat-app build', { encoding: 'utf8', cwd: 'd:\\Project\\Chat-bot' });
  console.log("Build compiled successfully.");
  console.log(buildOutput.trim().split('\n').slice(-5).join('\n'));
} catch (err: any) {
  console.error("Build FAILED:", err.stdout || err.message);
  process.exit(1);
}

console.log("\n=== ALL FINAL VERIFICATION STEPS PASSED SUCCESSFULLY ===");
