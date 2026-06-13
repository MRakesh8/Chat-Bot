import { Router } from "express";
import { and, eq, desc, inArray, isNotNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import fs from "fs";
import { db } from "@workspace/db";
import { projects, knowledgeSources, chatSessions, messages, knowledgeChunks, projectSettings } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { logger } from "../../lib/logger";
import { fetchYouTubeTranscriptsForMessage } from "../../lib/youtube";
import { searchProjectKnowledge } from "../../services/knowledge";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string({ required_error: "name is required" }).trim().min(1, "name is required"),
  description: z.string().trim().optional().nullable(),
  systemPrompt: z.string({ required_error: "systemPrompt is required" }).trim().min(1, "systemPrompt is required"),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "name cannot be empty").optional(),
  description: z.string().trim().optional().nullable(),
  systemPrompt: z.string().trim().min(1, "systemPrompt cannot be empty").optional(),
  isActive: z.boolean().optional(),
});

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
  } catch (err: any) {
    req.log.error({ err }, "Error listing projects");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
});

// POST /projects
router.post("/", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const { name, description, systemPrompt } = parsed.data;

  try {
    const shareToken = randomUUID().replace(/-/g, "").slice(0, 20);
    const [project] = await db
      .insert(projects)
      .values({
        name,
        description,
        systemPrompt,
        userId,
        shareToken,
        isActive: true,
      })
      .returning();
    res.status(201).json(project);
  } catch (err: any) {
    req.log.error({ err: err.message || err }, "Error creating project");
    res.status(500).json({ error: "Internal server error", details: err.message });
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
  } catch (err: any) {
    req.log.error({ err }, "Error getting project");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
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
  
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const { name, description, systemPrompt, isActive } = parsed.data;

  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) { res.status(404).json({ error: "Not found" }); return; }
    if (project.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (systemPrompt !== undefined) updateData.systemPrompt = systemPrompt;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, id))
      .returning();
    res.json(updated);
  } catch (err: any) {
    req.log.error({ err: err.message || err }, "Error updating project");
    res.status(500).json({ error: "Internal server error", details: err.message });
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
  } catch (err: any) {
    req.log.error({ err }, "Error deleting project");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
});

const addKnowledgeFromChatSchema = z.object({
  contents: z.array(z.string().min(1)),
});

