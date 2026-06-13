import { db } from "@workspace/db";
import { knowledgeSources } from "@workspace/db";
import { processKnowledgeSource } from "../services/knowledge";
import { eq } from "drizzle-orm";

async function run() {
  const pendingSources = await db.select().from(knowledgeSources).where(eq(knowledgeSources.status, "pending"));
  console.log(`Found ${pendingSources.length} pending sources to process.`);

  for (const source of pendingSources) {
    try {
      console.log(`Processing ${source.id}...`);
      await processKnowledgeSource(source.id, { force: true });
    } catch (e) {
      console.error(`Error processing ${source.id}:`, e);
    }
  }

  console.log("Done reprocessing.");
  process.exit(0);
}

run().catch(console.error);
