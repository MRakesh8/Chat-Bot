/**
 * @file knowledge.ts
 * @description Core service handling text extraction (from files, youtube, websites), document chunking, embedding, vector database integration, search retrieval scoring, and duplicate detection.
 */
import { db, knowledgeCategories, knowledgeChunks, knowledgeSources, projects, knowledgeRetrievalCache } from "@workspace/db";
import { supabaseAdmin } from "../lib/supabase";
import { ai } from "@workspace/integrations-gemini-ai";
import mammoth from "mammoth";
import { and, eq, inArray, isNotNull, sql, or, ilike } from "drizzle-orm";
import { logger } from "../lib/logger";
import { extractYouTubeId, fetchYouTubeTranscriptText } from "../lib/youtube";
import { isIP } from "node:net";
import nodeCrypto from "crypto";
import { llmResponseCache } from "./cache-provider";

const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 120 * 60_000, 720 * 60_000];
const MAX_RETRY_COUNT = RETRY_DELAYS_MS.length;
const SUPPORTED_FILE_EXTENSIONS = new Set([
  // Documents
  "pdf", "docx", "doc", "txt", "md", "csv", "pptx", "ppt", "xls", "xlsx", "rtf", "tsv",
  // Archives
  "zip", "rar", "7z", "tar", "gz",
  // Images
  "png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "heic",
  // Audio
  "mp3", "wav", "ogg", "m4a", "aac",
  // Video
  "mp4", "webm", "mov", "avi", "mkv",
  // Code & Structured
  "js", "ts", "jsx", "tsx", "py", "html", "css", "json", "xml", "sh", "c", "cpp", "java", "go", "rs", "php", "sql", "yaml", "yml", "toml", "ini", "conf", "env",
]);

type LinkBuckets = {
  websiteLinks: string[];
  videoLinks: string[];
  githubLinks: string[];
};

type KnowledgeAnalysis = LinkBuckets & {
  categoryName: string;
  title: string;
  tags: string[];
  tools: string[];
  steps: string[];
  notes: string;
  summary: string;
  cleanedContent: string;
  sourceType: string;
  sourceUrl: string | null;
  keywordIndex: string;
};

// Helper to chunk text
function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    let end = index + chunkSize;
    if (end < text.length) {
      const boundary = text.lastIndexOf('\n', end);
      if (boundary > index + overlap) end = boundary;
    }
    chunks.push(text.slice(index, end).trim());
    index = end - overlap;
  }
  return chunks.filter((c) => c.length > 0);
}

// Security: Mask sensitive information before saving to DB
export function maskSecrets(content: string): string {
  if (!content) return content;
  
  let masked = content;
  
  // Mask generic API keys (sk-..., AIza...)
  masked = masked.replace(/sk-[a-zA-Z0-9]{32,}/g, "[REDACTED_API_KEY]");
  masked = masked.replace(/AIza[0-9A-Za-z-_]{35}/g, "[REDACTED_API_KEY]");
  
  // Mask basic credit card patterns (13-19 digits, possibly with spaces or dashes)
  masked = masked.replace(/(?:\d[ -]*?){13,16}/g, (match) => {
    const stripped = match.replace(/[ -]/g, "");
    if (stripped.length >= 13 && stripped.length <= 19) {
      return "[REDACTED_CREDIT_CARD]";
    }
    return match; // False positive, return original
  });

  return masked;
}

function assertPublicHttpUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) throw new Error("URL is required.");

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Local URLs are not supported.");
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    const [a, b] = hostname.split(".").map(Number);
    const isPrivate =
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0;
    if (isPrivate) throw new Error("Private network URLs are not supported.");
  } else if (ipVersion === 6) {
    if (
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80:")
    ) {
      throw new Error("Private network URLs are not supported.");
    }
  }

  return parsed.toString();
}

function uniqueStrings(values: Array<string | null | undefined>, limit?: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (limit && result.length >= limit) break;
  }
  return result;
}

function extractLinks(text: string): LinkBuckets {
  const urls = uniqueStrings(text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []);
  const buckets: LinkBuckets = { websiteLinks: [], videoLinks: [], githubLinks: [] };

  for (const rawUrl of urls) {
    const url = rawUrl.replace(/[.,;:!?]+$/, "");
    if (/^https?:\/\/(www\.)?github\.com\//i.test(url)) {
      buckets.githubLinks.push(url);
    } else if (/(youtube\.com|youtu\.be|instagram\.com\/(reel|p|tv|stories|[^/]+\/reel))/i.test(url)) {
      buckets.videoLinks.push(url);
    } else {
      buckets.websiteLinks.push(url);
    }
  }

  return {
    websiteLinks: uniqueStrings(buckets.websiteLinks),
    videoLinks: uniqueStrings(buckets.videoLinks),
    githubLinks: uniqueStrings(buckets.githubLinks),
  };
}

function sourceTypeFromLinks(links: LinkBuckets, fallback = "note") {
  if (links.githubLinks.length > 0) return "github";
  const firstVideo = links.videoLinks[0];
  if (firstVideo && /instagram\.com/i.test(firstVideo)) return "instagram";
  if (firstVideo) return "youtube";
  if (links.websiteLinks.length > 0) return "website";
  return fallback;
}

function primaryUrlForSourceType(sourceType: string, links: LinkBuckets) {
  if (sourceType === "github") return links.githubLinks[0] ?? null;
  if (sourceType === "youtube" || sourceType === "instagram") return links.videoLinks[0] ?? null;
  if (sourceType === "website") return links.websiteLinks[0] ?? null;
  return links.websiteLinks[0] ?? links.videoLinks[0] ?? links.githubLinks[0] ?? null;
}

