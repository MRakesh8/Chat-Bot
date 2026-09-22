import { db, withTenantContext, projects } from "./dist/index.js";
import { eq } from "drizzle-orm";

async function run() {
  const orgId = "9184ffed-50ae-4d95-8aa3-33e8d68bf82e";

  try {
    const result = await withTenantContext(orgId, async (tx) => {
      return await tx.select().from(projects).where(eq(projects.organizationId, orgId));
    });

    console.log("Projects found with withTenantContext:", result.length);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}
run();
