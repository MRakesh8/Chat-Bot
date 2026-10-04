import { Router } from "express";
import { db, userApiKeys, crypto, userApiSettings } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

const router = Router();

const AddKeyBody = z.object({
  name: z.string().max(255).optional(),
  apiKey: z.string().min(1),
});

const UpdateKeyBody = z.object({
  name: z.string().max(255).optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

const UpdateSettingsBody = z.object({
  apiMode: z.enum(["auto", "user_first", "system_first"]).optional(),
  chatHistoryRetentionDays: z.number().int().min(-1).optional(),
});

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

// Test API Key logic
async function testGeminiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const verified = await ProviderVerifier.verifyAndFetchModels(apiKey, "gemini");
    const candidateModels = verified.models.length > 0 ? verified.models : [verified.defaultModel];
    
    const httpOptions: any = {};
    if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
      httpOptions.baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '');
    }
    const client = new GoogleGenAI({ 
      apiKey, 
      ...(Object.keys(httpOptions).length > 0 ? { httpOptions } : {})
    });
    
    let lastError: any = null;
    for (const targetModel of candidateModels) {
      try {
        await client.models.generateContent({ model: targetModel, contents: "test" });
        return { success: true, message: `API key verified successfully using model ${targetModel}.` };
      } catch (e: any) {
        lastError = e;
        const status = e?.status || e?.response?.status || e?.code;
        const isRateLimit = status === 429 || e?.message?.includes("429") || e?.message?.toLowerCase().includes("quota");
        if (isRateLimit) return { success: true, message: "API key is valid (Quota Exceeded)" };
      }
    }
    return { success: false, message: lastError?.message || "Invalid API key." };
  } catch (e: any) {
    const status = e?.status || e?.response?.status || e?.code;
    const isRateLimit = status === 429 || e?.message?.includes("429");
    if (isRateLimit) return { success: true, message: "API key is valid (Quota Exceeded)" };
    return { success: false, message: e?.message || "Invalid API key." };
  }
}

// GET /api/api-keys
// List all user keys
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
      model: null,
      availableModels: k.availableModels,
      lastSuccess: k.lastSuccess,
      lastFailure: k.lastFailure,
      failureReason: k.failureReason,
      cooldownRemaining: k.cooldownUntil && k.cooldownUntil.getTime() > Date.now() ? Math.ceil((k.cooldownUntil.getTime() - Date.now()) / 60000) : 0,
      createdAt: k.createdAt,
    }));

    res.json(safeKeys);
  } catch (err: any) {
    req.log.error({ err }, "Failed to fetch API keys");
    res.status(500).json({ error: "Failed to fetch API keys" });
  }
});

// GET /api/api-keys/debug
// Diagnostic endpoint for API keys
router.get("/debug", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const keys = await db.select().from(userApiKeys).where(eq(userApiKeys.userId, userId));
    res.json({
      userId,
      keyCount: keys.length,
      keys: keys.map(k => ({
        id: k.id,
        name: k.name,
        provider: k.provider,
        status: k.status,
        maskedKey: k.maskedKey
      }))
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to debug API keys");
    res.status(500).json({ error: "Failed to debug API keys" });
  }
});

import { ProviderVerifier } from "../../services/provider-verifier";
import { updateKeyStats } from "../../services/api-health";

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

    // Duplicate detection based on raw key BEFORE testing
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
        message: "This API key already exists."
      });
    }

    try {
      const verified = await ProviderVerifier.verifyAndFetchModels(parsed.data.apiKey);

      const encryptedKey = crypto.encrypt(parsed.data.apiKey);
      let maskedKey = parsed.data.apiKey.substring(0, 5) + "..." + parsed.data.apiKey.substring(parsed.data.apiKey.length - 4);
      if (verified.provider === "gemini") {
        maskedKey = `AIza****${parsed.data.apiKey.slice(-4)}`;
      }

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
      });

      res.status(201).json({ success: true, message: "API key added successfully.", provider: verified.provider, models: verified.models });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to verify API key" });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Failed to add API key" });
  }
});