function normalizeTags(input: unknown) {
  const values = Array.isArray(input)
    ? input.flatMap((tag) => String(tag).split(","))
    : String(input ?? "").split(",");
  return uniqueStrings(values.map((tag) => tag.trim()).filter(Boolean), 10).slice(0, 10);
}

export function stripSaveCommand(content: string) {
  return content
    .replace(/^\s*(add|save)\s+to\s+(project|knowledge)\s*[:\-]?\s*/i, "")
    .replace(/^\s*(remember|store)\s+this\s*[:\-]?\s*/i, "")
    .trim();
}

function safeJsonFromModel(text: string | undefined) {
  if (!text) return {};
  try {
    return JSON.parse(text.replace(/```json/gi, "").replace(/```/g, "").trim());
  } catch {
    return {};
  }
}

async function generateSummary(userId: string | null, text: string, projectId?: string) {
  const res = await ai.models.generateContent(userId, {
    model: "gemini-2.0-flash",
    contents: `Summarize this knowledge source for retrieval. Keep the important named tools, links, entities, and use cases.\n\n${text.slice(0, 30000)}`,
    projectId,
  });
  return res.text?.trim() || text.slice(0, 1000);
}

export function isKnowledgeSaveCommand(content: string) {
  return /^\s*(add\s+to\s+project|save\s+to\s+project|save\s+to\s+knowledge|add\s+to\s+knowledge|remember\s+this|store\s+this)\b/i.test(content);
}

export async function analyzeKnowledgeContent(params: {
  projectId: string;
  userId: string | null;
  content: string;
  sourceType?: string;
  sourceUrl?: string | null;
}) {
  const cleanContent = stripSaveCommand(params.content);
  const explicitLinks = extractLinks(`${cleanContent}\n${params.sourceUrl ?? ""}`);
  const categories = await db
    .select({ name: knowledgeCategories.name })
    .from(knowledgeCategories)
    .where(eq(knowledgeCategories.projectId, params.projectId));

  const sourceType = params.sourceType && params.sourceType !== "file"
    ? params.sourceType
    : sourceTypeFromLinks(explicitLinks, params.sourceType || "note");
  const sourceUrl = params.sourceUrl ?? primaryUrlForSourceType(sourceType, explicitLinks);

  const prompt = `Analyze this project knowledge item.
Existing categories: ${categories.map((c) => c.name).join(", ") || "None"}
Source type hint: ${sourceType}
Content:
"""${cleanContent.slice(0, 30000)}"""

Return strictly valid JSON:
{
  "categoryName": "best existing category or concise new category",
  "title": "short useful title",
  "tags": ["3 to 10 concise tags"],
  "tools": ["any specific tools, technologies, or software mentioned"],
  "steps": ["any step-by-step instructions or processes found"],
  "notes": "detailed notes and data containing all critical details, definitions, step-by-step instructions, and key information (do not summarize briefly)",
  "summary": "retrieval summary preserving tools, links, names, and use cases",
  "cleanedContent": "pure factual core of the text, completely stripping out any AI conversational wrappers (e.g. 'Understood...', 'I will...', 'Here is...', 'Let\\'s...', 'Project Structure', 'Category 1'), maintaining ONLY the exact factual information.",
  "websiteLinks": ["all website links"],
  "videoLinks": ["all youtube or instagram video/post links"],
  "githubLinks": ["all github links"],
  "keywords": ["important searchable keywords"]
}`;

  const res = await ai.models.generateContent(params.userId, {
    model: "gemini-2.0-flash",
    contents: prompt,
    projectId: params.projectId,
  });
  const parsed: any = safeJsonFromModel(res.text);
  const tags = normalizeTags(parsed.tags);
  const websiteLinks = uniqueStrings([...(parsed.websiteLinks ?? []), ...explicitLinks.websiteLinks]);
  const videoLinks = uniqueStrings([...(parsed.videoLinks ?? []), ...explicitLinks.videoLinks]);
  const githubLinks = uniqueStrings([...(parsed.githubLinks ?? []), ...explicitLinks.githubLinks]);
  const keywordIndex = uniqueStrings([
    ...(Array.isArray(parsed.keywords) ? parsed.keywords : []),
    ...tags,
    parsed.categoryName,
    parsed.title,
    cleanContent,
    ...websiteLinks,
    ...videoLinks,
    ...githubLinks,
  ]).join(" ").slice(0, 12000);

  return {
    categoryName: String(parsed.categoryName || categories[0]?.name || "General").trim().slice(0, 255),
    title: String(parsed.title || cleanContent.slice(0, 80) || "Knowledge Item").trim(),
    tags: tags.length > 0 ? tags : uniqueStrings(cleanContent.split(/\W+/).filter((w) => w.length > 3), 10).slice(0, 10),
    tools: Array.isArray(parsed.tools) ? parsed.tools.map(String) : [],
    steps: Array.isArray(parsed.steps) ? parsed.steps.map(String) : [],
    notes: String(parsed.notes || parsed.summary || parsed.cleanedContent || cleanContent).trim(),
    summary: String(parsed.summary || parsed.notes || parsed.cleanedContent || cleanContent).trim(),
    cleanedContent: String(parsed.cleanedContent || cleanContent).trim(),
    websiteLinks,
    videoLinks,
    githubLinks,
    sourceType,
    sourceUrl,
    keywordIndex,
  } satisfies KnowledgeAnalysis;
}

export async function ensureKnowledgeCategory(projectId: string, categoryName: string) {
  const existing = await db
    .select()
    .from(knowledgeCategories)
    .where(eq(knowledgeCategories.projectId, projectId));
  const match = existing.find((category) => category.name.toLowerCase() === categoryName.toLowerCase());
  if (match) return match;

  const [created] = await db
    .insert(knowledgeCategories)
    .values({ projectId, name: categoryName || "General" })
    .returning();
  return created;
}

function retryDelayForAttempt(retryCount: number) {
  return RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)];
}

