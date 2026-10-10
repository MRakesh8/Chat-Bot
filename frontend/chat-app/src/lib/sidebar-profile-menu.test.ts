import assert from "node:assert";

console.log("==================================================");
console.log("  RUNNING SIDEBAR PROFILE MENU CLEANUP TESTS");
console.log("==================================================\n");

let passed = 0;
let failed = 0;

function check(testName: string, actual: any, expected: any) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ✓ PASSED: ${testName} -> ${JSON.stringify(actual)}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${testName} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// Function modeling profile dropdown menu items renderer
export function getSidebarProfileMenuItems(role?: string): string[] {
  const items: string[] = [];
  if (role === "super_admin") {
    items.push("Admin Console");
  }
  items.push("Sign Out");
  return items;
}

// 1. Menu items for standard user
const standardItems = getSidebarProfileMenuItems("user");
check("Standard user menu does not include Profile & Account", standardItems.includes("Profile & Account"), false);
check("Standard user menu does not include Billing & Subscription", standardItems.includes("Billing & Subscription"), false);
check("Standard user menu does not include Workspace Settings", standardItems.includes("Workspace Settings"), false);
check("Standard user menu includes Sign Out", standardItems.includes("Sign Out"), true);
check("Standard user menu does not include Admin Console", standardItems.includes("Admin Console"), false);

// 2. Menu items for super_admin user
const adminItems = getSidebarProfileMenuItems("super_admin");
check("Super Admin menu includes Admin Console", adminItems.includes("Admin Console"), true);
check("Super Admin menu includes Sign Out", adminItems.includes("Sign Out"), true);

console.log(`\n--------------------------------------------------`);
console.log(`  SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log(`--------------------------------------------------\n`);

if (failed > 0) {
  process.exit(1);
}