// PUT /api/api-keys/:id
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

    // user_api_keys table does not have a model column; ignoring model updates

    if (parsed.data.apiKey) {
      try {
        const verified = await ProviderVerifier.verifyAndFetchModels(parsed.data.apiKey);
        updateData.encryptedKey = crypto.encrypt(parsed.data.apiKey);
        updateData.maskedKey = parsed.data.apiKey.substring(0, 5) + "..." + parsed.data.apiKey.substring(parsed.data.apiKey.length - 4);
        if (verified.provider === "gemini") {
          updateData.maskedKey = `AIza****${parsed.data.apiKey.slice(-4)}`;
        }
        updateData.status = "HEALTHY";
        updateData.lastSuccess = new Date();
        updateData.isEnabled = true;
        updateData.failureReason = null;
        updateData.provider = verified.provider;
        updateData.availableModels = verified.models;
      } catch (e: any) {
        return res.status(400).json({ error: e.message || "Failed to verify API key" });
      }
    }

    await db.update(userApiKeys).set(updateData).where(eq(userApiKeys.id, id));
    res.json({ success: true, message: "API key updated." });
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

    res.status(200).json({ success: true, message: "API key deleted." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete API key" });
  }
});

// POST /api/api-keys/:id/test
router.post("/:id/test", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const existing = await db.select().from(userApiKeys).where(and(eq(userApiKeys.id, id), eq(userApiKeys.userId, userId)));
    if (!existing.length) return res.status(404).json({ error: "Key not found" });

    const decryptedKey = crypto.decrypt(existing[0].encryptedKey);
    
    try {
      const verified = await ProviderVerifier.verifyAndFetchModels(decryptedKey || existing[0].encryptedKey, existing[0].provider);
      await db.update(userApiKeys).set({ 
        status: "HEALTHY", 
        isEnabled: true, 
        lastSuccess: new Date(), 
        failureReason: null,
        availableModels: verified.models
      }).where(eq(userApiKeys.id, id));
      res.json({ status: "Healthy", models: verified.models });
    } catch (e: any) {
      const msg = e.message || "Invalid API key";
      if (msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("429")) {
        await db.update(userApiKeys).set({ status: "QUOTA_EXCEEDED", failureReason: msg }).where(eq(userApiKeys.id, id));
        res.json({ status: "Quota Exceeded" });
      } else {
        await db.update(userApiKeys).set({ status: "INVALID", isEnabled: false, failureReason: msg }).where(eq(userApiKeys.id, id));
        res.json({ status: "Invalid" });
      }
    }
  } catch (err: any) {
    res.status(500).json({ error: "Failed to test API key" });
  }
});

// POST /api/api-keys/:id/refresh-models
router.post("/:id/refresh-models", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const existing = await db.select().from(userApiKeys).where(and(eq(userApiKeys.id, id), eq(userApiKeys.userId, userId)));
    if (!existing.length) return res.status(404).json({ error: "Key not found" });

    const decryptedKey = crypto.decrypt(existing[0].encryptedKey);
    
    try {
      const verified = await ProviderVerifier.verifyAndFetchModels(decryptedKey || existing[0].encryptedKey, existing[0].provider);
      await db.update(userApiKeys).set({ 
        availableModels: verified.models
      }).where(eq(userApiKeys.id, id));
      
      res.json({ success: true, models: verified.models });
    } catch (e: any) {
      return res.status(400).json({ error: e.message || "Failed to refresh models." });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Server error during model refresh" });
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



// Verify API Key
router.post("/:id/verify", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    const keyId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const key = await db.query.userApiKeys.findFirst({
      where: and(eq(userApiKeys.id, keyId), eq(userApiKeys.userId, userId))
    });

    if (!key) {
      return res.status(404).json({ error: "API Key not found" });
    }

    const decryptedKey = crypto.decrypt(key.encryptedKey);
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

      res.json({ success: true, models: verified.models, defaultModel: verified.defaultModel });
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
    console.error("Failed to verify API key:", err);
    res.status(500).json({ error: "Failed to verify API key" });
  }
});
export default router;