function scheduleKnowledgeRepair(sourceId: string, retryCount: number) {
  if (retryCount >= MAX_RETRY_COUNT) return;
  const delayMs = retryDelayForAttempt(Math.max(0, retryCount - 1));
  setTimeout(() => {
    processKnowledgeSource(sourceId, { force: true }).catch((err) => {
      logger.error({ err, sourceId }, "Scheduled knowledge repair failed");
    });
  }, delayMs).unref?.();
}

export async function invalidateKnowledgeCache(projectId: string) {
  try {
    await db.delete(knowledgeRetrievalCache).where(eq(knowledgeRetrievalCache.projectId, projectId as any));
  } catch (err) {
    logger.error({ err, projectId }, "Failed to invalidate knowledge cache");
  }
}

export async function saveAutoKnowledgeItem(params: {
  projectId: string;
  userId: string | null;
  content: string;
}) {
  // Apply data sanitization
  params.content = maskSecrets(params.content);
  
  const analysis = await analyzeKnowledgeContent(params);
  const category = await ensureKnowledgeCategory(params.projectId, analysis.categoryName);

  // --- Duplicate Detection ---
  // Try to find if this knowledge already exists using semantic search
  const { contextString: similarContent } = await searchProjectKnowledge({
    projectIds: [params.projectId],
    userId: params.userId,
    query: analysis.title + " " + analysis.summary,
    limit: 3
  });

  // Since searchProjectKnowledge returns a formatted string, let's also do a direct DB check for exact URLs or very similar titles
  const potentialMatches = await db
    .select()
    .from(knowledgeSources)
    .where(and(
      eq(knowledgeSources.projectId, params.projectId),
      or(
        analysis.sourceUrl ? eq(knowledgeSources.sourceUrl, analysis.sourceUrl) : sql`FALSE`,
        ilike(knowledgeSources.title, `%${analysis.title.slice(0, 20)}%`)
      )
    ))
    .limit(3);

  if (potentialMatches.length > 0 || similarContent.includes("Knowledge ID:")) {
    // We found potential duplicates. Let's use AI to decide if it's a true duplicate or needs merging.
    let existingContext = "--- Exact/Metadata Matches ---\n";
    for (const match of potentialMatches) {
      existingContext += `Knowledge ID: ${match.id}\nTitle: ${match.title}\nTools: ${JSON.stringify(match.tools)}\nSteps: ${JSON.stringify(match.steps)}\nTags: ${match.tag}\nSummary: ${match.summary}\nURL: ${match.sourceUrl}\n\n`;
    }
    existingContext += "--- Semantic Matches ---\n" + similarContent;

    const mergePrompt = `You are a knowledge deduplication assistant. 
A user is trying to add NEW knowledge. We found existing knowledge in the database.
Determine if the NEW knowledge is a duplicate, a partial duplicate (needs merging), or completely unique.

NEW Knowledge:
Title: ${analysis.title}
URL: ${analysis.sourceUrl || 'None'}
Tags: ${JSON.stringify(analysis.tags)}
Tools: ${JSON.stringify(analysis.tools)}
Steps: ${JSON.stringify(analysis.steps)}
Summary: ${analysis.summary}
Raw Content: ${stripSaveCommand(params.content).slice(0, 5000)}

EXISTING Knowledge:
${existingContext}

Return strictly valid JSON:
{
  "action": "already_exists" | "merge" | "create_new",
  "targetKnowledgeId": "If action is already_exists or merge, provide the exact Knowledge ID of the best match from the EXISTING Knowledge list",
  "mergedTools": ["If action is merge, combine the existing and new tools into one complete list without duplicates"],
  "mergedSteps": ["If action is merge, combine the existing and new steps into one logical list"],
  "mergedTags": ["If action is merge, combine the tags"],
  "mergedSummary": "If action is merge, update the summary to include both existing and new details without losing anything",
  "mergedWebsiteLinks": ["combined website links"],
  "mergedVideoLinks": ["combined video links"],
  "mergedGithubLinks": ["combined github links"]
}`;

    const mergeRes = await ai.models.generateContent(params.userId, {
      model: "gemini-2.0-flash",
      contents: mergePrompt,
      projectId: params.projectId,
    });
    const mergeDecision = safeJsonFromModel(mergeRes.text);

    if (mergeDecision.action === "already_exists" && mergeDecision.targetKnowledgeId) {
      const [existingRecord] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, mergeDecision.targetKnowledgeId));
      if (existingRecord) {
        return {
          record: existingRecord,
          category,
          analysis,
          status: "already_exists"
        };
      }
    }

    if (mergeDecision.action === "merge" && mergeDecision.targetKnowledgeId) {
      const [existingRecord] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, mergeDecision.targetKnowledgeId));
      if (existingRecord) {
        const [updatedRecord] = await db
          .update(knowledgeSources)
          .set({
            tools: Array.isArray(mergeDecision.mergedTools) ? mergeDecision.mergedTools.map(String) : existingRecord.tools,
            steps: Array.isArray(mergeDecision.mergedSteps) ? mergeDecision.mergedSteps.map(String) : existingRecord.steps,
            tag: Array.isArray(mergeDecision.mergedTags) ? uniqueStrings(mergeDecision.mergedTags.map(String)).join(", ") : existingRecord.tag,
            summary: mergeDecision.mergedSummary || existingRecord.summary,
            websiteLinks: Array.isArray(mergeDecision.mergedWebsiteLinks) ? uniqueStrings(mergeDecision.mergedWebsiteLinks.map(String)) : existingRecord.websiteLinks,
            videoLinks: Array.isArray(mergeDecision.mergedVideoLinks) ? uniqueStrings(mergeDecision.mergedVideoLinks.map(String)) : existingRecord.videoLinks,
            githubLinks: Array.isArray(mergeDecision.mergedGithubLinks) ? uniqueStrings(mergeDecision.mergedGithubLinks.map(String)) : existingRecord.githubLinks,
            status: "pending", // Re-process so chunks update
            updatedAt: new Date()
          })
          .where(eq(knowledgeSources.id, existingRecord.id))
          .returning();
        
        await processKnowledgeSource(updatedRecord.id, { force: true });
        const [processed] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, updatedRecord.id));
        
        await invalidateKnowledgeCache(params.projectId);

        return {
          record: processed ?? updatedRecord,
          category,
          analysis,
          status: "merged"
        };
      }
    }
  }

  // --- End Duplicate Detection ---

  const kbId = `KB-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
  const [record] = await db
    .insert(knowledgeSources)
    .values({
      kbId,
      projectId: params.projectId,
      categoryId: category.id,
      tag: analysis.tags.join(", "),
      title: analysis.title,
      notes: analysis.notes,
      summary: analysis.summary,
      tools: analysis.tools,
      steps: analysis.steps,
      rawContent: analysis.cleanedContent,
      websiteLinks: analysis.websiteLinks,
      videoLinks: analysis.videoLinks,
      githubLinks: analysis.githubLinks,
      sourceType: analysis.sourceType,
      sourceUrl: analysis.sourceUrl,
      keywordIndex: analysis.keywordIndex,
      status: "pending",
    })
    .returning();

  await processKnowledgeSource(record.id, { force: true });
  const [processed] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, record.id));
  
  await invalidateKnowledgeCache(params.projectId);
  
  return {
    record: processed ?? record,
    category,
    analysis,
    status: "created"
  };
}

export async function searchProjectKnowledge(params: {
  projectIds: string[];
  userId: string | null;
  query: string;
  limit?: number;
}): Promise<{ contextString: string, retrievedIds: string[], candidates?: any[] }> {
  if (params.projectIds.length === 0 || !params.query.trim()) return { contextString: "", retrievedIds: [] };

  // Global RAG Cache (5m TTL)
  const queryHash = nodeCrypto.createHash("sha256").update(params.projectIds.join(",") + ":" + params.query.trim().toLowerCase()).digest("hex");
  const cachedResultStr = await llmResponseCache.get(`rag_search_${queryHash}`);
  if (cachedResultStr) {
    try {
      const parsed = JSON.parse(cachedResultStr);
      if (parsed && parsed.contextString !== undefined) {
        return parsed;
      }
    } catch (e) {
      // Ignore parse error and proceed with search
    }
  }

  // 1. Candidate Generation
  const fetchLimit = 10;
  const STOP_WORDS = new Set([
    "about", "above", "after", "again", "against", "all", "and", "any", "are", "because", "been", "before", "being", 
    "below", "between", "both", "but", "could", "did", "does", "doing", "down", "during", "each", "few", "for", 
    "from", "further", "had", "has", "have", "having", "her", "here", "hers", "herself", "him", "himself", "his", 
    "how", "into", "its", "itself", "more", "most", "myself", "nor", "not", "off", "once", "only", "other", "our", 
    "ours", "ourselves", "out", "over", "own", "same", "she", "should", "some", "such", "than", "that", "the", 
    "their", "theirs", "them", "themselves", "then", "there", "these", "they", "this", "those", "through", "too", 
    "under", "until", "very", "was", "were", "what", "when", "where", "which", "while", "who", "whom", "why", 
    "with", "you", "your", "yours", "yourself", "yourselves", "tell", "show", "give", "please", "can", "will"
  ]);

  const words = uniqueStrings(
    params.query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
    8,
  );

  let metadataMatches: Array<any> = [];
  if (words.length > 0) {
    const conditions = words.flatMap((word) => [
      ilike(knowledgeCategories.name, `%${word}%`),
      ilike(knowledgeSources.tag, `%${word}%`),
      ilike(knowledgeSources.title, `%${word}%`),
      ilike(knowledgeSources.notes, `%${word}%`),
      ilike(knowledgeSources.summary, `%${word}%`),
      ilike(knowledgeSources.keywordIndex, `%${word}%`),
      ilike(knowledgeSources.sourceUrl, `%${word}%`),
    ]);
    metadataMatches = await db
      .select({
        id: knowledgeSources.id,
        title: knowledgeSources.title,
        tag: knowledgeSources.tag,
        notes: knowledgeSources.notes,
        summary: knowledgeSources.summary,
        rawContent: knowledgeSources.rawContent,
        sourceType: knowledgeSources.sourceType,
        sourceUrl: knowledgeSources.sourceUrl,
        websiteLinks: knowledgeSources.websiteLinks,
        videoLinks: knowledgeSources.videoLinks,
        githubLinks: knowledgeSources.githubLinks,
        categoryName: knowledgeCategories.name,
      })
      .from(knowledgeSources)
      .leftJoin(knowledgeCategories, eq(knowledgeSources.categoryId, knowledgeCategories.id))
      .where(and(inArray(knowledgeSources.projectId, params.projectIds), or(...conditions)))
      .limit(fetchLimit);
  }

  let similarChunks: Array<any> = [];
  try {
    const embedRes = await ai.models.embedContent(params.userId, {
      model: "gemini-embedding-2",
      contents: params.query,
      config: { outputDimensionality: 768 },
    });
    const userVector = embedRes.embeddings?.[0]?.values;
    if (userVector) {
      similarChunks = await db
        .select({
          chunkText: knowledgeChunks.chunkText,
          sourceId: knowledgeChunks.knowledgeSourceId,
          title: knowledgeSources.title,
          tag: knowledgeSources.tag,
          sourceType: knowledgeSources.sourceType,
          sourceUrl: knowledgeSources.sourceUrl,
          websiteLinks: knowledgeSources.websiteLinks,
          videoLinks: knowledgeSources.videoLinks,
          githubLinks: knowledgeSources.githubLinks,
          categoryName: knowledgeCategories.name,
          rawContent: knowledgeSources.rawContent,
          summary: knowledgeSources.summary,
          notes: knowledgeSources.notes,
        })
        .from(knowledgeChunks)
        .innerJoin(knowledgeSources, eq(knowledgeChunks.knowledgeSourceId, knowledgeSources.id))
        .leftJoin(knowledgeCategories, eq(knowledgeSources.categoryId, knowledgeCategories.id))
        .where(and(inArray(knowledgeChunks.projectId, params.projectIds), isNotNull(knowledgeChunks.embedding)))
        .orderBy(sql`${knowledgeChunks.embedding} <=> ${JSON.stringify(userVector)}`)
        .limit(fetchLimit);
    }
  } catch (err) {
    logger.error({ err }, "Vector knowledge search failed");
  }

  if (metadataMatches.length === 0 && similarChunks.length === 0) return { contextString: "", retrievedIds: [] };

  // 2. Combine and Score Candidates
  const candidatesMap = new Map<string, any>();

  for (const match of metadataMatches) {
    const id = match.id;
    if (!candidatesMap.has(id)) {
      candidatesMap.set(id, { ...match, isVectorMatch: false, contentText: match.notes || match.rawContent || match.summary || "" });
    }
  }

  for (const chunk of similarChunks) {
    const id = chunk.sourceId;
    if (id && !candidatesMap.has(id)) {
      candidatesMap.set(id, { ...chunk, id: chunk.sourceId, isVectorMatch: true, contentText: chunk.chunkText || chunk.notes || chunk.rawContent || chunk.summary || "" });
    } else if (id && candidatesMap.has(id)) {
      const existing = candidatesMap.get(id);
      existing.isVectorMatch = true;
      existing.contentText = existing.contentText.length > 0 ? existing.contentText : (chunk.chunkText || chunk.notes || chunk.rawContent || chunk.summary || "");
    }
  }

  const queryStr = params.query.toLowerCase().trim();
  const queryTerms = words.map(w => w.toLowerCase());
  const scoredCandidates: Array<any> = [];

  for (const candidate of candidatesMap.values()) {
    const lowerTag = (candidate.tag || "").toLowerCase();
    const lowerCategory = (candidate.categoryName || "").toLowerCase();
    const lowerContent = (candidate.contentText || "").toLowerCase();

    let tagScore = 0;
    let categoryScore = 0;
    let keywordScore = 0;
    let entityScore = 0;
    let vectorScore = candidate.isVectorMatch ? 20 : 0;

    if (lowerTag === queryStr) {
      tagScore = 200;
    } else if (lowerTag && (lowerTag.includes(queryStr) || queryTerms.some(t => lowerTag.includes(t)))) {
      tagScore = 150;
    }

    if (lowerCategory && (lowerCategory.includes(queryStr) || queryTerms.some(t => lowerCategory.includes(t)))) {
      categoryScore = 100;
    }

    const lowerTitle = (candidate.title || "").toLowerCase();
    const isExactEntity = lowerTitle === queryStr || lowerTag.split('/').map((s: string) => s.trim()).includes(queryStr);
    
    if (isExactEntity) {
      entityScore = 180;
    } else if (queryStr && lowerContent.includes(queryStr)) {
      entityScore = 60;
    }

    if (queryTerms.some(t => lowerContent.includes(t))) {
      keywordScore = 80;
    }

    let score = tagScore + categoryScore + keywordScore + entityScore + vectorScore;
    scoredCandidates.push({ ...candidate, retrievalScore: score });
  }

  // 3. Sorting and Anti-Pollution Guard
  scoredCandidates.sort((a, b) => b.retrievalScore - a.retrievalScore);
  
  let topCandidates = scoredCandidates;
  if (topCandidates.length > 0) {
    const topScore = topCandidates[0].retrievalScore;
    // Anti-Pollution Guard: Discard candidates with score < 50% of top score
    topCandidates = topCandidates.filter(c => c.retrievalScore >= topScore * 0.5);
  }
  
  topCandidates = topCandidates.slice(0, params.limit ?? 5);

  // 4. Logging
  let debugLog = `Query: ${params.query}\n\n`;
  topCandidates.forEach((c, index) => {
    debugLog += `Candidate ${index + 1}:\nCategory: ${c.categoryName || "Uncategorized"}\nTag: ${c.tag || "None"}\nScore: ${c.retrievalScore}\n\n`;
  });
  logger.info(`[Retrieval Ranking]\n${debugLog.trim()}`);

  // 5. Context Formatting
  const MAX_CHARS = 10000;
  let currentChars = 0;

  const finalItems: string[] = [];
  const retrievedIdsSet = new Set<string>();

  for (const candidate of topCandidates) {
    let itemStr = `Category: ${candidate.categoryName || "Uncategorized"}\nTag: ${candidate.tag || "None"}\n`;
    if (candidate.sourceUrl) {
      itemStr += `Source URL: ${candidate.sourceUrl}\n`;
    }
    if (candidate.websiteLinks && candidate.websiteLinks.length > 0) {
      itemStr += `Website Links: ${candidate.websiteLinks.join(", ")}\n`;
    }
    if (candidate.videoLinks && candidate.videoLinks.length > 0) {
      itemStr += `Video Links: ${candidate.videoLinks.join(", ")}\n`;
    }
    if (candidate.githubLinks && candidate.githubLinks.length > 0) {
      itemStr += `GitHub Links: ${candidate.githubLinks.join(", ")}\n`;
    }
    itemStr += `\nContent:\n${candidate.contentText}`;
    
    if (currentChars + itemStr.length > MAX_CHARS && finalItems.length > 0) break;

    finalItems.push(itemStr);
    retrievedIdsSet.add(candidate.id);
    currentChars += itemStr.length;
  }

  const finalResult = {
    contextString: finalItems.join("\n\n---\n\n"),
    retrievedIds: Array.from(retrievedIdsSet),
    candidates: topCandidates
  };

  // Save to cache for 5 minutes
  await llmResponseCache.set(`rag_search_${queryHash}`, JSON.stringify(finalResult), 300);

  return finalResult;
}

export async function extractSourceContent(params: { sourceType: string, sourceUrl?: string | null, fileBuffer?: Buffer, filename?: string, userId?: string | null, projectId?: string | null }): Promise<string> {
  let extractedText = "";
  const { sourceType, sourceUrl, fileBuffer, filename } = params;

  if (sourceType === "youtube") {
    const videoId = extractYouTubeId(sourceUrl || "");
    if (!videoId) {
      throw new Error(`Invalid YouTube URL: ${sourceUrl}`);
    }
    try {
      const transcript = await fetchYouTubeTranscriptText(videoId);
      const res = await ai.models.generateContent(params.userId || null, {
        model: "gemini-2.0-flash",
        contents: `Please summarize and provide a detailed structured text representation of the following YouTube video transcript: \n\n${transcript.slice(0, 50000)}`,
        projectId: params.projectId,
      });
      extractedText = res.text || transcript;
    } catch (err) {
      logger.warn({ err }, `YouTube transcript failed for ${videoId}. Falling back to direct URL Gemini summarization.`);
      const res = await ai.models.generateContent(params.userId || null, {
        model: "gemini-2.0-flash",
        contents: `Please summarize and provide a detailed description of the content for this YouTube video: ${sourceUrl}`,
        projectId: params.projectId,
      });
      extractedText = res.text || "";
    }
  } else if (sourceType === "website") {
    const safeUrl = assertPublicHttpUrl(sourceUrl);
    try {
      const res = await fetch(safeUrl, { 
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5"
        },
        signal: AbortSignal.timeout(10000) 
      });
      if (!res.ok) throw new Error(`Failed to fetch website: ${res.statusText}`);
      const html = (await res.text()).slice(0, 2_000_000);
      extractedText = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch (err) {
      logger.warn({ err }, `Direct fetch failed for website ${safeUrl}. Falling back to Gemini search.`);
      try {
        const res = await ai.models.generateContent(params.userId || null, {
          model: "gemini-2.0-flash",
          contents: `Search the web for this URL and extract the main text content, purpose, and key details: ${safeUrl}`,
          tools: [{ googleSearch: {} }],
          projectId: params.projectId,
        });
        extractedText = res.text || `Website Reference: ${safeUrl}`;
      } catch (geminiErr) {
        logger.warn({ err: geminiErr }, `Gemini fallback failed for website ${safeUrl}. Saving link only.`);
        extractedText = `Website Reference: ${safeUrl}`;
      }
    }
  } else if (sourceType === "github") {
    let repoPath = sourceUrl?.replace(/https?:\/\/github\.com\//, "");
    if (repoPath?.endsWith("/")) repoPath = repoPath.slice(0, -1);
    
    const headers = { "User-Agent": "RAGHUB-Knowledge-Base" };
    const repoRes = await fetch(`https://api.github.com/repos/${repoPath}`, { headers });
    if (!repoRes.ok) throw new Error(`Failed to fetch github repo details for ${repoPath}`);
    const repoData = await repoRes.json() as any;
    
    let readmeText = "";
    const readmeRes = await fetch(`https://api.github.com/repos/${repoPath}/readme`, { headers });
    if (readmeRes.ok) {
      const readmeData = await readmeRes.json() as any;
      if (readmeData.content) {
        readmeText = Buffer.from(readmeData.content, "base64").toString("utf8");
      }
    }
    extractedText = `Repository: ${repoData.full_name}\nDescription: ${repoData.description || "No description"}\n\nREADME:\n${readmeText}`;
    
  } else if (sourceType === "note") {
    extractedText = ""; // Handled outside if needed
  } else if (sourceType === "instagram") {
    if (!sourceUrl) {
      throw new Error("Instagram source URL is missing.");
    }
    logger.info(`Extracting Instagram video content via Gemini for ${sourceUrl}`);
    try {
      const res = await ai.models.generateContent(params.userId || null, {
        model: "gemini-2.0-flash",
        contents: `Search the web for this Instagram URL and extract any available public metadata, caption, visible text, and likely topic for this Instagram reel/post/video. URL: ${sourceUrl}`,
        tools: [{ googleSearch: {} }],
        projectId: params.projectId,
      });
      extractedText = res.text || `Instagram source: ${sourceUrl}`;
    } catch (err) {
      logger.warn({ err }, `Instagram metadata extraction failed for ${sourceUrl}. Saving link only.`);
      extractedText = `Instagram source: ${sourceUrl}`;
    }
  } else if (sourceType === "video") {
    if (sourceUrl) {
      throw new Error("Direct Video URL scraping not fully supported. Please upload video file instead.");
    }
  }

  if (fileBuffer && filename) {
    const lowerFilename = filename.toLowerCase();
    const extension = lowerFilename.split(".").pop() || "";
    if (!SUPPORTED_FILE_EXTENSIONS.has(extension)) {
      throw new Error(`Unsupported file type: ${filename}`);
    }
    if (lowerFilename.endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: fileBuffer });
      try {
        const parsed = await parser.getText();
        extractedText = parsed.text;
      } finally {
        await parser.destroy();
      }
    } else if (lowerFilename.endsWith(".docx")) {
      const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedText = parsed.value;
    } else if (lowerFilename.match(/\.(txt|md|js|ts|jsx|tsx|py|html|css|json|xml|sh|c|cpp|java|go|rs|php|sql|yaml|yml|toml|ini|conf|env|tsv|rtf)$/)) {
      extractedText = fileBuffer.toString("utf-8");
    } else if (lowerFilename.endsWith(".csv")) {
      extractedText = fileBuffer
        .toString("utf-8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((row, index) => `Row ${index + 1}: ${row}`)
        .join("\n");
    } else if (lowerFilename.match(/\.(pptx|ppt|xlsx|xls|doc)$/)) {
      const { parseOffice } = await import("officeparser");
      extractedText = String(await parseOffice(fileBuffer));
    } else if (lowerFilename.match(/\.(png|jpe?g|webp|gif|bmp|heic)$/)) {
      const ext = lowerFilename.split('.').pop()?.replace('jpg', 'jpeg') || 'jpeg';
      const imageMime = `image/${ext}`;
      const res = await ai.models.generateContent(params.userId || null, {
        model: "gemini-2.0-flash",
        contents: [
          "OCR and describe this image. Extract all visible text first, then summarize the image for searchable project knowledge.",
          { inlineData: { mimeType: imageMime, data: fileBuffer.toString("base64") } }
        ],
        projectId: params.projectId,
      });
      extractedText = res.text || "";
    } else if (lowerFilename.match(/\.(mp3|wav|ogg|m4a|aac)$/)) {
      const audioMime = `audio/${lowerFilename.split('.').pop()}`;
      try {
        const res = await ai.models.generateContent(params.userId || null, {
          model: "gemini-2.0-flash",
          contents: [
            "Transcribe and summarize this audio file for searchable project knowledge.",
            { inlineData: { mimeType: audioMime, data: fileBuffer.toString("base64") } }
          ],
          projectId: params.projectId,
        });
        extractedText = res.text || "";
      } catch (err: any) {
        logger.warn({ err }, `Audio transcription failed for ${filename}. File may be too large for inlineData.`);
        extractedText = `[Audio File: ${filename} - Transcription failed or file too large]`;
      }
    } else if (lowerFilename.match(/\.(mp4|webm|mov|avi|mkv)$/)) {
      const videoMime = `video/${lowerFilename.split('.').pop()}`;
      try {
        const res = await ai.models.generateContent(params.userId || null, {
          model: "gemini-2.0-flash",
          contents: [
            "Transcribe and describe the contents of this video for searchable project knowledge.",
            { inlineData: { mimeType: videoMime, data: fileBuffer.toString("base64") } }
          ],
          projectId: params.projectId,
        });
        extractedText = res.text || "";
      } catch (err: any) {
        logger.warn({ err }, `Video transcription failed for ${filename}. File may be too large for inlineData.`);
        extractedText = `[Video File: ${filename} - Transcription failed or file too large]`;
      }
    } else if (lowerFilename.endsWith(".zip")) {
      const AdmZipModule = await import("adm-zip");
      const AdmZip = AdmZipModule.default || AdmZipModule;
      const zip = new AdmZip(fileBuffer);
      const zipEntries = zip.getEntries();
      let combinedText = "";
      for (const zipEntry of zipEntries) {
        if (!zipEntry.isDirectory) {
          const entryName = zipEntry.entryName;
          // Skip macOS specific hidden files
          if (entryName.includes("__MACOSX") || entryName.endsWith(".DS_Store")) continue;
          
          const ext = entryName.split('.').pop()?.toLowerCase() || "";
          
          // To keep zip extraction fast and avoid AI rate limits, we only recursively extract text/document files.
          // We list other media/files to indicate their presence.
          const isTextOrDoc = ["pdf", "docx", "doc", "txt", "md", "csv", "pptx", "ppt", "xls", "xlsx", "js", "ts", "jsx", "tsx", "py", "html", "css", "json", "xml", "sh", "c", "cpp", "java", "go", "rs", "php", "sql", "yaml", "yml", "toml", "ini", "conf", "env", "tsv", "rtf"].includes(ext);
          
          if (isTextOrDoc) {
            try {
              const nestedText = await extractSourceContent({
                sourceType: "file",
                fileBuffer: zipEntry.getData(),
                filename: entryName,
                userId: params.userId || null,
                projectId: params.projectId || null,
              });
              combinedText += `\n\n--- File: ${entryName} ---\n${nestedText}`;
            } catch (err) {
              logger.warn({ err }, `Skipping unsupported or unreadable ZIP entry ${entryName}`);
              combinedText += `\n\n--- File: ${entryName} [Extraction Failed] ---`;
            }
          } else {
            combinedText += `\n\n--- File: ${entryName} [Format: ${ext?.toUpperCase() || "Unknown"} - content extraction skipped inside zip] ---`;
          }
        }
      }
      extractedText = combinedText;
      if (!extractedText.trim()) {
        extractedText = `[ZIP Archive: ${filename} - No extractable contents found]`;
      }
    } else if (lowerFilename.match(/\.(rar|7z|tar|gz)$/)) {
      extractedText = `[Archive File: ${filename} - Content extraction not supported for this archive format. Please use .zip instead.]`;
    } else {
      throw new Error(`Unsupported file type: ${filename}`);
    }
  }

  if (!extractedText || !extractedText.trim()) {
    throw new Error("No text extracted from source.");
  }

  return extractedText;
}

