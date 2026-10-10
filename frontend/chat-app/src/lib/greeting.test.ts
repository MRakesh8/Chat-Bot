import assert from "node:assert";
import { getLocalGreeting } from "./greeting";

console.log("==================================================");
console.log("  RUNNING LOCAL GREETING BOUNDARY TESTS");
console.log("==================================================\n");

let passed = 0;
let failed = 0;

function check(testName: string, actual: string, expected: string) {
  if (actual === expected) {
    console.log(`  ✓ PASSED: ${testName} -> "${actual}"`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${testName} -> Expected "${expected}", got "${actual}"`);
    failed++;
  }
}

function makeDate(hours: number, minutes: number, seconds: number = 0): Date {
  const d = new Date(2026, 9, 10, hours, minutes, seconds);
  return d;
}

// 1. Morning tests (5:00 AM – 11:59 AM)
check("5:00:00 AM (Morning start boundary)", getLocalGreeting(makeDate(5, 0, 0)), "Good morning");
check("8:30:00 AM (Mid morning)", getLocalGreeting(makeDate(8, 30, 0)), "Good morning");
check("11:59:59 AM (Morning end boundary)", getLocalGreeting(makeDate(11, 59, 59)), "Good morning");

// 2. Afternoon tests (12:00 PM – 4:59 PM)
check("12:00:00 PM (Afternoon start boundary / Noon)", getLocalGreeting(makeDate(12, 0, 0)), "Good afternoon");
check("2:15:00 PM (Mid afternoon)", getLocalGreeting(makeDate(14, 15, 0)), "Good afternoon");
check("4:59:59 PM (Afternoon end boundary)", getLocalGreeting(makeDate(16, 59, 59)), "Good afternoon");

// 3. Evening tests (5:00 PM – 8:59 PM)
check("5:00:00 PM (Evening start boundary)", getLocalGreeting(makeDate(17, 0, 0)), "Good evening");
check("7:00:00 PM (Mid evening)", getLocalGreeting(makeDate(19, 0, 0)), "Good evening");
check("8:59:59 PM (Evening end boundary)", getLocalGreeting(makeDate(20, 59, 59)), "Good evening");

// 4. Night tests (9:00 PM – 4:59 AM)
check("9:00:00 PM (Night start boundary)", getLocalGreeting(makeDate(21, 0, 0)), "Good night");
check("11:59:00 PM (Late night)", getLocalGreeting(makeDate(23, 59, 0)), "Good night");
check("12:00:00 AM (Midnight boundary)", getLocalGreeting(makeDate(0, 0, 0)), "Good night");
check("2:30:00 AM (Deep night)", getLocalGreeting(makeDate(2, 30, 0)), "Good night");
check("4:59:59 AM (Night end boundary)", getLocalGreeting(makeDate(4, 59, 59)), "Good night");

// 5. Default argument test
const defaultGreeting = getLocalGreeting();
assert(
  ["Good morning", "Good afternoon", "Good evening", "Good night"].includes(defaultGreeting),
  "Default invocation with current system time produces a valid greeting"
);
console.log(`  ✓ PASSED: Default current time invocation -> "${defaultGreeting}"`);
passed++;

console.log("\n==================================================");
console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("==================================================\n");

if (failed > 0) {
  process.exit(1);
}
