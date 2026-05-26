import { Router } from "express";
import { eq, desc, like, inArray } from "drizzle-orm";
import fs from "fs";
import { YoutubeTranscript } from "youtube-transcript";
import { db } from "@workspace/db";
import { conversations, messages, uploadedFiles } from "@workspace/db";
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
  try {
    const parsed = SearchGeminiConversationsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query params" });
      return;
    }
    const { q } = parsed.data;
    const results = await db
      .select()
      .from(conversations)
      .where(like(conversations.title, `%${q}%`))
      .orderBy(desc(conversations.updatedAt))
      .limit(20);
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error searching conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /gemini/conversations
router.get("/conversations", async (req, res) => {
  try {
    const results = await db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /gemini/conversations
router.post("/conversations", async (req, res) => {
  try {
    const parsed = CreateGeminiConversationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const userId = (req as any).auth?.userId ?? null;
    const [conversation] = await db
      .insert(conversations)
      .values({ title: parsed.data.title, userId })
      .returning();
    res.status(201).json(conversation);
  } catch (err) {
    req.log.error({ err }, "Error creating conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /gemini/conversations/:id
router.get("/conversations/:id", async (req, res) => {
  try {
    const parsed = GetGeminiConversationParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, parsed.data.id));
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, parsed.data.id))
      .orderBy(messages.createdAt);
    res.json({ ...conversation, messages: msgs });
  } catch (err) {
    req.log.error({ err }, "Error getting conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /gemini/conversations/:id
router.patch("/conversations/:id", async (req, res) => {
  try {
    const paramsParsed = UpdateGeminiConversationParams.safeParse({ id: Number(req.params.id) });
    if (!paramsParsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const bodyParsed = UpdateGeminiConversationBody.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const [updated] = await db
      .update(conversations)
      .set({ title: bodyParsed.data.title, updatedAt: new Date() })
      .where(eq(conversations.id, paramsParsed.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /gemini/conversations/:id
router.delete("/conversations/:id", async (req, res) => {
  try {
    const parsed = DeleteGeminiConversationParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [deleted] = await db
      .delete(conversations)
      .where(eq(conversations.id, parsed.data.id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /gemini/conversations/:id/messages
router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const parsed = ListGeminiMessagesParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, parsed.data.id))
      .orderBy(messages.createdAt);
    res.json(msgs);
  } catch (err) {
    req.log.error({ err }, "Error listing messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

const SYSTEM_PROMPT = `You are Aria, a smart and friendly AI personal assistant. You speak like a knowledgeable friend — casual, warm, and clear. You explain things simply like a great teacher, remember context from the conversation, and give direct, helpful answers. You are supportive, curious, and never condescending. Keep responses concise unless detail is needed. Use markdown formatting for code and structured content. When files are shared with you, analyze and describe their content fully and helpfully. When a YouTube transcript is provided in the context, use it to answer questions about the video accurately and in detail.`;

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

async function buildFileParts(fileIds: number[]): Promise<GeminiPart[]> {
  if (!fileIds.length) return [];

  const files = await db
    .select()
    .from(uploadedFiles)
    .where(inArray(uploadedFiles.id, fileIds));

  const parts: GeminiPart[] = [];

  for (const file of files) {
    if (
      file.mimeType.startsWith("image/") ||
      file.mimeType === "application/pdf"
    ) {
      try {
        const data = fs.readFileSync(file.path).toString("base64");
        parts.push({ inlineData: { mimeType: file.mimeType, data } });
      } catch {
        if (file.extractedText) {
          parts.push({ text: `[File: ${file.originalName}]\n${file.extractedText}` });
        }
      }
    } else if (file.extractedText) {
      parts.push({ text: `[File: ${file.originalName}]\n${file.extractedText}` });
    } else {
      try {
        const text = fs.readFileSync(file.path, "utf-8").slice(0, 50000);
        parts.push({ text: `[File: ${file.originalName}]\n${text}` });
      } catch {
        parts.push({ text: `[File: ${file.originalName} — could not read content]` });
      }
    }
  }

  return parts;
}

// POST /gemini/conversations/:id/messages (SSE streaming)
router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const paramsParsed = SendGeminiMessageParams.safeParse({ id: Number(req.params.id) });
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

    // Verify conversation exists
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Save user message
    await db.insert(messages).values({
      conversationId,
      role: "user",
      content,
      fileIds: fileIds && fileIds.length > 0 ? JSON.stringify(fileIds) : null,
    });

    // Load all previous messages (history before the current one)
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);

    // All messages except the last (just saved) one = chat history
    const historyWithoutCurrent = history.slice(0, -1);

    // Build file parts for the current message
    const fileParts = fileIds && fileIds.length > 0
      ? await buildFileParts(fileIds)
      : [];

    // Fetch YouTube transcripts if any URLs are in the message
    const youtubeContext = await fetchYouTubeTranscripts(content);

    // Current user message parts: files first, then transcript context, then text
    const currentParts: GeminiPart[] = [
      ...fileParts,
      ...(youtubeContext ? [{ text: youtubeContext }] : []),
      ...(content.trim() ? [{ text: content }] : []),
    ];

    // Build full chat history for Gemini
    const chatMessages: { role: "user" | "model"; parts: GeminiPart[] }[] = [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      { role: "model", parts: [{ text: "Got it! I'm Aria, ready to help. What's on your mind?" }] },
      // Previous messages (text only — files already described in prior turns)
      ...historyWithoutCurrent.map((m) => ({
        role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
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
      conversationId,
      role: "assistant",
      content: fullResponse,
      fileIds: null,
    });

    // Count total messages to detect first exchange (user + assistant = 2)
    const allMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    const updateData: { updatedAt: Date; title?: string } = { updatedAt: new Date() };

    if (allMessages.length === 2 && conversation.title === "New Chat") {
      const autoTitle = content.trim().slice(0, 60) + (content.trim().length > 60 ? "…" : "");
      updateData.title = autoTitle;
    }

    await db
      .update(conversations)
      .set(updateData)
      .where(eq(conversations.id, conversationId));

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Error in streaming message");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
      res.end();
    }
  }
});

export default router;
