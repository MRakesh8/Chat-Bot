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

const PRESENCE_CACHE_PRESENT_TTL_MS = 60_000;
const PRESENCE_CACHE_EMPTY_TTL_MS = 15_000;
const MAX_PRESENCE_CACHE_ENTRIES = 1000;
const QUERY_EMBED_CACHE_TTL_MS = 15 * 60_000;
const MAX_QUERY_EMBED_CACHE_ENTRIES = 500;
const EMBED_TIMEOUT_MS = 2500;

interface PresenceEntry {
  hasSources: boolean;
  hasEmbeddedChunks: boolean;
  expiresAt: number;
}

const projectKnowledgePresenceCache = new Map<string, PresenceEntry>();
const presenceInFlight = new Map<string, Promise<{ hasSources: boolean; hasEmbeddedChunks: boolean }>>();
const queryEmbeddingCache = new Map<string, { vector: number[]; expiresAt: number }>();

/**
 * C2 Fix — Per-project knowledge epoch versioning.
 *
 * Every time knowledge content changes (insert, update, delete, reprocess, category change),
 * `invalidateKnowledgeCache` bumps the epoch for that project. The epoch is baked into every
 * `rag_search_*` cache key, so old entries in both the local LRU and Redis are bypassed
 * immediately without iterating through cache entries.
 *
 * The epoch is intentionally in-process only (no DB) so it resets on restart — that is correct
 * behaviour: a fresh process always starts with a clean local embedding cache.
 */
const knowledgeEpochMap = new Map<string, number>();

function getKnowledgeEpoch(projectId: string): number {
  return knowledgeEpochMap.get(projectId) ?? 0;
}

function bumpKnowledgeEpoch(projectId: string): number {
  const next = (knowledgeEpochMap.get(projectId) ?? 0) + 1;
  knowledgeEpochMap.set(projectId, next);
  return next;
}


function setBoundedMapEntry<V>(map: Map<string, V>, key: string, value: V, maxEntries: number) {
  if (map.has(key)) map.delete(key);
  while (map.size >= maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
  map.set(key, value);
}

async function getProjectKnowledgePresence(projectIds: string[]): Promise<{ hasSources: boolean; hasEmbeddedChunks: boolean }> {
  if (projectIds.length !== 1) {
    return { hasSources: true, hasEmbeddedChunks: true };
  }
  const projectId = projectIds[0];
  const now = Date.now();
  const cached = projectKnowledgePresenceCache.get(projectId);
  if (cached && cached.expiresAt > now) {
    return { hasSources: cached.hasSources, hasEmbeddedChunks: cached.hasEmbeddedChunks };
  }

  const inflight = presenceInFlight.get(projectId);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const [sourceRows, chunkRows] = await Promise.all([
        db
          .select({ id: knowledgeSources.id })
          .from(knowledgeSources)
          .where(eq(knowledgeSources.projectId, projectId))
          .limit(1),
        db
          .select({ id: knowledgeChunks.id })
          .from(knowledgeChunks)
          .where(and(eq(knowledgeChunks.projectId, projectId), isNotNull(knowledgeChunks.embedding)))
          .limit(1),
      ]);
      const result = {
        hasSources: Array.isArray(sourceRows) && sourceRows.length > 0,
        hasEmbeddedChunks: Array.isArray(chunkRows) && chunkRows.length > 0,
      };
      const ttl = result.hasSources ? PRESENCE_CACHE_PRESENT_TTL_MS : PRESENCE_CACHE_EMPTY_TTL_MS;
      setBoundedMapEntry(
        projectKnowledgePresenceCache,
        projectId,
        { ...result, expiresAt: Date.now() + ttl },
        MAX_PRESENCE_CACHE_ENTRIES
      );
      return result;
    } catch {
      // Fail open on probe error so retrieval still executes
      return { hasSources: true, hasEmbeddedChunks: true };
    } finally {
      presenceInFlight.delete(projectId);
    }
  })();

  presenceInFlight.set(projectId, task);
  return task;
}

