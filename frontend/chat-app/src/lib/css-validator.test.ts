import assert from 'assert';
import { validateCSS, scopeCSS } from './css-validator.ts';

console.log("Running CSS Validator automated tests...");

// Test Case 1: Valid keyframes
const validKeyframes = `
@keyframes pulseLauncher {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}
`;
console.log("1. Testing valid keyframes validation...");
const resKeyframes = validateCSS(validKeyframes);
assert.deepStrictEqual(resKeyframes, { valid: true });

console.log("1. Testing valid keyframes scoping...");
const scopedKeyframes = scopeCSS(validKeyframes, ".preview-container");
assert.ok(scopedKeyframes.includes("@keyframes pulseLauncher {"));
assert.ok(scopedKeyframes.includes("  0% {"));
assert.ok(scopedKeyframes.includes("    transform: scale(1);"));
assert.ok(!scopedKeyframes.includes(".preview-container 0%"));

// Test Case 2: Valid media queries
const validMediaQuery = `
@media (max-width: 768px) {
  .chat-panel {
    width: 100% !important;
    border-radius: 0;
  }
}
`;
console.log("2. Testing valid media queries validation...");
const resMediaQuery = validateCSS(validMediaQuery);
assert.deepStrictEqual(resMediaQuery, { valid: true });

console.log("2. Testing valid media queries scoping...");
const scopedMediaQuery = scopeCSS(validMediaQuery, ".preview-container");
assert.ok(scopedMediaQuery.includes("@media (max-width: 768px)"));
assert.ok(scopedMediaQuery.includes(".preview-container .chat-panel {"));

// Test Case 3: CSS variables
const cssVariables = `
:host {
  --primary-color: #8b5cf6;
  --text-size: 14px;
}
.widget-wrapper {
  color: var(--primary-color);
  font-size: var(--text-size);
}
`;
console.log("3. Testing CSS variables validation...");
const resVariables = validateCSS(cssVariables);
assert.deepStrictEqual(resVariables, { valid: true });

console.log("3. Testing CSS variables scoping...");
const scopedVariables = scopeCSS(cssVariables, ".preview-container");
assert.ok(scopedVariables.includes(".preview-container {"));
assert.ok(scopedVariables.includes("  --primary-color: #8b5cf6;"));
assert.ok(scopedVariables.includes(".preview-container .widget-wrapper {"));

// Test Case 4: Invalid declarations
console.log("4. Testing invalid declarations...");
// Missing colon
assert.deepStrictEqual(validateCSS(".panel { color red; }").valid, false);
// Missing property name
assert.deepStrictEqual(validateCSS(".panel { : red; }").valid, false);
// Missing value
assert.deepStrictEqual(validateCSS(".panel { color: ; }").valid, false);

// Test Case 5: Missing braces
console.log("5. Testing missing/mismatched braces...");
// Missing closing brace
assert.deepStrictEqual(validateCSS(".panel { color: red;").valid, false);
// Missing opening brace
assert.deepStrictEqual(validateCSS(".panel color: red; }").valid, false);
// Unexpected closing brace
assert.deepStrictEqual(validateCSS(".panel { color: red; }}").valid, false);

console.log("All CSS Validator automated tests passed successfully!");
