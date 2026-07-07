import "dotenv/config";
import { db, knowledgeSources, knowledgeChunks } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { logger } from "../lib/logger";

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean).map(v => v.trim())));
}

async function runCleanup() {
  logger.info("Starting knowledge cleanup script...");
  
  // 1. Fetch all knowledge grouped by project
  const allKnowledge = await db
    .select()
    .from(knowledgeSources)
    .where(isNotNull(knowledgeSources.rawContent));
    
  logger.info(`Found ${allKnowledge.length} knowledge records with content to analyze.`);

  // Group by project
  const projectGroups: Record<string, typeof allKnowledge> = {};
  for (const source of allKnowledge) {
    if (!projectGroups[source.projectId]) {
      projectGroups[source.projectId] = [];
    }
    projectGroups[source.projectId].push(source);
  }

  let totalDeleted = 0;
  let totalMerged = 0;

  for (const [projectId, sources] of Object.entries(projectGroups)) {
    logger.info(`Analyzing project ${projectId} with ${sources.length} sources...`);
    
    // Simple deduplication based on matching title or highly similar summary
    // Since this is a script, we will do an N^2 comparison per project (usually small)
    const toDelete = new Set<string>();
    
    for (let i = 0; i < sources.length; i++) {
      const sourceA = sources[i];
      if (toDelete.has(sourceA.id)) continue;

      for (let j = i + 1; j < sources.length; j++) {
        const sourceB = sources[j];
        if (toDelete.has(sourceB.id)) continue;

        // Determine if they are duplicates
        let isDuplicate = false;
        
        // Exact URL match
        if (sourceA.sourceUrl && sourceA.sourceUrl === sourceB.sourceUrl) {
           isDuplicate = true;
        }
        
        // Exact Title Match (if length > 5 to avoid "Note")
        if (!isDuplicate && sourceA.title && sourceB.title && sourceA.title === sourceB.title && sourceA.title.length > 5) {
           isDuplicate = true;
        }

        // Semantic Check (via Gemini)
        if (!isDuplicate) {
           const prompt = `Are these two knowledge items duplicates describing the exact same primary subject? Return strictly valid JSON: {"isDuplicate": true/false}
           Item 1:
           Title: ${sourceA.title}
           Summary: ${sourceA.summary}
           
           Item 2:
           Title: ${sourceB.title}
           Summary: ${sourceB.summary}`;
           
           try {
             const res = await ai.models.generateContent(null, { model: "gemini-2.0-flash", contents: prompt });
             const parsed = JSON.parse(res.text?.replace(/```json/gi, "").replace(/```/gi, "").trim() || "{}");
             isDuplicate = parsed.isDuplicate === true;
           } catch (e) {
             logger.warn({ err: e }, "Failed to check semantic duplication");
           }
        }

        if (isDuplicate) {
          logger.info(`Duplicate detected: [${sourceA.id}] and [${sourceB.id}]`);
          
          // Merge B into A
          const mergedTools = uniqueStrings([...(sourceA.tools || []), ...(sourceB.tools || [])]);
          const mergedSteps = uniqueStrings([...(sourceA.steps || []), ...(sourceB.steps || [])]);
          const mergedTags = uniqueStrings([...(sourceA.tag ? sourceA.tag.split(",") : []), ...(sourceB.tag ? sourceB.tag.split(",") : [])]);
          const mergedWeb = uniqueStrings([...(sourceA.websiteLinks || []), ...(sourceB.websiteLinks || [])]);
          
          // A gets the merged content, B gets deleted
          await db.update(knowledgeSources).set({
            tools: mergedTools,
            steps: mergedSteps,
            tag: mergedTags.join(", "),
            websiteLinks: mergedWeb,
            updatedAt: new Date()
          }).where(eq(knowledgeSources.id, sourceA.id));
          
          toDelete.add(sourceB.id);
          totalMerged++;
        }
      }
    }
    
    // Delete all redundant records
    if (toDelete.size > 0) {
       const deleteIds = Array.from(toDelete);
       logger.info(`Deleting ${deleteIds.length} redundant records in project ${projectId}`);
       await db.delete(knowledgeChunks).where(inArray(knowledgeChunks.knowledgeSourceId, deleteIds));
       await db.delete(knowledgeSources).where(inArray(knowledgeSources.id, deleteIds));
       totalDeleted += deleteIds.length;
    }
  }

  logger.info(`Cleanup complete! Merged ${totalMerged} records. Deleted ${totalDeleted} redundant records.`);
  process.exit(0);
}

runCleanup().catch((err) => {
  logger.error(err);
  process.exit(1);
});
