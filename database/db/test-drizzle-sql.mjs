import pg from "pg";
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, desc, sql } from "drizzle-orm";

const projects = pgTable("projects", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id"),
  createdAt: timestamp("created_at"),
});

const knowledgeSources = pgTable("knowledge_sources", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id"),
});

const db = drizzle(new pg.Pool());

const query = db.select({
  project: projects,
  knowledgeCount: sql`count(${knowledgeSources.id})`.mapWith(Number)
})
.from(projects)
.leftJoin(knowledgeSources, eq(projects.id, knowledgeSources.projectId))
.where(eq(projects.organizationId, "9184ffed-50ae-4d95-8aa3-33e8d68bf82e"))
.groupBy(projects.id)
.orderBy(desc(projects.createdAt));

console.log(query.toSQL());
