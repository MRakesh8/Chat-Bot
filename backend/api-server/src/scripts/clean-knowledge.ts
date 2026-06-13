import { db } from "@workspace/db";
import { knowledgeSources, knowledgeChunks } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { eq } from "drizzle-orm";

async function run() {
  console.log("Starting knowledge cleaning script...");
  
  const sources = await db.select().from(knowledgeSources);
  console.log(`Found ${sources.length} knowledge sources.`);
  
  for (const source of sources) {
    let contentToClean = source.rawContent;

    if (!contentToClean || contentToClean.trim() === "") {
      const chunks = await db.select({ text: knowledgeChunks.chunkText }).from(knowledgeChunks).where(eq(knowledgeChunks.knowledgeSourceId, source.id));
      if (!chunks.length) continue;
      contentToClean = chunks.map(c => c.text).join("\n");
    }

    console.log(`Cleaning ID: ${source.id} / ${source.kbId}`);

    let cleaned = contentToClean;

    // AI Conversational fill removal via regex
    const regexes = [
      /^(?:Understood!?(?:\s|\n)*)+/i,
      /^(?:I will[\w\s]*\.!?(?:\s|\n)*)+/i,
      /^(?:Here'?s[\w\s]*\:!?(?:\s|\n)*)+/i,
      /^(?:Let'?s[\w\s]*\.!?(?:\s|\n)*)+/i,
      /Project Structure(?:\:|\n)/i,
      /Category [0-9]+(?:\:|\n)/i,
    ];

    for (const r of regexes) {
      cleaned = cleaned.replace(r, "");
    }
    
    cleaned = cleaned.trim();

    if (cleaned !== source.rawContent) {
      await db.update(knowledgeSources)
        .set({ rawContent: cleaned, status: "pending" })
        .where(eq(knowledgeSources.id, source.id));
      console.log(`  -> Cleaned and marked pending.`);
    } else {
      console.log(`  -> No changes needed.`);
    }
    
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log("Finished cleaning. Background cron will reprocess pending sources.");
  process.exit(0);
}

run().catch(console.error);