// POST /projects/:id/knowledge/from-chat
router.post("/:id/knowledge/from-chat", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = req.params.id;
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  
  const parsed = addKnowledgeFromChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid contents array" });
    return;
  }
  
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) { res.status(404).json({ error: "Not found" }); return; }
    if (project.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

    const { contents } = parsed.data;
    
    // Embed and insert each message as a knowledge chunk
    for (const content of contents) {
      const embedRes = await ai.models.embedContent(userId, {
        model: "gemini-embedding-2",
        contents: content,
        config: { outputDimensionality: 768 },
      });
      const embedding = embedRes.embeddings?.[0]?.values;
      if (embedding) {
        await db.insert(knowledgeChunks).values({
          projectId: id as any,
          chunkText: content,
          embedding: embedding as any,
        });
      }
    }
    
    res.status(200).json({ success: true });
  } catch (err: any) {
    req.log.error({ err: err.message || err }, "Error adding knowledge from chat");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
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
  } catch (err: any) {
    req.log.error({ err }, "Error getting shared project");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
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
  } catch (err: any) {
    req.log.error({ err }, "Error creating shared conversation");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
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
  } catch (err: any) {
    req.log.error({ err }, "Error getting shared conversation");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
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

async function buildFileParts(fileIds: string[]): Promise<GeminiPart[]> {
  return [];
}

async function buildProjectKnowledgeContext(projectId: string, userId: string, query: string): Promise<string> {
  if (!query.trim()) return "";

  try {
    const { contextString } = await searchProjectKnowledge({
      projectIds: [projectId],
      userId,
      query,
      limit: 6
    });
    
    if (!contextString) return "";

    return "Relevant project knowledge:\n" + contextString;
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
    const youtubeContext = messageContent ? await fetchYouTubeTranscriptsForMessage(messageContent) : "";
    const ragContext = await buildProjectKnowledgeContext(project.id, project.userId, messageContent);

    const currentParts: GeminiPart[] = [
      ...fileParts,
      ...(youtubeContext ? [{ text: youtubeContext }] : []),
      ...(ragContext ? [{ text: ragContext }] : []),
      ...(messageContent ? [{ text: messageContent }] : []),
    ];

    const PROJECT_BRAIN_DIRECTIVE = `\n\nCRITICAL DIRECTIVE: You are acting as a specific Project Brain.\n\nPROJECT AI BEHAVIOR HIERARCHY\n1. Project Instructions (Highest Priority)\n   - Tone, Personality, Rules, Workflow, Response style\n2. Relevant Project Knowledge\n   - Facts, Documents, Knowledge Base entries\n3. User Message\n4. Model General Knowledge\n\nRules:\n- Always follow Project Instructions.\n- Use Project Knowledge when relevant.\n- If Project Knowledge contains the answer, use it.\n- If Project Instructions define behavior, always obey them.\n- General model knowledge is only a fallback.\n\nTreat the Knowledge & Instructions text as authoritative project knowledge, not just behavior guidance. If the user's question cannot be answered using the provided project knowledge or retrieved chunks, explicitly state that the answer is not in the project knowledge. Then, and only then, you may offer general knowledge, clearly labeled as outside the project's knowledge.\n\nCRITICAL OUTPUT RULE: NEVER include internal references, knowledge IDs, generic source IDs, debug information, or retrieval metadata in your response. Do NOT start responses with phrases like "Based on the Project Knowledge" or "According to the provided context". Integrate the knowledge naturally and directly.`;

    // Build Gemini chat — project's systemPrompt replaces the default Aria prompt
    const chatMessages: { role: "user" | "model"; parts: GeminiPart[] }[] = [
      { role: "user", parts: [{ text: project.systemPrompt + PROJECT_BRAIN_DIRECTIVE }] },
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
    let streamStarted = false;

    try {
      const stream = await ai.models.generateContentStream(project.userId, {
        model: "gemini-2.5-flash",
        contents: chatMessages,
        config: { maxOutputTokens: 8192 },
      });

      for await (const chunk of stream) {
        streamStarted = true;
        const text = chunk.text;
        if (text) {
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      }
    } catch (err: any) {
      logger.error({ err }, "Error generating stream in project chat");
      
      const isQuotaError = err?.type === "quota_exceeded";
      const status = err?.status || err?.response?.status;
      const isBusy = isQuotaError || status === 429 || status === 503 || err?.message?.includes("429") || err?.message?.includes("503");
      const errorMessage = isQuotaError ? err.message : (isBusy ? "AI service is temporarily busy. Please try again in a few moments." : (err?.message || "Internal server error"));

      if (!res.headersSent) {
        if (isBusy || isQuotaError) {
          res.status(200).json({ error: errorMessage });
          return;
        } else {
          res.status(500).json({ error: errorMessage });
          return;
        }
      } else {
        res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      }
    }

    // Save assistant message if there was a response
    if (fullResponse) {
      await db.insert(messages).values({ sessionId: convId as any, sender: "assistant", content: fullResponse });
    }


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
  } catch (err: any) {
    req.log.error({ err }, "Error in shared chat stream");
    
    const status = err?.status || err?.response?.status;
    const isRateLimited = status === 429 || err?.message?.includes("429");

    if (!res.headersSent) {
      if (isRateLimited) {
        res.status(429).json({ error: "AI service is busy. Please try again later." });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    } else {
      if (isRateLimited) {
        res.write(`data: ${JSON.stringify({ error: "AI service is busy. Please try again later." })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
      }
      res.end();
    }
  }
});

export default router;
