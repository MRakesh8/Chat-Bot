import { Router } from "express";
import { db, apiKeys, userApiSettings } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const AddKeyBody = z.object({
  keyName: z.string().max(255).optional(),
  apiKey: z.string().min(1),
});

const UpdateModeBody = z.object({
  apiMode: z.enum(["auto", "user_first", "system_first"]),
});

// GET /api/api-keys
// List all user keys and their mode
router.get("/", async (req, res) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const keys = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
    const [settings] = await db.select().from(userApiSettings).where(eq(userApiSettings.userId, userId));

    const safeKeys = keys.map(k => ({
      id: k.id,
      keyName: k.keyName,
      // Only show the last 4 characters of the API key
      apiKeyEnding: k.apiKey.slice(-4),
      status: k.status,
      createdAt: k.createdAt,
    }));

    res.json({
      keys: safeKeys,
      mode: settings?.apiMode || "auto",
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch API keys" });
  }
});

// POST /api/api-keys
// Add a new user API key (max 3)
router.post("/", async (req, res) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = AddKeyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const existingKeys = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
    if (existingKeys.length >= 3) {
      res.status(400).json({ error: "Maximum of 3 user API keys allowed" });
      return;
    }

    const [newKey] = await db.insert(apiKeys).values({
      userId,
      keyName: parsed.data.keyName || `User Key ${existingKeys.length + 1}`,
      apiKey: parsed.data.apiKey,
      isSystem: false,
      dailyLimit: null, // No limit for user keys
      status: "healthy",
    }).returning();

    res.status(201).json({
      id: newKey.id,
      keyName: newKey.keyName,
      apiKeyEnding: newKey.apiKey.slice(-4),
      status: newKey.status,
      createdAt: newKey.createdAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to add API key" });
  }
});

// DELETE /api/api-keys/:id
// Delete a user API key
router.delete("/:id", async (req, res) => {
  try {
    const userId = (req as any).auth?.userId;
    const { id } = req.params;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [deleted] = await db.delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "API key not found" });
      return;
    }

    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete API key" });
  }
});

// PATCH /api/api-keys/settings
// Update API mode
router.patch("/settings", async (req, res) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = UpdateModeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid API mode" });
      return;
    }

    const [settings] = await db.select().from(userApiSettings).where(eq(userApiSettings.userId, userId));
    
    if (settings) {
      await db.update(userApiSettings).set({ apiMode: parsed.data.apiMode }).where(eq(userApiSettings.userId, userId));
    } else {
      await db.insert(userApiSettings).values({ userId, apiMode: parsed.data.apiMode });
    }

    res.json({ mode: parsed.data.apiMode });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update API settings" });
  }
});

export default router;
