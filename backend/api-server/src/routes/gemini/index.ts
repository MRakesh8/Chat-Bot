import { Router } from "express";
import { and, eq, desc, like, inArray, isNotNull } from "drizzle-orm";
import fs from "fs";
import { YoutubeTranscript } from "youtube-transcript";
import { db } from "@workspace/db";
import { chatSessions, messages, projectFiles } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import {
  CreateGeminiConversationBody,
  UpdateGeminiConversationBody,
  SendGeminiMessageBody,
  GetGeminiConversationParams,
  UpdateGeminiConversationParams,
  DeleteGeminiConversationParams,
  ListGeminiMessagesParams,
  SendGeminiMessageParams,
  SearchGeminiConversationsQueryParams,
} from "@workspace/api-zod";

const router = Router();

// GET /gemini/conversations/search - MUST be before /:id routes
router.get("/conversations/search", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const parsed = SearchGeminiConversationsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }
    const { q } = parsed.data;
    const results = await db
      .select()
      .from(chatSessions)
      .where(and(like(chatSessions.title, `%${q}%`), eq(chatSessions.userId, userId)))
      .orderBy(desc(chatSessions.createdAt))
      .limit(20);
    res.json(results.map(serializeConversation));
  } catch (err) {
    req.log.error({ err }, "Error searching conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /gemini/conversations
router.get("/conversations", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const results = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.userId, userId))
      .orderBy(desc(chatSessions.createdAt));
    res.json(results.map(serializeConversation));
  } catch (err) {
    req.log.error({ err }, "Error listing conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /gemini/conversations
router.post("/conversations", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const parsed = CreateGeminiConversationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const projectId = req.body.projectId || null;
    const [conversation] = await db
      .insert(chatSessions)
      .values({ title: parsed.data.title, projectId, userId })
      .returning();
    res.status(201).json(serializeConversation(conversation));
  } catch (err) {
    req.log.error({ err }, "Error creating conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /gemini/conversations/:id
router.get("/conversations/:id", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const parsed = GetGeminiConversationParams.safeParse({ id: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [conversation] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, parsed.data.id), eq(chatSessions.userId, userId)));
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, parsed.data.id))
      .orderBy(messages.createdAt);
    res.json({
      ...serializeConversation(conversation),
      messages: msgs.map(serializeMessage),
    });
  } catch (err) {
    req.log.error({ err }, "Error getting conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /gemini/conversations/:id
router.patch("/conversations/:id", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const paramsParsed = UpdateGeminiConversationParams.safeParse({ id: req.params.id });
    if (!paramsParsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const bodyParsed = UpdateGeminiConversationBody.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const [existing] = await db.select().from(chatSessions).where(eq(chatSessions.id, paramsParsed.data.id));
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ error: "Conversation not found" }); return;
    }
    const [updated] = await db
      .update(chatSessions)
      .set({ title: bodyParsed.data.title })
      .where(eq(chatSessions.id, paramsParsed.data.id))
      .returning();
    res.json(serializeConversation(updated));
  } catch (err) {
    req.log.error({ err }, "Error updating conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /gemini/conversations/:id
router.delete("/conversations/:id", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const parsed = DeleteGeminiConversationParams.safeParse({ id: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [existing] = await db.select().from(chatSessions).where(eq(chatSessions.id, parsed.data.id));
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ error: "Conversation not found" }); return;
    }
    await db.delete(chatSessions).where(eq(chatSessions.id, parsed.data.id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /gemini/conversations/:id/messages
router.get("/conversations/:id/messages", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const parsed = ListGeminiMessagesParams.safeParse({ id: req.params.id });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [existing] = await db.select().from(chatSessions).where(eq(chatSessions.id, parsed.data.id));
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ error: "Conversation not found" }); return;
    }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, parsed.data.id))
      .orderBy(messages.createdAt);
    res.json(msgs.map(serializeMessage));
  } catch (err) {
    req.log.error({ err }, "Error listing messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

const SYSTEM_PROMPT = `You are Aria, a smart and friendly AI personal assistant. You speak like a knowledgeable friend — casual, warm, and clear. You explain things simply like a great teacher, remember context from the conversation, and give direct, helpful answers. You are supportive, curious, and never condescending. Keep responses concise unless detail is needed. Use markdown formatting for code and structured content. When files are shared with you, analyze and describe their content fully and helpfully. When a YouTube transcript is provided in the context, use it to answer questions about the video accurately and in detail. 

CRITICAL DIRECTIVE: You represent a specific Project Brain. If a user asks you a question that cannot be answered using the provided context (Project Knowledge), you must explicitly state that the answer is not in the project's knowledge base. You may offer your general knowledge, but you must make it clear that you are drawing from outside the project's specific files.`;

// Extract YouTube video ID from any YouTube URL format
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
      const fullText = transcript.map((t) => t.text).join(" ");
      parts.push(
        `[YouTube Video ID: ${id}]\nTranscript:\n${fullText.slice(0, 40000)}`
      );
    } catch {
      // Try without language preference as fallback
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(id);
        const fullText = transcript.map((t) => t.text).join(" ");
        parts.push(
          `[YouTube Video ID: ${id}]\nTranscript:\n${fullText.slice(0, 40000)}`
        );
      } catch {
        parts.push(
          `[YouTube Video ID: ${id}]\nNote: This video's transcript is unavailable (disabled by uploader or private video).`
        );
      }
    }
  }
  return parts.join("\n\n");
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