/*
// PUT /api/api-keys/:id
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

    if (parsed.data.model) {
      if (existing[0].availableModels && Array.isArray(existing[0].availableModels)) {
        if (!existing[0].availableModels.includes(parsed.data.model)) {
          return res.status(400).json({ error: `Model ${parsed.data.model} is not supported by this API key.` });
        }
      }
      updateData.model = parsed.data.model;
    }

    if (parsed.data.apiKey) {
      try {
        const verified = await ProviderVerifier.verifyAndFetchModels(parsed.data.apiKey);
        updateData.encryptedKey = crypto.encrypt(parsed.data.apiKey);
        updateData.maskedKey = parsed.data.apiKey.substring(0, 5) + "..." + parsed.data.apiKey.substring(parsed.data.apiKey.length - 4);
        if (verified.provider === "gemini") {
          updateData.maskedKey = `AIza****${parsed.data.apiKey.slice(-4)}`;
        }
        updateData.status = "HEALTHY";
        updateData.lastSuccess = new Date();
        updateData.isEnabled = true;
        updateData.failureReason = null;
        updateData.provider = verified.provider;
        updateData.availableModels = verified.models;
      } catch (e: any) {
        return res.status(400).json({ error: e.message || "Failed to verify API key" });
      }
    }

    await db.update(userApiKeys).set(updateData).where(eq(userApiKeys.id, id));
    res.json({ success: true, message: "API key updated." });
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

    res.status(200).json({ success: true, message: "API key deleted." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete API key" });
  }
});

// POST /api/api-keys/:id/test
router.post("/:id/test", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const existing = await db.select().from(userApiKeys).where(and(eq(userApiKeys.id, id), eq(userApiKeys.userId, userId)));
    if (!existing.length) return res.status(404).json({ error: "Key not found" });

    const decryptedKey = crypto.decrypt(existing[0].encryptedKey);
    
    try {
      const verified = await ProviderVerifier.verifyAndFetchModels(decryptedKey || existing[0].encryptedKey, existing[0].provider);
      await db.update(userApiKeys).set({ 
        status: "HEALTHY", 
        isEnabled: true, 
        lastSuccess: new Date(), 
        failureReason: null,
        availableModels: verified.models
      }).where(eq(userApiKeys.id, id));
      res.json({ status: "Healthy", models: verified.models });
    } catch (e: any) {
      const msg = e.message || "Invalid API key";
      if (msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("429")) {
        await db.update(userApiKeys).set({ status: "QUOTA_EXCEEDED", failureReason: msg }).where(eq(userApiKeys.id, id));
        res.json({ status: "Quota Exceeded" });
      } else {
        await db.update(userApiKeys).set({ status: "INVALID", isEnabled: false, failureReason: msg }).where(eq(userApiKeys.id, id));
        res.json({ status: "Invalid" });
      }
    }
  } catch (err: any) {
    res.status(500).json({ error: "Failed to test API key" });
  }
});

// POST /api/api-keys/:id/refresh-models
router.post("/:id/refresh-models", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const existing = await db.select().from(userApiKeys).where(and(eq(userApiKeys.id, id), eq(userApiKeys.userId, userId)));
    if (!existing.length) return res.status(404).json({ error: "Key not found" });

    const decryptedKey = crypto.decrypt(existing[0].encryptedKey);
    
    try {
      const verified = await ProviderVerifier.verifyAndFetchModels(decryptedKey || existing[0].encryptedKey, existing[0].provider);
      await db.update(userApiKeys).set({ 
        availableModels: verified.models
      }).where(eq(userApiKeys.id, id));
      
      res.json({ success: true, models: verified.models });
    } catch (e: any) {
      return res.status(400).json({ error: e.message || "Failed to refresh models." });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Server error during model refresh" });
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

import { ProviderVerifier } from "../../services/provider-verifier";
import { updateKeyStats } from "../../services/api-health";

// Verify API Key
router.post("/:id/verify", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    const keyId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const key = await db.query.userApiKeys.findFirst({
      where: and(eq(userApiKeys.id, keyId), eq(userApiKeys.userId, userId))
    });

    if (!key) {
      return res.status(404).json({ error: "API Key not found" });
    }

    const decryptedKey = crypto.decrypt(key.encryptedKey);
    const verifier = new ProviderVerifier(key.provider, decryptedKey);
    
    const startTime = Date.now();
    const result = await verifier.verify();
    const latencyMs = Date.now() - startTime;

    const keyObj = {
      id: key.id,
      type: 'user' as const,
      provider: key.provider,
      rawDbKey: key
    };

    if (result.valid) {
      await updateKeyStats({
        key: keyObj,
        success: true,
        latencyMs,
        status: "HEALTHY",
        model: result.defaultModel || "unknown"
      });
      
      if (result.models && result.models.length > 0) {
        await db.update(userApiKeys).set({ availableModels: result.models }).where(eq(userApiKeys.id, key.id));
      }

      res.json({ success: true, models: result.models, defaultModel: result.defaultModel });
    } else {
      await updateKeyStats({
        key: keyObj,
        success: false,
        latencyMs,
        status: "INVALID_API_KEY",
        error: new Error(result.error),
        model: "unknown"
      });
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error("Failed to verify API key:", err);
    res.status(500).json({ error: "Failed to verify API key" });
  }
});

*/
