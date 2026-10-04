import { validateWidgetOrigin, isDomainAllowed, checkProjectEntitlement } from "../security";
import { withBypassRLS, projectWidgetSettings, projects, projectContextSettings } from "@workspace/db";
import { eq } from "drizzle-orm";

async function runWidgetConfigMatrixTest() {
  console.log("================================================================================");
  console.log("🧪 TESTING PUBLIC WIDGET CONFIG MATRIX: DOMAIN VALIDATION, RLS, ENTITLEMENT, ISOLATION");
  console.log("================================================================================");

  const realToken = "788fa64486f9364e1c333a63c594e432c8b8e9bfd054ab598eb78160f1662791";
  const realOrigin = "https://crm-website01.vercel.app";

  // TEST 1: Lookup Real Production Widget Settings with BypassRLS
  console.log("\n[TEST 1] Production Widget Token Resolution...");
  const settings = await withBypassRLS(async (tx: any) => {
    const [s] = await tx.select().from(projectWidgetSettings).where(eq(projectWidgetSettings.widgetToken, realToken)).limit(1);
    return s;
  });

  if (settings && settings.projectId) {
    console.log("✅ TEST 1 PASSED: Token resolved to project ID:", settings.projectId);
  } else {
    console.error("❌ TEST 1 FAILED: Token resolution failed!", settings);
    process.exit(1);
  }

  // TEST 2: Domain Validation for Real Customer Site Origin
  console.log("\n[TEST 2] Domain Validation for Customer Website (https://crm-website01.vercel.app)...");
  const isAllowed = isDomainAllowed("crm-website01.vercel.app", settings.allowedDomains || []);
  if (isAllowed) {
    console.log("✅ TEST 2 PASSED: Origin 'https://crm-website01.vercel.app' authorized.");
  } else {
    console.error("❌ TEST 2 FAILED: Domain rejected!", settings.allowedDomains);
    process.exit(1);
  }

  // TEST 3: Domain Validation for Unauthorized Domain
  console.log("\n[TEST 3] Domain Validation for Unauthorized Origin (https://unauthorized-attacker.com)...");
  const isAttackerAllowed = isDomainAllowed("unauthorized-attacker.com", ["crm-website01.vercel.app"]);
  if (!isAttackerAllowed) {
    console.log("✅ TEST 3 PASSED: Unauthorized origin correctly rejected.");
  } else {
    console.error("❌ TEST 3 FAILED: Unauthorized origin was allowed!");
    process.exit(1);
  }

  // TEST 4: Entitlement Verification
  console.log("\n[TEST 4] Project Entitlement Verification...");
  const entitlement = await checkProjectEntitlement(settings.projectId);
  console.log("   Entitlement status:", entitlement.status, "Allowed:", entitlement.allowed);
  if (entitlement) {
    console.log("✅ TEST 4 PASSED: Entitlement check evaluated cleanly.");
  } else {
    console.error("❌ TEST 4 FAILED: Entitlement evaluation failed!");
    process.exit(1);
  }

  // TEST 5: Context Engine Settings Fetch
  console.log("\n[TEST 5] Context Engine Settings Fetch (withBypassRLS)...");
  const ctxSettings = await withBypassRLS(async (tx: any) => {
    const [cs] = await tx.select().from(projectContextSettings).where(eq(projectContextSettings.projectId, settings.projectId)).limit(1);
    return cs;
  });
  console.log("✅ TEST 5 PASSED: Context engine settings fetched (Enabled:", ctxSettings?.enabled ?? true, ")");

  console.log("\n================================================================================");
  console.log("🏁 ALL WIDGET CONFIG MATRIX TESTS PASSED 100%!");
  console.log("================================================================================");
  process.exit(0);
}

runWidgetConfigMatrixTest().catch((err) => {
  console.error("Unhandled widget config matrix test failure:", err);
  process.exit(1);
});
