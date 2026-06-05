import { Router } from "express";
import { and, eq, desc, inArray, isNotNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import fs from "fs";
import { YoutubeTranscript } from "youtube-transcript";
import { db } from "@workspace/db";
import { projects, chatSessions, messages, projectFiles, knowledgeChunks } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { logger } from "../../lib/logger";

const router = Router();

// ─── Admin routes (require auth) ───────────────────────────────────────────

// GET /projects
router.get("/", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.createdAt));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing projects");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /projects
router.post("/", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { name, description, systemPrompt } = req.body as {
    name?: string;
    description?: string;
    systemPrompt?: string;
  };
  if (!name?.trim() || !systemPrompt?.trim()) {
    res.status(400).json({ error: "name and systemPrompt are required" });
    return;
  }
  try {
    const shareToken = randomUUID().replace(/-/g, "").slice(0, 20);
    const [project] = await db
      .insert(projects)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        systemPrompt: systemPrompt.trim(),
        userId,
        shareToken,
        isActive: true,
      })
      .returning();
    res.status(201).json(project);
  } catch (err) {
    req.log.error({ err }, "Error creating project");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /projects/:id
router.get("/:id", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) { res.status(404).json({ error: "Not found" }); return; }
    if (project.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
    res.json(project);
  } catch (err) {
    req.log.error({ err }, "Error getting project");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /projects/:id
router.patch("/:id", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "Invalid id" }); return;
  }
  const { name, description, systemPrompt, isActive } = req.body as {
    name?: string;
    description?: string;
    systemPrompt?: string;
    isActive?: boolean;
  };
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) { res.status(404).json({ error: "Not found" }); return; }
    if (project.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (systemPrompt !== undefined) updateData.systemPrompt = systemPrompt.trim();
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating project");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /projects/:id
router.delete("/:id", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = req.params.id;
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) { res.status(404).json({ error: "Not found" }); return; }
    if (project.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(projects).where(eq(projects.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting project");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Shared / public routes ─────────────────────────────────────────────────

// GET /projects/share/:token — public project info
router.get("/share/:token", async (req, res) => {
  try {
    const [project] = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        shareToken: projects.shareToken,
        isActive: projects.isActive,
      })
      .from(projects)
      .where(eq(projects.shareToken, req.params.token));
    if (!project || !project.isActive) {
      res.status(404).json({ error: "Project not found or inactive" });
      return;
    }
    res.json(project);
  } catch (err) {
    req.log.error({ err }, "Error getting shared project");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /projects/share/:token/conversations — start a new conversation
router.post("/share/:token/conversations", async (req, res) => {
  try {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.shareToken, req.params.token));
    if (!project || !project.isActive) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const [conv] = await db
      .insert(chatSessions)
      .values({ title: "New Chat", projectId: project.id })
      .returning();
    res.status(201).json(conv);
  } catch (err) {
    req.log.error({ err }, "Error creating shared conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /projects/share/:token/conversations/:convId — get conversation + messages
router.get("/share/:token/conversations/:convId", async (req, res) => {
  const convId = req.params.convId;
  if (!convId) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.shareToken, req.params.token));
    if (!project || !project.isActive) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const [conv] = await db.select().from(chatSessions).where(eq(chatSessions.id, convId as any));
    if (!conv || conv.projectId !== project.id) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, convId as any))
      .orderBy(messages.createdAt);
    res.json({ ...conv, messages: msgs.map(serializeMessage) });
  } catch (err) {
    req.log.error({ err }, "Error getting shared conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

function serializeMessage(message: typeof messages.$inferSelect) {
  return {
    id: message.id,
    conversationId: message.sessionId,
    role: message.sender === "user" ? "user" : "assistant",
    content: message.content,
    fileIds: null,
    createdAt: message.createdAt,
  };
}

function extractYouTubeId(text: string): string[] {
  const pattern =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}

async function fetchYouTubeTranscripts(text: string): Promise<string> {
  const ids = extractYouTubeId(text);
  if (ids.length === 0) return "";
  const parts: string[] = [];
  for (const id of ids) {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(id, { lang: "en" });
      parts.push(`[YouTube Video ID: ${id}]\nTranscript:\n${transcript.map(t => t.text).join(" ").slice(0, 40000)}`);
    } catch {
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(id);
        parts.push(`[YouTube Video ID: ${id}]\nTranscript:\n${transcript.map(t => t.text).join(" ").slice(0, 40000)}`);
      } catch {
        parts.push(`[YouTube Video ID: ${id}]\nNote: Transcript unavailable.`);
      }
    }
  }
  return parts.join("\n\n");
}

async function buildFileParts(fileIds: string[]): Promise<GeminiPart[]> {
  return [];
}

async function buildProjectKnowledgeContext(projectId: string, query: string): Promise<string> {
  if (!query.trim()) return "";

  try {
    const embedRes = await ai.models.embedContent({
      model: "gemini-embedding-2",
      contents: query,
      config: { outputDimensionality: 768 },
    });
    const userVector = embedRes.embeddings?.[0]?.values;
    if (!userVector) return "";

    let chunks = await db
      .select()
      .from(knowledgeChunks)
      .where(and(eq(knowledgeChunks.projectId, projectId), isNotNull(knowledgeChunks.embedding)))
      .orderBy(sql`${knowledgeChunks.embedding} <=> ${JSON.stringify(userVector)}`)
      .limit(6);

    if (chunks.length === 0) {
      chunks = await db
        .select()
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.projectId, projectId))
        .orderBy(desc(knowledgeChunks.createdAt))
        .limit(6);
    }

    if (chunks.length === 0) return "";

    return [
      "Relevant project knowledge:",
      ...chunks.map((chunk, index) => `--- Knowledge ${index + 1} ---\n${chunk.chunkText}`),
    ].join("\n\n");
  } catch (err) {
    logger.error({ err }, "Error retrieving project knowledge");
    return "";
  }
}

// POST /projects/share/:token/conversations/:convId/messages — SSE streaming
router.post("/share/:token/conversations/:convId/messages", async (req, res) => {
  const convId = req.params.convId;
  if (!convId) { res.status(400).json({ error: "Invalid id" }); return; }

  const { content, fileIds } = req.body as { content?: string; fileIds?: string[] };
  if (!content?.trim() && (!fileIds || fileIds.length === 0)) {
    res.status(400).json({ error: "content or fileIds is required" });
    return;
  }

  try {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.shareToken, req.params.token));
    if (!project || !project.isActive) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const [conv] = await db.select().from(chatSessions).where(eq(chatSessions.id, convId as any));
    if (!conv || conv.projectId !== project.id) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const messageContent = content?.trim() ?? "";

    // Save user message
    await db.insert(messages).values({
      sessionId: convId as any,
      sender: "user",
      content: messageContent,
    });

    // Load chat history
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, convId as any))
      .orderBy(messages.createdAt);

    const historyWithoutCurrent = history.slice(0, -1);

    // Build multimodal parts for current message
    const fileParts = fileIds && fileIds.length > 0 ? await buildFileParts(fileIds) : [];
    const youtubeContext = messageContent ? await fetchYouTubeTranscripts(messageContent) : "";
    const ragContext = await buildProjectKnowledgeContext(project.id, messageContent);

    const currentParts: GeminiPart[] = [
      ...fileParts,
      ...(youtubeContext ? [{ text: youtubeContext }] : []),
      ...(ragContext ? [{ text: ragContext }] : []),
      ...(messageContent ? [{ text: messageContent }] : []),
    ];

    // Build Gemini chat — project's systemPrompt replaces the default Aria prompt
    const chatMessages: { role: "user" | "model"; parts: GeminiPart[] }[] = [
      { role: "user", parts: [{ text: project.systemPrompt }] },
      { role: "model", parts: [{ text: "Understood! I'm ready to help based on the provided information. What would you like to know?" }] },
      ...historyWithoutCurrent.map((m) => ({
        role: (m.sender === "assistant" ? "model" : "user") as "user" | "model",
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: currentParts },
    ];

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    let fullResponse = "";

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: chatMessages,
      config: { maxOutputTokens: 8192 },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    // Save assistant message
    await db.insert(messages).values({ sessionId: convId as any, sender: "assistant", content: fullResponse });

    // Auto-title after first exchange
    const allMsgs = await db.select().from(messages).where(eq(messages.sessionId, convId as any));
    const updateData: { title?: string } = {};
    if (allMsgs.length === 2 && conv.title === "New Chat" && messageContent) {
      updateData.title = messageContent.slice(0, 60) + (messageContent.length > 60 ? "…" : "");
    }
    if (Object.keys(updateData).length > 0) {
      await db.update(chatSessions).set(updateData).where(eq(chatSessions.id, convId as any));
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Error in shared chat stream");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
      res.end();
    }
  }
});

export default router;
