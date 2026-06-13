import { db, knowledgeSources } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";

async function main() {
  const sources = await db.select().from(knowledgeSources).where(isNull(knowledgeSources.kbId));
  console.log(`Found ${sources.length} sources without kbId`);
  
  for (const source of sources) {
    const kbId = `KB-${Math.floor(Math.random() * 9000) + 1000}`; // simple random generation for existing test data
    await db.update(knowledgeSources).set({ kbId }).where(eq(knowledgeSources.id, source.id));
    console.log(`Updated ${source.id} -> ${kbId}`);
  }
  
  console.log("Done");
  process.exit(0);
}

main().catch(console.error);
