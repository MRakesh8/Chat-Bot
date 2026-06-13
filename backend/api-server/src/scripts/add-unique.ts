import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  try {
    await db.execute(sql`ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_kb_id_unique UNIQUE (kb_id);`);
    console.log("Added unique constraint");
  } catch (e) {
    console.log("Constraint already exists or error: ", e);
  }
  process.exit(0);
}

main().catch(console.error);
