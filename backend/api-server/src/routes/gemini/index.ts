import { Router } from "express";
import { and, eq, desc, like, inArray, isNotNull, or, isNull, gt, sql, ilike } from "drizzle-orm";
import { fetchYouTubeTranscriptsForMessage } from "../../lib/youtube";
import { processKnowledgeSource } from "../../services/knowledge";
import { db } from "@workspace/db";
import { chatSessions, knowledgeCategories, knowledgeChunks, knowledgeSources, messages, projects } from "@workspace/db";
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

async function userOwnsProject(projectId: string, userId: string) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return Boolean(project);
}

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
      .where(
        and(
          eq(chatSessions.userId, userId),
          or(isNull(chatSessions.expiresAt), gt(chatSessions.expiresAt, new Date()))
        )
      )
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
    if (projectId && !(await userOwnsProject(projectId, userId))) {
      res.status(403).json({ error: "Forbidden: You do not own this project" });
      return;
    }
    const expiresAt = !projectId ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
    const [conversation] = await db
      .insert(chatSessions)
      .values({ title: parsed.data.title, projectId, userId, expiresAt })
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
    if (bodyParsed.data.projectId && !(await userOwnsProject(bodyParsed.data.projectId, userId))) {
      res.status(403).json({ error: "Forbidden: You do not own this project" });
      return;
    }
    const [updated] = await db
      .update(chatSessions)
      .set({ 
        ...(bodyParsed.data.title !== undefined && { title: bodyParsed.data.title }),
        ...(bodyParsed.data.projectId !== undefined && { projectId: bodyParsed.data.projectId })
      })
      .where(eq(chatSessions.id, paramsParsed.data.id))
      .returning();
    res.json(serializeConversation(updated));
  } catch (err) {
    req.log.error({ err }, "Error updating conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /gemini/conversations/:id/favorite
router.patch("/conversations/:id/favorite", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const paramsParsed = UpdateGeminiConversationParams.safeParse({ id: req.params.id });
    if (!paramsParsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const isFavorite = Boolean(req.body.isFavorite);
    const [existing] = await db.select().from(chatSessions).where(eq(chatSessions.id, paramsParsed.data.id));
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ error: "Conversation not found" }); return;
    }
    const updateData: any = { isFavorite };
    if (isFavorite) {
      updateData.expiresAt = null; // Remove auto-delete for favorites
    } else if (!existing.projectId) {
      // Restore auto-delete if it's a normal chat
      updateData.expiresAt = new Date(existing.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
    const [updated] = await db
      .update(chatSessions)
      .set(updateData)
      .where(eq(chatSessions.id, paramsParsed.data.id))
      .returning();
    res.json(serializeConversation(updated));
  } catch (err) {
    req.log.error({ err }, "Error updating conversation favorite");
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

const SYSTEM_PROMPT = `You are Aria, a smart and friendly AI personal assistant. You speak like a knowledgeable friend — casual, warm, and clear. You explain things simply like a great teacher, remember context from the conversation, and give direct, helpful answers. You are supportive, curious, and never condescending. Keep responses concise unless detail is needed. Use markdown formatting for code and structured content. When files are shared with you, analyze and describe their content fully and helpfully. When a YouTube transcript is provided in the context, use it to answer questions about the video accurately and in detail.`;

const PROJECT_BRAIN_DIRECTIVE = `\n\nCRITICAL DIRECTIVE: You are acting as a specific Project Brain. Project Knowledge includes BOTH the project's Knowledge & Instructions text and any retrieved file/chat knowledge chunks supplied in the current message. Treat the Knowledge & Instructions text as authoritative project knowledge, not just behavior guidance. Use all selected projects together; do not ignore later projects when multiple projects are selected. If the user's question cannot be answered using the selected projects' Knowledge & Instructions or retrieved chunks, explicitly state that the answer is not in the selected project knowledge. Then, and only then, you may offer general knowledge, clearly labeled as outside the project's knowledge. Mention the relevant project name when you find the answer in that project's instructions or context.`;

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
    const { content, fileIds, projectIds, useNormalAi } = bodyParsed.data as any;

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

    let primaryProject = null;
    let validProjectIds: string[] = [];

    let dbProjectsList: any[] = [];

    // Prioritize passed projectIds, or fallback to conversation's projectId
    if (projectIds && projectIds.length > 0) {
      dbProjectsList = await db
        .select()
        .from(projects)
        .where(and(inArray(projects.id, projectIds), eq(projects.userId, userId)));
      if (dbProjectsList.length > 0) {
        primaryProject = dbProjectsList[0];
        validProjectIds = dbProjectsList.map((p: any) => p.id);
      }
    } else if (conversation.projectId) {
      const [res] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, conversation.projectId), eq(projects.userId, userId)));
      if (res) {
        dbProjectsList = [res];
        primaryProject = res;
        validProjectIds = [res.id];
      }
    }
    // --- QUICK ADD TO KNOWLEDGE INTERCEPT ---
    const isQuickAdd = /^(add to project|save to knowledge|save this|add this to project|add to knowledge)/i.test(content.trim());
    if (isQuickAdd && primaryProject) {
      const targetProjectId = primaryProject.id;
      const existingCats = await db.select().from(knowledgeCategories).where(eq(knowledgeCategories.projectId, targetProjectId));
      
      const catList = existingCats.map((c: any) => c.name).join(", ");
      
      const prompt = `You are a data extractor. Analyze this text to save to project knowledge.
Existing Categories: ${catList || 'None'}
Text: """${content}"""

Return strictly a JSON object with:
"categoryName": string (best matching from existing, or invent a new concise one)
"isNewCategory": boolean (true if categoryName is not in Existing Categories)
"tags": string (comma separated tags)
"notes": string (summarized notes or original content if brief. Make sure to capture the core info. Also put any secondary links here)
"primaryLink": string | null (extract ONE main link: youtube, github, instagram, or website URL if present, otherwise null)
"sourceType": string (must be exactly one of: "youtube", "github", "instagram", "website", or "note" if no link)`;

      const resAi = await ai.models.generateContent(userId, {
          model: "gemini-2.5-flash",
          contents: prompt
      });

      let extracted = { categoryName: "General", isNewCategory: true, tags: "", notes: content, primaryLink: null, sourceType: "note" };
      try {
          const jsonStr = resAi.text?.replace(/```json/g, '').replace(/```/g, '').trim() || "{}";
          extracted = JSON.parse(jsonStr);
      } catch(e) {
          req.log.warn("Failed to parse Quick Add JSON");
      }
      
      let finalCategoryId;
      const existingMatch = existingCats.find((c: any) => c.name.toLowerCase() === extracted.categoryName.toLowerCase());
      if (extracted.isNewCategory || !existingMatch) {
          const resNewCat = await db.insert(knowledgeCategories).values({
              projectId: targetProjectId,
              name: extracted.categoryName || "General"
          }).returning();
          finalCategoryId = (resNewCat as any[])[0].id;
      } else {
          finalCategoryId = existingMatch.id;
      }
      
      const resRecord = await db.insert(knowledgeSources).values({
          projectId: targetProjectId,
          categoryId: finalCategoryId,
          tag: extracted.tags || null,
          title: "Quick Add Note",
          notes: extracted.notes || content,
          sourceType: extracted.sourceType || "note",
          sourceUrl: extracted.primaryLink || null,
          status: "pending"
      }).returning();
      const record = (resRecord as any[])[0];
      
      // Call process synchronously
      try {
          await processKnowledgeSource(record.id);
      } catch (e) {
          req.log.error({ err: e }, "Failed to process quick add knowledge");
      }
      
      const successMsg = `**Knowledge Added Successfully**\n\n**Category:** ${extracted.categoryName}\n**Tags:** ${extracted.tags || 'None'}`;
      
      // Save user message
      await db.insert(messages).values({
          sessionId: conversationId as any,
          sender: "user",
          content,
      });
      
      // Save assistant message
      await db.insert(messages).values({
          sessionId: conversationId as any,
          sender: "assistant",
          content: successMsg,
      });

      // SSE response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      
      res.write(`data: ${JSON.stringify({ content: successMsg })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return;
    }
    // --- END QUICK ADD ---

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
    const youtubeContext = await fetchYouTubeTranscriptsForMessage(content);

    // Vector Search (RAG)
    let ragContext = "";
    try {
      if (validProjectIds.length > 0) {
        // Keyword extraction for simple keyword matching
        const words = content.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length > 3).slice(0, 5);
        
        // Find exact/partial metadata matches (Category, Tag, Title, Notes)
        let metadataMatches: any[] = [];
        if (words.length > 0) {
          const conditions = words.map((w: string) => 
            or(
              ilike(knowledgeSources.tag, `%${w}%`),
              ilike(knowledgeSources.title, `%${w}%`),
              ilike(knowledgeSources.notes, `%${w}%`)
            )
          );
          
          metadataMatches = await db
            .select({
              id: knowledgeSources.id,
              title: knowledgeSources.title,
              tag: knowledgeSources.tag,
              notes: knowledgeSources.notes,
              sourceType: knowledgeSources.sourceType,
              sourceUrl: knowledgeSources.sourceUrl,
            })
            .from(knowledgeSources)
            .where(and(inArray(knowledgeSources.projectId, validProjectIds), or(...conditions)))
            .limit(5);
        }

        // Vector Search for content matches
        const embedRes = await ai.models.embedContent(userId, {
          model: "gemini-embedding-2",
          contents: content,
          config: { outputDimensionality: 768 },
        });
        const userVector = embedRes.embeddings?.[0]?.values;
        
        let similarChunks: any[] = [];
        if (userVector) {
          similarChunks = await db
            .select({
               chunkText: knowledgeChunks.chunkText,
               sourceId: knowledgeChunks.knowledgeSourceId
            })
            .from(knowledgeChunks)
            .where(and(inArray(knowledgeChunks.projectId, validProjectIds), isNotNull(knowledgeChunks.embedding)))
            .orderBy(sql`${knowledgeChunks.embedding} <=> ${JSON.stringify(userVector)}`)
            .limit(10);
        }
        
        if (metadataMatches.length > 0 || similarChunks.length > 0) {
          ragContext = "Here is the retrieved knowledge from the project (Priority: Meta/Title Matches > Content Matches):\n\n";
          
          if (metadataMatches.length > 0) {
            ragContext += "--- Top Metadata/Title Matches ---\n";
            metadataMatches.forEach((m: any) => {
               ragContext += `Title: ${m.title || 'Untitled'}\nType: ${m.sourceType}\nTags: ${m.tag || 'None'}\nNotes/Summary: ${m.notes || 'None'}\nURL: ${m.sourceUrl || 'N/A'}\n\n`;
            });
          }

          if (similarChunks.length > 0) {
             ragContext += "--- Top Content (Vector) Matches ---\n";
             similarChunks.forEach((c: any) => {
               ragContext += `Content Snippet:\n${c.chunkText}\n\n`;
             });
          }
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

    let finalSystemPrompt = SYSTEM_PROMPT;
    if (validProjectIds.length > 0) {
      const projectPrompts = dbProjectsList.map((p: any) => `Project: ${p.name}\nKnowledge & Instructions:\n${p.systemPrompt}`).join("\n\n---\n\n");
      finalSystemPrompt = `${SYSTEM_PROMPT}\n\nSelected Project Knowledge & Instructions:\n${projectPrompts}\n${PROJECT_BRAIN_DIRECTIVE}`;
    } else {
      finalSystemPrompt = primaryProject?.systemPrompt || SYSTEM_PROMPT;
    }
    
    if (useNormalAi === false && validProjectIds.length === 0) {
       // If somehow no projects selected and normal AI disabled (shouldn't happen in UI)
       finalSystemPrompt += "\n\nCRITICAL DIRECTIVE: You must only answer questions based on the provided context.";
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

    const stream = await ai.models.generateContentStream(userId, {
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
    const isBusy = status === 429 || status === 503 || err?.message?.includes("429") || err?.message?.includes("503");

    if (!res.headersSent) {
      if (isBusy) {
        res.status(503).json({ error: "AI service is temporarily busy. Please try again in a few moments." });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    } else {
      if (isBusy) {
        res.write(`data: ${JSON.stringify({ error: "AI service is temporarily busy. Please try again in a few moments." })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
      }
      res.end();
    }
  }
});

export default router;
