import { db, withTenantContext } from "./dist/index.js";
import { projects, knowledgeSources } from "./dist/schema/index.js";
import { eq, desc, and, sql } from "drizzle-orm";

async function run() {
  const orgId = "9184ffed-50ae-4d95-8aa3-33e8d68bf82e";

  try {
    const result = await withTenantContext(orgId, async (tx) => {
      const query = tx
        .select({
          project: projects,
          knowledgeCount: sql`count(${knowledgeSources.id})`.mapWith(Number)
        })
        .from(projects)
        .leftJoin(knowledgeSources, eq(projects.id, knowledgeSources.projectId));

      return await query
        .where(eq(projects.organizationId, orgId))
        .groupBy(projects.id)
        .orderBy(desc(projects.createdAt));
    });

    console.log("Projects found with Drizzle:", result.length);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}
run();