function serializeConversation(conversation: typeof chatSessions.$inferSelect) {
  return {
    ...conversation,
    userId: null,
    updatedAt: conversation.createdAt,
  };
}

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

// POST /gemini/conversations/:id/messages (SSE streaming)
router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const paramsParsed = SendGeminiMessageParams.safeParse({ id: req.params.id });
    if (!paramsParsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const bodyParsed = SendGeminiMessageBody.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const conversationId = paramsParsed.data.id;
    const { content, fileIds } = bodyParsed.data;
    const mode = req.body.mode || "friendly";

    const userId = (req as any).auth?.userId ?? null;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    // Verify conversation exists and belongs to user
    const [conversation] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, conversationId), eq(chatSessions.userId, userId)));
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const { projects } = require("@workspace/db");
    let project = null;
    if (conversation.projectId) {
      const [res] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, conversation.projectId));
      project = res;
    }
    // Save user message
    await db.insert(messages).values({
      sessionId: conversationId as any,
      sender: "user",
      content,
    });

    // Load all previous messages (history before the current one)
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, conversationId))
      .orderBy(messages.createdAt);

    // All messages except the last (just saved) one = chat history
    const historyWithoutCurrent = history.slice(0, -1);

    // Build file parts for the current message
    const fileParts = fileIds && fileIds.length > 0
      ? await buildFileParts(fileIds)
      : [];

    // Fetch YouTube transcripts if any URLs are in the message
    const youtubeContext = await fetchYouTubeTranscripts(content);

    // Vector Search (RAG)
    let ragContext = "";
    try {
      const embedRes = await ai.models.embedContent({
        model: "gemini-embedding-2",
        contents: content,
        config: { outputDimensionality: 768 },
      });
      const userVector = embedRes.embeddings?.[0]?.values;
      
      if (userVector && conversation.projectId) {
        const { sql } = require("drizzle-orm");
        const { knowledgeChunks } = require("@workspace/db");
        
        // Use pgvector cosine distance operator (<=>)
        let similarChunks = await db
          .select()
          .from(knowledgeChunks)
          .where(and(eq(knowledgeChunks.projectId, conversation.projectId), isNotNull(knowledgeChunks.embedding)))
          .orderBy(sql`${knowledgeChunks.embedding} <=> ${JSON.stringify(userVector)}`)
          .limit(5);

        if (similarChunks.length === 0) {
          similarChunks = await db
            .select()
            .from(knowledgeChunks)
            .where(eq(knowledgeChunks.projectId, conversation.projectId))
            .orderBy(desc(knowledgeChunks.createdAt))
            .limit(5);
        }
          
        if (similarChunks.length > 0) {
          ragContext = "Here is some retrieved context from the project's knowledge base that might be helpful:\n\n" + 
            similarChunks.map((c: any) => `--- Chunk ---\n${c.chunkText}`).join("\n\n");
        }
      }
    } catch (err) {
      req.log.error({ err }, "Error performing vector search");
    }

    // Current user message parts: files first, then transcript context, then RAG context, then text
    const currentParts: GeminiPart[] = [
      ...fileParts,
      ...(youtubeContext ? [{ text: youtubeContext }] : []),
      ...(ragContext ? [{ text: ragContext }] : []),
      ...(content.trim() ? [{ text: content }] : []),
    ];

    let finalSystemPrompt = project?.systemPrompt || SYSTEM_PROMPT;
    if (mode === "expert") {
      finalSystemPrompt += "\n\nCRITICAL INSTRUCTION: The user has selected EXPERT mode. Answer with highly technical, precise terminology, omitting casual pleasantries.";
    } else if (mode === "client") {
      finalSystemPrompt += "\n\nCRITICAL INSTRUCTION: The user has selected CLIENT mode. Answer in a highly professional, business-appropriate tone, suitable for external clients.";
    } else if (mode === "teacher") {
      finalSystemPrompt += "\n\nCRITICAL INSTRUCTION: The user has selected TEACHER mode. Break down complex topics step-by-step and explain them as if you are teaching a beginner.";
    } else if (mode === "analyst") {
      finalSystemPrompt += "\n\nCRITICAL INSTRUCTION: The user has selected BUSINESS ANALYST mode. Focus on metrics, strategic implications, return on investment, and structured analytical breakdowns.";
    }

    // Build full chat history for Gemini
    const chatMessages: { role: "user" | "model"; parts: GeminiPart[] }[] = [
      { role: "user", parts: [{ text: finalSystemPrompt }] },
      { role: "model", parts: [{ text: "Got it! I'm Aria, ready to help. What's on your mind?" }] },
      // Previous messages (text only — files already described in prior turns)
      ...historyWithoutCurrent.map((m) => ({
        role: (m.sender === "assistant" ? "model" : "user") as "user" | "model",
        parts: [{ text: m.content }],
      })),
      // Current user message with full multimodal parts
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
    await db.insert(messages).values({
      sessionId: conversationId as any,
      sender: "assistant",
      content: fullResponse,
    });

    // Count total messages to detect first exchange (user + assistant = 2)
    const allMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, conversationId as any));

    const updateData: { title?: string } = {};

    if (allMessages.length === 2 && conversation.title === "New Chat") {
      const autoTitle = content.trim().slice(0, 60) + (content.trim().length > 60 ? "…" : "");
      updateData.title = autoTitle;
    }

    if (Object.keys(updateData).length > 0) {
      await db.update(chatSessions).set(updateData).where(eq(chatSessions.id, conversationId as any));
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    req.log.error({ err }, "Error in streaming message");
    
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