export function buildCompositeText(parts: Array<string | null | undefined>, maxChars = 2800): string {
  const seenNormalized = new Set<string>();
  const uniqueParts: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    const trimmed = part.trim();
    if (!trimmed) continue;
    const norm = trimmed.toLowerCase().replace(/\s+/g, " ");
    if (seenNormalized.has(norm)) continue;
    // Skip substring duplication when an existing larger section already includes this exact summary/snippet
    if (uniqueParts.some((p) => p.toLowerCase().replace(/\s+/g, " ").includes(norm))) continue;
    seenNormalized.add(norm);
    uniqueParts.push(trimmed);
  }
  const combined = uniqueParts.join("\n\n");
  return combined.length > maxChars ? `${combined.slice(0, maxChars)}\n...` : combined;
}

async function embedWithTimeout(
  userId: string | null,
  query: string,
  embeddingApiKey?: string,
  signal?: AbortSignal,
  timeoutMs = EMBED_TIMEOUT_MS
): Promise<number[] | null> {
  if (signal?.aborted) return null;
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const embedPromise = ai.models.embedContent(userId, {
      model: "text-embedding-004",
      contents: query,
      ...(embeddingApiKey ? { apiKey: embeddingApiKey } : {}),
      config: {
        outputDimensionality: 768,
        ...(signal ? { abortSignal: signal } : {}),
      },
    });
    const guardPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Embedding timeout after ${timeoutMs}ms`)), timeoutMs);
      if (signal) {
        onAbort = () => reject(new Error("Embedding aborted"));
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
    const embedRes: any = await Promise.race([embedPromise, guardPromise]);
    const values = embedRes?.embeddings?.[0]?.values;
    return Array.isArray(values) && values.length > 0 ? values : null;
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}

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
  // 1. Bump the per-project knowledge epoch. Because rag_search_* cache keys embed the epoch,
  //    all previously cached results for this project are silently skipped — no need to enumerate
  //    or delete individual llmResponseCache entries. This is O(1) and works across both the
  //    local BoundedLocalCache LRU and Redis L2 without any race conditions.
  bumpKnowledgeEpoch(projectId);

  // 2. Clear in-process presence cache so the next request re-checks existence.
  projectKnowledgePresenceCache.delete(projectId);
  presenceInFlight.delete(projectId);

  // 3. Clear the DB-backed retrieval cache for this project (legacy path, belt-and-suspenders).
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

/**
 * Sanitizes retrieved website & knowledge base content to neutralize prompt injection tokens
 * and delimiter spoofing attempts.
 */
export function sanitizeRetrievedText(text: string): string {
  if (!text) return "";
  return text
    // Neutralize prompt boundary delimiter tags that attackers might embed in web pages
    .replace(/\[\/?(BEGIN|END)\s+[^\]]+\]/gi, "")
    .replace(/\[\/?(SYSTEM|INSTRUCTION|ASSISTANT|ADMIN|USER|PROMPT)[^\]]*\]/gi, "")
    .replace(/<\/?(?:system|instruction|prompt)[^>]*>/gi, "")
    .replace(/<<<[^>]+>>>/g, "")
    // Defang markdown image exfiltration URLs
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/gi, "[Image: $1]")
    // Neutralize common adversarial prompt injection directives
    .replace(/(?:^|\n)\s*(?:system\s*override|ignore\s+(?:all\s+)?previous\s+instructions|disregard\s+all\s+(?:rules|instructions)|you\s+are\s+now\s+in\s+developer\s+mode|reveal\s+(?:your\s+)?(?:system\s+prompt|api\s*key|credentials|secret))[\s\S]*?(?=\n|$)/gi, "\n[Notice: Redacted untrusted directive from external source]\n")
    .trim();
}

export async function searchProjectKnowledge(params: {
  projectIds: string[];
  userId: string | null;
  customerId?: string | null;
  query: string;
  limit?: number;
  ragIntent?: string;
  signal?: AbortSignal;
  embeddingApiKey?: string;
  widgetOnly?: boolean;  // P2 Fix: when true, only sources with isWidgetExposed=true are returned
  onTiming?: (stage: string, durationMs: number, meta?: Record<string, any>) => void;
}): Promise<{ contextString: string, retrievedIds: string[], candidates?: any[] }> {
  const retrievalStart = Date.now();
  const emitRetrievalTiming = (meta?: Record<string, any>) => {
    params.onTiming?.("knowledge_retrieval", Date.now() - retrievalStart, meta);
  };

  if (params.projectIds.length === 0 || !params.query.trim() || params.signal?.aborted) {
    emitRetrievalTiming({ skipped: true, retrievedCount: 0 });
    return { contextString: "", retrievedIds: [] };
  }

  // RAG Cache (5m TTL) — Bypassed for anonymous/public visitors to prevent cross-customer cache leakage.
  // Cache is strictly used when a trusted user/customer identity scope exists.
  // C2 Fix: the cache key now embeds the per-project knowledge epoch so any call to
  // invalidateKnowledgeCache(projectId) automatically invalidates all matching rag_search_* entries
  // without needing to enumerate or delete them — the new epoch produces a new hash.
  const isAnonymousPublic = !params.userId || params.userId === "public_visitor" || params.userId === "public";
  const epoch = params.projectIds.length === 1 ? getKnowledgeEpoch(params.projectIds[0]) : 0;
  const userScopeKey = params.customerId ? `cust_${params.customerId}` : (params.userId ? `usr_${params.userId}` : null);
  const queryHash = userScopeKey && !isAnonymousPublic
    ? nodeCrypto.createHash("sha256").update(`${params.projectIds.join(",")}:${userScopeKey}:ep${epoch}:${params.query.trim().toLowerCase()}`).digest("hex")
    : null;

  if (queryHash) {
    const cachedResultStr = await llmResponseCache.get(`rag_search_${queryHash}`);
    if (cachedResultStr) {
      try {
        const parsed = JSON.parse(cachedResultStr);
        if (parsed && parsed.contextString !== undefined) {
          emitRetrievalTiming({ cacheHit: true, retrievedCount: parsed.retrievedIds?.length ?? 0 });
          return parsed;
        }
      } catch {
        // Ignore parse error and proceed with search
      }
    }
  }

  // Fast presence probe: avoid table ilike scans and remote embedding API calls when project KB is empty
  const presence = await getProjectKnowledgePresence(params.projectIds);
  if (!presence.hasSources) {
    emitRetrievalTiming({ skippedEmptyKb: true, retrievedCount: 0 });
    return { contextString: "", retrievedIds: [] };
  }

  // 1. Candidate Generation with Domain-Aware Query Expansion
  const fetchLimit = 15;
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

  const rawWords = params.query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  // Query Expansion for high-frequency intent domains (domain-generic)
  const expandedTerms = new Set<string>(rawWords);
  const lowerQuery = params.query.toLowerCase();

  if (lowerQuery.match(/\b(skills?|tech(nology|nologies)?|stack|frameworks?|languages?|expertise|proficienc(y|ies))\b/i)) {
    ["skills", "technologies", "specializes", "stack", "tools", "languages", "frameworks", "expertise", "capabilities"].forEach(t => expandedTerms.add(t));
  }
  if (lowerQuery.match(/\b(projects?|built|builds|portfolio|created|develop(ed|ment)?|apps?|solutions?|case\s*stud(y|ies))\b/i)) {
    ["projects", "built", "completed", "features", "platform", "website", "portfolio", "solutions", "work"].forEach(t => expandedTerms.add(t));
  }
  if (lowerQuery.match(/\b(educat(ion|ed)?|degree|undergraduate|study|college|university|background|qualificat(ion|ions))\b/i)) {
    ["education", "degree", "qualifications", "background", "certifications", "training", "academic"].forEach(t => expandedTerms.add(t));
  }
  if (lowerQuery.match(/\b(services?|offer(s|ing)?|solutions?|capabilities|consult(ing|ation)?)\b/i)) {
    ["services", "specializes", "development", "solutions", "offerings", "capabilities"].forEach(t => expandedTerms.add(t));
  }
  if (lowerQuery.match(/\b(contact|reach|email|phone|whatsapp|call|talk|discuss|hire|hire me|connect|location|address)\b/i)) {
    ["contact", "whatsapp", "phone", "email", "discussion", "quotation", "support", "location"].forEach(t => expandedTerms.add(t));
  }
  if (lowerQuery.match(/\b(who|about|profile|bio|background|team|founder|creator|leadership)\b/i)) {
    ["profile", "about", "team", "founder", "creator", "experience", "leadership", "bio"].forEach(t => expandedTerms.add(t));
  }
  if (lowerQuery.match(/\b(cost|price|pricing|rates?|quote|quotation|charge|fee)\b/i)) {
    ["pricing", "plans", "cost", "quotation", "rates", "scope", "estimate"].forEach(t => expandedTerms.add(t));
  }

  const words = uniqueStrings(Array.from(expandedTerms), 15);
  const customerCondition = params.customerId
    ? or(sql`${knowledgeSources.customerId} IS NULL`, eq(knowledgeSources.customerId, params.customerId))
    : sql`${knowledgeSources.customerId} IS NULL`;
  // P2 Fix: when called from the public widget, only retrieve sources explicitly marked as widget-exposed
  const widgetExposedCondition = params.widgetOnly ? eq(knowledgeSources.isWidgetExposed, true) : undefined;

  // Run metadata keyword scan and vector embedding + HNSW search concurrently
  const metadataPromise = (async (): Promise<Array<any>> => {
    if (words.length === 0 || params.signal?.aborted) return [];
    const conditions = words.flatMap((word) => [
      ilike(knowledgeCategories.name, `%${word}%`),
      ilike(knowledgeSources.tag, `%${word}%`),
      ilike(knowledgeSources.title, `%${word}%`),
      ilike(knowledgeSources.notes, `%${word}%`),
      ilike(knowledgeSources.summary, `%${word}%`),
      ilike(knowledgeSources.keywordIndex, `%${word}%`),
      ilike(knowledgeSources.rawContent, `%${word}%`),
      ilike(knowledgeSources.sourceUrl, `%${word}%`),
    ]);

    return db
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
      .where(and(inArray(knowledgeSources.projectId, params.projectIds), or(...conditions), customerCondition, widgetExposedCondition))
      .limit(fetchLimit);
  })();

  const vectorPromise = (async (): Promise<Array<any>> => {
    if (!presence.hasEmbeddedChunks || params.signal?.aborted) {
      return [];
    }
    const vectorStart = Date.now();
    let embedCacheHit = false;
    let chunksFound = 0;
    try {
      const normQuery = params.query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 500);
      const keyFingerprint = params.embeddingApiKey
        ? nodeCrypto.createHash("sha256").update(params.embeddingApiKey).digest("hex").slice(0, 12)
        : "env";
      const embedCacheKey = nodeCrypto.createHash("sha256").update(`${keyFingerprint}:${normQuery}`).digest("hex");
      const cachedEmbed = queryEmbeddingCache.get(embedCacheKey);

      let userVector: number[] | null = null;
      if (cachedEmbed && cachedEmbed.expiresAt > Date.now()) {
        embedCacheHit = true;
        userVector = cachedEmbed.vector;
      } else {
        userVector = await embedWithTimeout(
          params.userId,
          params.query,
          params.embeddingApiKey,
          params.signal,
          EMBED_TIMEOUT_MS
        );
        if (userVector) {
          setBoundedMapEntry(
            queryEmbeddingCache,
            embedCacheKey,
            { vector: userVector, expiresAt: Date.now() + QUERY_EMBED_CACHE_TTL_MS },
            MAX_QUERY_EMBED_CACHE_ENTRIES
          );
        }
      }

      if (userVector && !params.signal?.aborted) {
        const rows = await db
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
          .where(and(inArray(knowledgeChunks.projectId, params.projectIds), isNotNull(knowledgeChunks.embedding), customerCondition, widgetExposedCondition))
          .orderBy(sql`${knowledgeChunks.embedding} <=> ${JSON.stringify(userVector)}`)
          .limit(fetchLimit);
        chunksFound = rows.length;
        return rows;
      }
      return [];
    } catch (err) {
      if (!params.signal?.aborted) {
        logger.error({ err }, "Vector knowledge search failed");
      }
      return [];
    } finally {
      params.onTiming?.("vector_search", Date.now() - vectorStart, { embedCacheHit, chunksFound });
    }
  })();

  const [metadataMatches, similarChunks] = await Promise.all([metadataPromise, vectorPromise]);

  if (metadataMatches.length === 0 && similarChunks.length === 0) {
    emitRetrievalTiming({ retrievedCount: 0 });
    return { contextString: "", retrievedIds: [] };
  }

  // C1 Fix: Per-document character budget — increased from 2800 to allow more content from large docs.
  const PER_DOC_MAX_CHARS = 4000;
  const candidatesMap = new Map<string, any>();

  for (const match of metadataMatches) {
    const id = match.id;
    if (!candidatesMap.has(id)) {
      const compositeText = buildCompositeText([match.notes, match.rawContent, match.summary], PER_DOC_MAX_CHARS);
      candidatesMap.set(id, {
        ...match,
        isVectorMatch: false,
        contentText: compositeText || match.rawContent || "",
        // Track accumulated chunk snippets to prevent duplicate appending across multiple vector hits
        _mergedChunkSnippets: new Set<string>(),
      });
    }
  }

  for (const chunk of similarChunks) {
    const id = chunk.sourceId;
    // A "good" chunk is sufficiently long and comes from a document longer than the per-doc limit
    // — these are the chunks most likely to contain tail facts invisible to keyword truncation.
    const isSubstantialChunk = chunk.chunkText && chunk.chunkText.trim().length >= 80;
    const isLargeDoc = (chunk.rawContent?.length ?? 0) > PER_DOC_MAX_CHARS;
    const chunkBody = (isSubstantialChunk && isLargeDoc) ? chunk.chunkText : (chunk.chunkText || chunk.rawContent);

    if (id && !candidatesMap.has(id)) {
      // Vector-only hit: build content from the chunk directly
      const compositeText = buildCompositeText([chunk.notes, chunkBody, chunk.summary], PER_DOC_MAX_CHARS);
      candidatesMap.set(id, {
        ...chunk,
        id: chunk.sourceId,
        isVectorMatch: true,
        contentText: compositeText || chunk.chunkText || "",
        _mergedChunkSnippets: new Set<string>([chunkBody?.slice(0, 60) ?? ""]),
      });
    } else if (id && candidatesMap.has(id)) {
      // C1 Fix — Document already in map (from keyword search).
      // The existing contentText may be a prefix-truncated version of a large document.
      // If this vector chunk provides a distinct passage not already present, append it.
      const existing = candidatesMap.get(id);
      existing.isVectorMatch = true;

      if (chunkBody && chunkBody.trim().length >= 80) {
        const snippetKey = chunkBody.trim().slice(0, 60).toLowerCase();
        const alreadyMerged = existing._mergedChunkSnippets?.has(snippetKey);
        const alreadyPresent = existing.contentText.toLowerCase().includes(snippetKey);

        if (!alreadyMerged && !alreadyPresent) {
          // Append the vector-matched chunk as an additional passage, respecting the per-doc limit
          const separator = "\n\n";
          const appended = existing.contentText + separator + chunkBody.trim();
          if (appended.length <= PER_DOC_MAX_CHARS) {
            existing.contentText = appended;
          } else if (existing.contentText.length < PER_DOC_MAX_CHARS - 200) {
            // Partial append — keep as much of the new chunk as fits
            const remaining = PER_DOC_MAX_CHARS - existing.contentText.length - separator.length;
            if (remaining > 100) {
              existing.contentText = existing.contentText + separator + chunkBody.trim().slice(0, remaining) + "\n...";
            }
          }
          existing._mergedChunkSnippets = existing._mergedChunkSnippets ?? new Set();
          existing._mergedChunkSnippets.add(snippetKey);
        }
      } else if (!existing.contentText || existing.contentText.length < 50) {
        // Fallback: existing entry has essentially no content, use this chunk
        existing.contentText = buildCompositeText([chunk.notes, chunkBody, chunk.summary], PER_DOC_MAX_CHARS);
      }
    }
  }


  const queryStr = params.query.toLowerCase().trim();
  const queryTerms = words.map(w => w.toLowerCase());
  const scoredCandidates: Array<any> = [];

  for (const candidate of candidatesMap.values()) {
    const lowerTag = (candidate.tag || "").toLowerCase();
    const lowerCategory = (candidate.categoryName || "").toLowerCase();
    const lowerTitle = (candidate.title || "").toLowerCase();
    const lowerContent = (candidate.contentText || "").toLowerCase();
    const lowerNotes = (candidate.notes || "").toLowerCase();
    const lowerSummary = (candidate.summary || "").toLowerCase();
    const fullSourceText = `${lowerTitle} ${lowerTag} ${lowerCategory} ${lowerContent} ${lowerNotes} ${lowerSummary}`;

    let tagScore = 0;
    let categoryScore = 0;
    let keywordScore = 0;
    let entityScore = 0;
    let vectorScore = candidate.isVectorMatch ? 120 : 0; 
    let intentScore = 0;

    if (lowerTag === queryStr) {
      tagScore = 200;
    } else if (lowerTag && (lowerTag.includes(queryStr) || queryTerms.some(t => lowerTag.includes(t)))) {
      tagScore = 120;
    }

    if (lowerCategory && (lowerCategory.includes(queryStr) || queryTerms.some(t => lowerCategory.includes(t)))) {
      categoryScore = 100;
    }

    const isExactEntity = lowerTitle === queryStr || lowerTag.split('/').map((s: string) => s.trim()).includes(queryStr);
    if (isExactEntity) {
      entityScore = 200;
    } else if (queryStr && fullSourceText.includes(queryStr)) {
      entityScore = 100;
    }

    // Keyword & Expanded Term Scoring
    let matchedTermsCount = 0;
    for (const term of queryTerms) {
      if (fullSourceText.includes(term)) {
        matchedTermsCount++;
      }
    }
    keywordScore = Math.min(matchedTermsCount * 40, 240);

    // Intent-Aware Ranking Boost
    if (params.ragIntent) {
      if (params.ragIntent === "GENERAL_OVERVIEW") {
        if (lowerCategory.includes("overview") || lowerCategory.includes("website") || lowerCategory.includes("about") || lowerTag.includes("homepage") || lowerTag.includes("about") || fullSourceText.includes("specializes") || fullSourceText.includes("portfolio")) {
          intentScore += 200;
        }
      } else if (params.ragIntent === "HOW_TO") {
        if (lowerCategory.includes("how-to") || lowerCategory.includes("instructions") || lowerCategory.includes("guide")) {
          intentScore += 150;
        }
      } else if (params.ragIntent === "PRICING") {
        if (lowerCategory.includes("pricing") || lowerTag.includes("cost") || lowerTag.includes("billing") || fullSourceText.includes("pricing") || fullSourceText.includes("quotation")) {
          intentScore += 220;
        }
      } else if (params.ragIntent === "CONTACT") {
        if (fullSourceText.includes("whatsapp") || fullSourceText.includes("phone") || fullSourceText.includes("email") || fullSourceText.includes("contact")) {
          intentScore += 220;
        }
      }
    }

    let score = tagScore + categoryScore + keywordScore + entityScore + vectorScore + intentScore;
    scoredCandidates.push({ ...candidate, retrievalScore: score });
  }

  // 3. Sorting and Anti-Pollution Guard
  scoredCandidates.sort((a, b) => b.retrievalScore - a.retrievalScore);
  
  // Require minimum relevance score floor to prevent retrieving noise when no evidence exists
  const MIN_RELEVANCE_SCORE = 60;
  let topCandidates = scoredCandidates.filter(c => c.retrievalScore >= MIN_RELEVANCE_SCORE);

  if (topCandidates.length > 0) {
    const topScore = topCandidates[0].retrievalScore;
    // Anti-Pollution Guard: Discard tail candidates with score < 35% of top score,
    // while preserving any semantically relevant vector matches or high-confidence entity matches
    // that still meet the relevance floor.
    topCandidates = topCandidates.filter(
      c => c.retrievalScore >= Math.max(MIN_RELEVANCE_SCORE, topScore * 0.35) ||
           (c.isVectorMatch && c.retrievalScore >= MIN_RELEVANCE_SCORE)
    );
  }
  
  topCandidates = topCandidates.slice(0, params.limit ?? 5);

  // 4. Logging (avoid logging raw private visitor query text)
  let debugLog = `QueryChars: ${params.query.length}\n\n`;
  topCandidates.forEach((c, index) => {
    debugLog += `Candidate ${index + 1}:\nCategory: ${c.categoryName || "Uncategorized"}\nTag: ${c.tag || "None"}\nScore: ${c.retrievalScore}\n\n`;
  });
  logger.info(`[Retrieval Ranking]\n${debugLog.trim()}`);

  // 5. Context Formatting — Clean signal without noisy internal tags, sanitized against prompt injection
  const MAX_CHARS = 7000;
  let currentChars = 0;

  const finalItems: string[] = [];
  const retrievedIdsSet = new Set<string>();

  for (const candidate of topCandidates) {
    const titleLabel = candidate.title && candidate.title !== "null" ? candidate.title : (candidate.categoryName && candidate.categoryName !== "Uncategorized" ? candidate.categoryName : "Knowledge Base Reference");
    const cleanContent = sanitizeRetrievedText(candidate.contentText.trim());
    if (!cleanContent) continue;

    let itemStr = `[Knowledge Reference: ${titleLabel}]\n${cleanContent}`;
    
    if (candidate.sourceUrl && candidate.sourceUrl !== "null" && candidate.sourceUrl.startsWith("http")) {
      itemStr += `\nReference URL: ${candidate.sourceUrl}`;
    }
    
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

  // Save to cache for 5 minutes only for authenticated/scoped requests.
  // queryHash is null for anonymous/public visitors so they never pollute the shared cache.
  if (queryHash) {
    await llmResponseCache.set(`rag_search_${queryHash}`, JSON.stringify(finalResult), 300);
  }

  emitRetrievalTiming({
    cacheHit: false,
    retrievedCount: finalResult.retrievedIds.length,
    contextChars: finalResult.contextString.length,
  });

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
        contents: `Please summarize and provide a detailed structured text representation of the following YouTube video transcript: \n\n${transcript.slice(0, 50000)}`,
        projectId: params.projectId,
      });
      extractedText = res.text || transcript;
    } catch (err) {
      logger.warn({ err }, `YouTube transcript failed for ${videoId}. Falling back to direct URL Gemini summarization.`);
      const res = await ai.models.generateContent(params.userId || null, {
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
                model: "text-embedding-004",
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