export async function processKnowledgeSource(sourceId: string, options: { force?: boolean } = {}) {
  try {
    const [source] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, sourceId));
    if (!source) throw new Error(`Source ${sourceId} not found`);
    const [project] = await db.select().from(projects).where(eq(projects.id, source.projectId));
    const userId = project?.userId || null;

    if (source.status === "processed" && !options.force) {
      logger.info(`Source ${sourceId} is already processed, skipping`);
      return source;
    }

    if (source.status === "processing" && !options.force) {
      logger.info(`Source ${sourceId} is already being processed`);
      return source;
    }

    await db.update(knowledgeSources).set({
      status: "processing",
      lastError: null,
      nextRetryAt: null,
      updatedAt: new Date(),
    }).where(eq(knowledgeSources.id, sourceId));
    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.knowledgeSourceId, sourceId));

    let extractedText = source.rawContent || "";

    try {
      // PHASE 1: EXTRACTION AND STORAGE
      let fileBuffer;
      
      if (!extractedText) {
        if (source.fileId) {
          const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from("project-files")
            .download(source.fileId);

          if (downloadError || !fileData) {
            throw new Error(`Failed to download file from storage: ${downloadError?.message}`);
          }
          fileBuffer = Buffer.from(await fileData.arrayBuffer());
        }
        
        if (source.sourceType === "note") {
          extractedText = source.notes || "";
        } else {
          extractedText = await extractSourceContent({
            sourceType: source.sourceType,
            sourceUrl: source.sourceUrl,
            fileBuffer,
            filename: source.filename || undefined,
            userId,
            projectId: source.projectId,
          });
        }
      }

      const links = extractLinks(`${source.sourceUrl ?? ""}\n${source.notes ?? ""}\n${extractedText}`);
      
      let baseKeywordIndex = uniqueStrings([
        source.title,
        source.tag,
        source.notes,
        extractedText.slice(0, 10000),
        ...links.websiteLinks,
        ...links.videoLinks,
        ...links.githubLinks,
      ]).join(" ").slice(0, 12000);

      // SAVE RAW CONTENT IMMEDIATELY
      await db.update(knowledgeSources).set({
        status: "STORED",
        rawContent: extractedText,
        keywordIndex: baseKeywordIndex,
        websiteLinks: uniqueStrings([...(source.websiteLinks ?? []), ...links.websiteLinks]),
        videoLinks: uniqueStrings([...(source.videoLinks ?? []), ...links.videoLinks]),
        githubLinks: uniqueStrings([...(source.githubLinks ?? []), ...links.githubLinks]),
        updatedAt: new Date(),
      }).where(eq(knowledgeSources.id, sourceId));
      await invalidateKnowledgeCache(source.projectId);
      
      // PHASE 2: AI ENRICHMENT
      try {
        const summary = await generateSummary(userId, extractedText, source.projectId);
        const fullKeywordIndex = uniqueStrings([baseKeywordIndex, summary]).join(" ").slice(0, 12000);

        const chunks = chunkText(extractedText);
        logger.info(`Extracted ${chunks.length} chunks from ${sourceId}`);

        let savedChunks = 0;
        for (const text of chunks) {
          let embedded = false;
          for (let attempt = 0; attempt < 3 && !embedded; attempt++) {
            try {
              const response = await ai.models.embedContent(userId, {
                model: "gemini-embedding-2",
                contents: text,
                config: { outputDimensionality: 768 },
                projectId: source.projectId,
              });

              const embedding = response.embeddings?.[0]?.values;
              if (embedding) {
                await db.insert(knowledgeChunks).values({
                  knowledgeSourceId: source.id,
                  projectId: source.projectId,
                  chunkText: text,
                  embedding: embedding,
                });
                savedChunks++;
                embedded = true;
              }
            } catch (embedError) {
              if (attempt === 2) {
                logger.error({ err: embedError }, "Failed to embed chunk after retries");
              } else {
                await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
              }
            }
          }
        }

        if (savedChunks === 0) {
          throw new Error("No knowledge chunks could be embedded");
        }

        const [updated] = await db.update(knowledgeSources).set({
          status: "processed",
          summary,
          keywordIndex: fullKeywordIndex,
          retryCount: 0,
          nextRetryAt: null,
          lastError: null,
          updatedAt: new Date(),
        }).where(eq(knowledgeSources.id, sourceId)).returning();
        
        logger.info(`Successfully processed source ${sourceId}`);
        await invalidateKnowledgeCache(source.projectId);
        return updated;
        
      } catch (aiError: any) {
        logger.error({ err: aiError }, `AI enrichment failed for source ${sourceId}`);
        
        const [current] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, sourceId));
        const nextRetryCount = Math.min((current?.retryCount ?? 0) + 1, MAX_RETRY_COUNT);
        const shouldRetry = nextRetryCount <= MAX_RETRY_COUNT;
        const nextRetryAt = shouldRetry && nextRetryCount < MAX_RETRY_COUNT
          ? new Date(Date.now() + retryDelayForAttempt(nextRetryCount - 1))
          : null;
          
        await db.update(knowledgeSources).set({
          status: "PARTIAL_SUCCESS",
          retryCount: nextRetryCount,
          nextRetryAt,
          lastError: "AI Enrichment Failed: " + (aiError?.message || String(aiError)),
          updatedAt: new Date(),
        }).where(eq(knowledgeSources.id, sourceId));
        await invalidateKnowledgeCache(source.projectId);
        
        if (nextRetryAt) scheduleKnowledgeRepair(sourceId, nextRetryCount);
        return current;
      }
    } catch (err: any) {
      logger.error({ err }, `Raw extraction failed for source ${sourceId}`);
      throw err;
    }
  } catch (error) {
    logger.error({ err: error }, `Error processing source ${sourceId}`);
    const [current] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, sourceId));
    await db.update(knowledgeSources).set({
      status: "FAILED",
      retryCount: 0,
      nextRetryAt: null,
      lastError: (error as any)?.message || (typeof error === 'string' ? error : JSON.stringify(error, Object.getOwnPropertyNames(error as any))),
      updatedAt: new Date(),
    }).where(eq(knowledgeSources.id, sourceId));
    if (current?.projectId) {
      await invalidateKnowledgeCache(current.projectId);
    }
    return current;
  }
}
