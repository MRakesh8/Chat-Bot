import { Router } from "express";
import { db, userApiKeys, crypto, userApiSettings } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { z } from "zod";
import { ProviderVerifier } from "../../services/provider-verifier";
import { updateKeyStats } from "../../services/api-health";

const router = Router();

const AddKeyBody = z.object({
  name: z.string().max(255).optional(),
  apiKey: z.string().min(1),
  provider: z.string().optional(),
});

const UpdateKeyBody = z.object({
  name: z.string().max(255).optional(),
  apiKey: z.string().optional(),
  provider: z.string().optional(),
});

const ValidateKeyBody = z.object({
  apiKey: z.string().min(1),
  provider: z.string().optional(),
});

const UpdateSettingsBody = z.object({
  apiMode: z.enum(["auto", "user_first", "system_first"]).optional(),
  chatHistoryRetentionDays: z.number().int().min(-1).optional(),
});

// Helper for secure masking
function maskKey(key: string, provider?: string): string {
  const trimmed = key.trim();
  if (provider === "gemini" || trimmed.startsWith("AIza")) {
    return `AIza****${trimmed.slice(-4)}`;
  }
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 5)}...${trimmed.slice(-4)}`;
}

// GET /api/api-keys/settings
router.get("/settings", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    let settings = await db.select().from(userApiSettings).where(eq(userApiSettings.userId, userId));
    if (settings.length === 0) {
      const [newSettings] = await db.insert(userApiSettings).values({ userId, apiMode: "auto" }).returning();
      return res.json(newSettings);
    }
    res.json(settings[0]);
  } catch (err: any) {
    req.log.error({ err }, "Failed to fetch API settings");
    res.status(500).json({ error: "Failed to fetch API settings" });
  }
});

// PUT /api/api-keys/settings
router.put("/settings", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = UpdateSettingsBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

    const updateData: any = {};
    if (parsed.data.apiMode) updateData.apiMode = parsed.data.apiMode;
    if (parsed.data.chatHistoryRetentionDays !== undefined) updateData.chatHistoryRetentionDays = parsed.data.chatHistoryRetentionDays;

    await db.insert(userApiSettings)
      .values({ userId, ...updateData })
      .onConflictDoUpdate({
        target: userApiSettings.userId,
        set: updateData
      });

    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Failed to update API settings");
    res.status(500).json({ error: "Failed to update API settings" });
  }
});

// GET /api/api-keys
// List all user keys (always returning masked keys)
router.get("/", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const keys = await db.select().from(userApiKeys).where(eq(userApiKeys.userId, userId));
    const safeKeys = keys.map(k => ({
      id: k.id,
      name: k.name,
      provider: k.provider,
      maskedKey: k.maskedKey,
      isPrimary: k.isPrimary,
      isEnabled: k.isEnabled,
      status: k.status,
      healthScore: k.healthScore || 100,
      latencyMs: k.latencyMs || 0,
      totalRequests: k.totalRequests || 0,
      totalFailures: k.totalFailures || 0,
      tokensToday: k.tokensToday || 0,
      availableModels: k.availableModels || [],
      lastSuccess: k.lastSuccess,
      lastFailure: k.lastFailure,
      failureReason: k.failureReason,
      cooldownUntil: k.cooldownUntil,
      cooldownRemaining: k.cooldownUntil && k.cooldownUntil.getTime() > Date.now() 
        ? Math.ceil((k.cooldownUntil.getTime() - Date.now()) / 60000) 
        : 0,
      createdAt: k.createdAt,
    }));

    res.json(safeKeys);
  } catch (err: any) {
    req.log.error({ err }, "Failed to fetch API keys");
    res.status(500).json({ error: "Failed to fetch API keys" });
  }
});

// POST /api/api-keys/validate
// Validate an API key against the provider without storing it
router.post("/validate", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = ValidateKeyBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "API Key is required" });

    try {
      const verified = await ProviderVerifier.verifyAndFetchModels(parsed.data.apiKey, parsed.data.provider);
      return res.json({
        valid: true,
        provider: verified.provider,
        defaultModel: verified.defaultModel,
        models: verified.models,
        maskedKey: maskKey(parsed.data.apiKey, verified.provider),
      });
    } catch (err: any) {
      return res.status(400).json({
        valid: false,
        error: err.message || "Failed to verify API key with provider.",
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Internal error during key validation" });
  }
});

// POST /api/api-keys
// Add a new user API key (max 5)
router.post("/", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = AddKeyBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

    const existingKeys = await db.select().from(userApiKeys).where(eq(userApiKeys.userId, userId));
    if (existingKeys.length >= 5) return res.status(400).json({ error: "Maximum of 5 user API keys allowed" });

    // Duplicate detection based on raw key BEFORE storing
    const isDuplicate = existingKeys.some(k => {
      try {
        const decrypted = crypto.decrypt(k.encryptedKey);
        return decrypted === parsed.data.apiKey;
      } catch {
        return false;
      }
    });

    if (isDuplicate) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_KEY",
        message: "This API key already exists in your workspace."
      });
    }

    try {
      const verified = await ProviderVerifier.verifyAndFetchModels(parsed.data.apiKey, parsed.data.provider);
      const encryptedKey = crypto.encrypt(parsed.data.apiKey);
      const maskedKey = maskKey(parsed.data.apiKey, verified.provider);

      await db.insert(userApiKeys).values({
        userId,
        name: parsed.data.name || `${verified.provider.toUpperCase()} Key ${existingKeys.length + 1}`,
        provider: verified.provider,
        encryptedKey,
        maskedKey,
        availableModels: verified.models,
        isSystem: false,
        isPrimary: existingKeys.length === 0,
        isEnabled: true,
        status: "HEALTHY",
        lastSuccess: new Date(),
        healthScore: 100,
        latencyMs: 0,
        totalRequests: 0,
        totalFailures: 0,
      });

      res.status(201).json({ 
        success: true, 
        message: "API key added and verified successfully.", 
        provider: verified.provider, 
        defaultModel: verified.defaultModel,
        models: verified.models 
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to verify API key with provider" });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Failed to add API key" });
  }
});

// PUT /api/api-keys/:id
// Update an existing key (name or replace secret key)
router.put("/:id", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = UpdateKeyBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

    const existing = await db.select().from(userApiKeys).where(and(eq(userApiKeys.id, id), eq(userApiKeys.userId, userId)));
    if (!existing.length) return res.status(404).json({ error: "Key not found" });

    let updateData: any = {};
    if (parsed.data.name) updateData.name = parsed.data.name;

    if (parsed.data.apiKey) {
      try {
        const verified = await ProviderVerifier.verifyAndFetchModels(parsed.data.apiKey, parsed.data.provider);
        updateData.encryptedKey = crypto.encrypt(parsed.data.apiKey);
        updateData.maskedKey = maskKey(parsed.data.apiKey, verified.provider);
        updateData.status = "HEALTHY";
        updateData.lastSuccess = new Date();
        updateData.isEnabled = true;
        updateData.failureReason = null;
        updateData.cooldownUntil = null;
        updateData.provider = verified.provider;
        updateData.availableModels = verified.models;
      } catch (e: any) {
        return res.status(400).json({ error: e.message || "Failed to verify replacement API key" });
      }
    }

    await db.update(userApiKeys).set(updateData).where(eq(userApiKeys.id, id));
    res.json({ success: true, message: "API key updated successfully." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update API key" });
  }
});

// DELETE /api/api-keys/:id
router.delete("/:id", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const [deleted] = await db.delete(userApiKeys).where(and(eq(userApiKeys.id, id), eq(userApiKeys.userId, userId))).returning();
    if (!deleted) return res.status(404).json({ error: "API key not found" });

    res.status(200).json({ success: true, message: "API key deleted successfully." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete API key" });
  }
});

// POST /api/api-keys/:id/verify
// Re-verify a configured user API key against the provider
router.post("/:id/verify", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    const keyId = req.params.id;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const key = await db.query.userApiKeys.findFirst({
      where: and(eq(userApiKeys.id, keyId), eq(userApiKeys.userId, userId))
    });

    if (!key) return res.status(404).json({ error: "API Key not found" });

    const decryptedKey = crypto.decrypt(key.encryptedKey);
    if (!decryptedKey) {
      return res.status(422).json({
        error: "Unable to decrypt stored API key. Please verify that the correct ENCRYPTION_KEY is configured on the server.",
        code: "DECRYPTION_FAILED"
      });
    }
    const startTime = Date.now();

    const keyObj = {
      id: key.id,
      type: 'user' as const,
      provider: key.provider,
      rawDbKey: key
    };

    try {
      const verified = await ProviderVerifier.verifyAndFetchModels(decryptedKey, key.provider);
      const latencyMs = Date.now() - startTime;

      await updateKeyStats({
        key: keyObj,
        success: true,
        latencyMs,
        status: "HEALTHY",
        model: verified.defaultModel || "unknown"
      });
      
      if (verified.models && verified.models.length > 0) {
        await db.update(userApiKeys).set({ availableModels: verified.models }).where(eq(userApiKeys.id, key.id));
      }

      res.json({ success: true, status: "HEALTHY", models: verified.models, defaultModel: verified.defaultModel });
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      await updateKeyStats({
        key: keyObj,
        success: false,
        latencyMs,
        status: "INVALID_API_KEY",
        error: e,
        model: "unknown"
      });
      res.status(400).json({ error: e.message || "Failed to verify API key" });
    }
  } catch (err: any) {
    req.log.error({ err }, "Failed to verify API key");
    res.status(500).json({ error: "Failed to verify API key" });
  }
});

// POST /api/api-keys/:id/reset-cooldown
// Clear cooldown when a user addresses rate limits or quota issues
router.post("/:id/reset-cooldown", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await db.update(userApiKeys).set({
      cooldownUntil: null,
      status: "HEALTHY",
      failureReason: null
    }).where(and(eq(userApiKeys.id, id), eq(userApiKeys.userId, userId)));

    res.json({ success: true, message: "Cooldown cleared successfully." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to clear cooldown" });
  }
});

// PATCH /api/api-keys/:id/enable
router.patch("/:id/enable", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await db.update(userApiKeys).set({ isEnabled: true, status: "HEALTHY", failureReason: null }).where(and(eq(userApiKeys.id, id), eq(userApiKeys.userId, userId)));
    res.json({ success: true, message: "Key enabled." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to enable API key" });
  }
});

// PATCH /api/api-keys/:id/disable
router.patch("/:id/disable", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await db.update(userApiKeys).set({ isEnabled: false, status: "DISABLED" }).where(and(eq(userApiKeys.id, id), eq(userApiKeys.userId, userId)));
    res.json({ success: true, message: "Key disabled." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to disable API key" });
  }
});

// PATCH /api/api-keys/:id/primary
router.patch("/:id/primary", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    
    // Set all others to false
    await db.update(userApiKeys).set({ isPrimary: false }).where(and(eq(userApiKeys.userId, userId), ne(userApiKeys.id, id)));
    // Set target to true
    await db.update(userApiKeys).set({ isPrimary: true }).where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.id, id)));
    
    res.json({ success: true, message: "Primary key updated." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update primary key" });
  }
});

export default router;
