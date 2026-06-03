import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { projects, conversations, messages } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";

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
  const id = Number(req.params.id);
  if (isNaN(id)) {
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
  const id = Number(req.params.id);
  if (isNaN(id)) {
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

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
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
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
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
      .insert(conversations)
      .values({ title: "New Chat", userId: null, projectId: project.id })
      .returning();
    res.status(201).json(conv);
  } catch (err) {
    req.log.error({ err }, "Error creating shared conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /projects/share/:token/conversations/:convId — get conversation + messages
router.get("/share/:token/conversations/:convId", async (req, res) => {
  const convId = Number(req.params.convId);
  if (isNaN(convId)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.shareToken, req.params.token));
    if (!project || !project.isActive) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId));
    if (!conv || conv.projectId !== project.id) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(messages.createdAt);
    res.json({ ...conv, messages: msgs });
  } catch (err) {
    req.log.error({ err }, "Error getting shared conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /projects/share/:token/conversations/:convId/messages — SSE streaming
router.post("/share/:token/conversations/:convId/messages", async (req, res) => {
  const convId = Number(req.params.convId);
  if (isNaN(convId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { content } = req.body as { content?: string };
  if (!content?.trim()) {
    res.status(400).json({ error: "content is required" });
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

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId));
    if (!conv || conv.projectId !== project.id) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Save user message
    await db.insert(messages).values({ conversationId: convId, role: "user", content, fileIds: null });

    // Load chat history
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(messages.createdAt);

    const historyWithoutCurrent = history.slice(0, -1);

    // Build Gemini chat with project's systemPrompt as knowledge base
    const chatMessages: { role: "user" | "model"; parts: { text: string }[] }[] = [
      { role: "user", parts: [{ text: project.systemPrompt }] },
      { role: "model", parts: [{ text: "Understood! I'm ready to help based on the provided information. What would you like to know?" }] },
      ...historyWithoutCurrent.map((m) => ({
        role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: [{ text: content }] },
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
    await db.insert(messages).values({ conversationId: convId, role: "assistant", content: fullResponse, fileIds: null });

    // Auto-title after first exchange
    const allMsgs = await db.select().from(messages).where(eq(messages.conversationId, convId));
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (allMsgs.length === 2 && conv.title === "New Chat") {
      updateData.title = content.trim().slice(0, 60) + (content.trim().length > 60 ? "…" : "");
    }
    await db.update(conversations).set(updateData).where(eq(conversations.id, convId));

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
